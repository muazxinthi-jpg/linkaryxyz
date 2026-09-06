import type { Env } from '../env';
import { ServiceConfigurationError } from '../env';

export type AiProvider = 'workers_ai' | 'gemini' | 'groq' | 'openrouter';

export type LinkaryAiPrompt = {
  system: string;
  user: string;
};

export type LinkaryAiResult = {
  provider: AiProvider;
  model: string;
  text: string;
  inputUnits: number | null;
  outputUnits: number | null;
  latencyMs: number;
};

type ProviderChoice = { provider: AiProvider; model: string };

type OpenAiLikePayload = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
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

export function configuredAiProviders(env: Env): ProviderChoice[] {
  const providers: ProviderChoice[] = [];
  if (env.AI) providers.push({ provider: 'workers_ai', model: modelValue(env.AI_WORKERS_MODEL) || WORKERS_DEFAULT_MODEL });
  const geminiModel = modelValue(env.AI_GEMINI_MODEL);
  if (env.GEMINI_API_KEY?.trim() && geminiModel) providers.push({ provider: 'gemini', model: geminiModel });
  const groqModel = modelValue(env.AI_GROQ_MODEL);
  if (env.GROQ_API_KEY?.trim() && groqModel) providers.push({ provider: 'groq', model: groqModel });
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
      stream: false,
    });
  } catch {
    throw new LinkaryAiProviderError('workers_ai');
  }
  const text = workersText(payload);
  if (!text) throw new LinkaryAiProviderError('workers_ai');
  return { text, ...workersUsage(payload) };
}

async function runGemini(env: Env, model: string, prompt: LinkaryAiPrompt): Promise<{ text: string; inputUnits: number | null; outputUnits: number | null }> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new LinkaryAiProviderError('gemini');
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      }),
    });
  } catch {
    throw new LinkaryAiProviderError('gemini');
  }
  if (!response.ok) throw new LinkaryAiProviderError('gemini', response.status);
  const payload = await response.json() as GeminiPayload;
  const text = cleanText(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''));
  if (!text) throw new LinkaryAiProviderError('gemini', response.status);
  return {
    text,
    inputUnits: positiveInt(payload.usageMetadata?.promptTokenCount),
    outputUnits: positiveInt(payload.usageMetadata?.candidatesTokenCount),
  };
}

async function runOpenAiCompatible(
  provider: 'groq' | 'openrouter',
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  prompt: LinkaryAiPrompt,
): Promise<{ text: string; inputUnits: number | null; outputUnits: number | null }> {
  const key = apiKey?.trim();
  if (!key) throw new LinkaryAiProviderError(provider);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...(provider === 'openrouter' ? { 'x-title': 'Linkary' } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
  } catch {
    throw new LinkaryAiProviderError(provider);
  }
  if (!response.ok) throw new LinkaryAiProviderError(provider, response.status);
  const payload = await response.json() as OpenAiLikePayload;
  const text = cleanText(payload.choices?.[0]?.message?.content);
  if (!text) throw new LinkaryAiProviderError(provider, response.status);
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

  async generate(prompt: LinkaryAiPrompt): Promise<LinkaryAiResult> {
    const selected = this.provider();
    const started = Date.now();
    let result: { text: string; inputUnits: number | null; outputUnits: number | null };
    if (selected.provider === 'workers_ai') {
      result = await runWorkers(this.env, selected.model, prompt);
    } else if (selected.provider === 'gemini') {
      result = await runGemini(this.env, selected.model, prompt);
    } else if (selected.provider === 'groq') {
      result = await runOpenAiCompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', this.env.GROQ_API_KEY, selected.model, prompt);
    } else {
      result = await runOpenAiCompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions', this.env.OPENROUTER_API_KEY, selected.model, prompt);
    }
    return {
      provider: selected.provider,
      model: selected.model,
      text: result.text,
      inputUnits: result.inputUnits,
      outputUnits: result.outputUnits,
      latencyMs: Math.max(0, Date.now() - started),
    };
  }
}
