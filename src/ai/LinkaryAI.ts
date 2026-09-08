import type { Env } from '../env';
import { ServiceConfigurationError } from '../env';

export type AiProvider = 'workers_ai' | 'openrouter';

export type LinkaryAiPrompt = {
  system: string;
  user: string;
  maxOutputTokens: number;
};

export type LinkaryAiResult = {
  provider: AiProvider;
  model: string;
  text: string;
  inputUnits: number | null;
  outputUnits: number | null;
  latencyMs: number;
};

export type ProviderChoice = { provider: AiProvider; model: string };

type OpenAiLikePayload = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
};

export class LinkaryAiProviderError extends Error {
  readonly code = 'ai_provider_unavailable';

  constructor(readonly provider: AiProvider, readonly status: number | null = null) {
    super('Linkary AI provider is temporarily unavailable');
  }
}

const WORKERS_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function workersText(payload: unknown): string | null {
  if (typeof payload === 'string') return cleanText(payload);
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  return cleanText(row.response) || cleanText(row.result) || cleanText(row.text);
}

function workersUsage(payload: unknown): { inputUnits: number | null; outputUnits: number | null } {
  if (!payload || typeof payload !== 'object') return { inputUnits: null, outputUnits: null };
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== 'object') return { inputUnits: null, outputUnits: null };
  const row = usage as Record<string, unknown>;
  return {
    inputUnits: positiveInt(row.prompt_tokens) ?? positiveInt(row.input_tokens) ?? positiveInt(row.inputTokens),
    outputUnits: positiveInt(row.completion_tokens) ?? positiveInt(row.output_tokens) ?? positiveInt(row.outputTokens),
  };
}

function modelValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

// Compatibility helper for the migration-safe pre-0042 path. The governed
// runtime uses providerRouting.ts after migration 0042 is present.
export function configuredAiProviders(env: Env): ProviderChoice[] {
  const providers: ProviderChoice[] = [];
  if (env.AI) providers.push({ provider: 'workers_ai', model: modelValue(env.AI_WORKERS_MODEL) || WORKERS_DEFAULT_MODEL });
  const openRouterModel = modelValue(env.AI_OPENROUTER_MODEL);
  if (env.OPENROUTER_API_KEY?.trim() && openRouterModel) providers.push({ provider: 'openrouter', model: openRouterModel });
  return providers;
}

export function selectedAiProvider(env: Env): ProviderChoice {
  const provider = configuredAiProviders(env)[0];
  if (!provider) throw new ServiceConfigurationError('No Linkary AI provider is configured');
  return provider;
}

async function runWorkers(env: Env, model: string, prompt: LinkaryAiPrompt): Promise<{ text: string; inputUnits: number | null; outputUnits: number | null }> {
  if (!env.AI) throw new LinkaryAiProviderError('workers_ai');
  let payload: unknown;
  try {
    payload = await env.AI.run(model, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: prompt.maxOutputTokens,
      stream: false,
    });
  } catch {
    throw new LinkaryAiProviderError('workers_ai');
  }
  const text = workersText(payload);
  if (!text) throw new LinkaryAiProviderError('workers_ai');
  return { text, ...workersUsage(payload) };
}

async function runOpenRouter(
  env: Env,
  model: string,
  prompt: LinkaryAiPrompt,
): Promise<{ text: string; inputUnits: number | null; outputUnits: number | null }> {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new LinkaryAiProviderError('openrouter');
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'x-title': 'Linkary',
      },
      body: JSON.stringify({
        model,
        max_tokens: prompt.maxOutputTokens,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
  } catch {
    throw new LinkaryAiProviderError('openrouter');
  }
  if (!response.ok) throw new LinkaryAiProviderError('openrouter', response.status);
  const payload = await response.json() as OpenAiLikePayload;
  const text = cleanText(payload.choices?.[0]?.message?.content);
  if (!text) throw new LinkaryAiProviderError('openrouter', response.status);
  return {
    text,
    inputUnits: positiveInt(payload.usage?.prompt_tokens) ?? positiveInt(payload.usage?.input_tokens),
    outputUnits: positiveInt(payload.usage?.completion_tokens) ?? positiveInt(payload.usage?.output_tokens),
  };
}

export class LinkaryAI {
  constructor(private readonly env: Env) {}

  provider(): ProviderChoice {
    return selectedAiProvider(this.env);
  }

  async generateWithProvider(selected: ProviderChoice, prompt: LinkaryAiPrompt): Promise<LinkaryAiResult> {
    const started = Date.now();
    const result = selected.provider === 'workers_ai'
      ? await runWorkers(this.env, selected.model, prompt)
      : await runOpenRouter(this.env, selected.model, prompt);
    return {
      provider: selected.provider,
      model: selected.model,
      text: result.text,
      inputUnits: result.inputUnits,
      outputUnits: result.outputUnits,
      latencyMs: Math.max(0, Date.now() - started),
    };
  }

  async generate(prompt: LinkaryAiPrompt): Promise<LinkaryAiResult> {
    return this.generateWithProvider(this.provider(), prompt);
  }
}
