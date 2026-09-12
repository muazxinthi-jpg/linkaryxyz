import type { Env } from '../env';
import { ServiceConfigurationError } from '../env';

export type AiProvider = 'workers_ai' | 'gemini' | 'groq' | 'openrouter';

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

export type AiProviderProbe = {
  provider: AiProvider;
  model: string;
  healthy: boolean;
  latencyMs: number;
  providerStatus: number | null;
  providerCode: string | null;
  hint: string | null;
};

type MessageContentPart = {
  type?: string;
  text?: string | null;
};

type OpenAiLikePayload = {
  choices?: Array<{ message?: { content?: string | MessageContentPart[] | null } }>;
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
  readonly status = 503;

  constructor(
    readonly provider: AiProvider,
    readonly providerStatus: number | null = null,
    readonly providerCode: string | null = null,
  ) {
    super('LinkaryAI is temporarily unavailable. Please try again shortly.');
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

function messageContentText(value: unknown): string | null {
  const direct = cleanText(value);
  if (direct) return direct;
  if (!Array.isArray(value)) return null;
  const text = value
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const row = part as Record<string, unknown>;
      return cleanText(row.text) || '';
    })
    .filter(Boolean)
    .join('\n');
  return cleanText(text);
}

function openAiPayloadText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as OpenAiLikePayload;
  return messageContentText(row.choices?.[0]?.message?.content);
}

function workersText(payload: unknown): string | null {
  if (typeof payload === 'string') return cleanText(payload);
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  return openAiPayloadText(payload) || cleanText(row.response) || cleanText(row.result) || cleanText(row.text);
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

function normalizedProviderCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'string') {
    const code = value.trim();
    return code ? code.slice(0, 80) : null;
  }
  return null;
}

function providerErrorMeta(error: unknown): { providerStatus: number | null; providerCode: string | null } {
  let providerStatus: number | null = null;
  let providerCode: string | null = null;
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>;
    for (const candidate of [row.status, row.statusCode, row.httpStatus]) {
      if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599) {
        providerStatus = candidate;
        break;
      }
    }
    providerCode = normalizedProviderCode(row.code) || normalizedProviderCode(row.internalCode) || normalizedProviderCode(row.errorCode);
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!providerCode && message) {
    const match = message.match(/\b(30\d{2}|50\d{2})\b/);
    if (match) providerCode = match[1];
  }
  return { providerStatus, providerCode };
}

async function responseProviderCode(response: Response): Promise<string | null> {
  try {
    const payload = await response.clone().json() as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const row = payload as Record<string, unknown>;
    const nested = row.error && typeof row.error === 'object' ? row.error as Record<string, unknown> : null;
    return normalizedProviderCode(nested?.code) || normalizedProviderCode(row.code);
  } catch {
    return null;
  }
}

function probeHint(error: LinkaryAiProviderError): string {
  if (error.provider === 'workers_ai') {
    if (error.providerCode === '3036') return 'Cloudflare Workers AI daily free allocation is exhausted. The 10,000-Neuron allowance resets at 00:00 UTC.';
    if (error.providerCode === '3040') return 'Cloudflare Workers AI reported temporary model capacity pressure. Retry shortly or let Linkary fall back to another provider.';
    if (error.providerCode === '5035') return 'The selected Cloudflare model requires a Workers Paid plan. Choose a Free-plan model or upgrade Workers.';
    if (error.providerCode === '5007' || error.providerCode === '3042') return 'Cloudflare rejected the configured model ID. Select a currently supported Workers AI model.';
    if (error.providerCode === 'empty_response') return 'Cloudflare accepted the request but returned no final text. The adapter now supports the current chat-completion response shape; retry once and inspect Workers AI logs only if this persists.';
    if (error.providerStatus === 429) return 'Cloudflare Workers AI is rate-limited or its free daily allocation is exhausted.';
    if (error.providerStatus === 403) return 'Cloudflare rejected this Workers AI request for the current account or model.';
    return 'Cloudflare Workers AI did not complete the health request. Check Workers AI usage and provider logs for this account.';
  }
  if (error.provider === 'openrouter') {
    if (error.providerStatus === 401 || error.providerStatus === 403) return 'OpenRouter rejected the API key or account permissions. Verify the Linkary Production key in Cloudflare.';
    if (error.providerStatus === 429) return 'OpenRouter free-model rate limits were reached. Free accounts have limited daily and per-minute requests.';
    if (error.providerStatus === 402) return 'OpenRouter reported an account or credit restriction for this request.';
    if (error.providerStatus && error.providerStatus >= 200 && error.providerStatus < 300 && error.providerCode === 'empty_response') {
      return 'OpenRouter accepted the request but returned no final text. This is not an API-key failure; retry because the free router may select a different upstream model.';
    }
    return 'OpenRouter did not complete the health request. Check OpenRouter activity logs if the provider continues to fail.';
  }
  if (error.providerStatus === 429) return 'The provider rate-limited the health request.';
  if (error.providerStatus === 401 || error.providerStatus === 403) return 'The provider rejected the configured server credential.';
  return 'The provider did not complete the health request.';
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
      max_tokens: prompt.maxOutputTokens,
      stream: false,
      ...(model === WORKERS_DEFAULT_MODEL ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    });
  } catch (error) {
    const meta = providerErrorMeta(error);
    throw new LinkaryAiProviderError('workers_ai', meta.providerStatus, meta.providerCode);
  }
  const text = workersText(payload);
  if (!text) throw new LinkaryAiProviderError('workers_ai', null, 'empty_response');
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
        generationConfig: { maxOutputTokens: prompt.maxOutputTokens },
      }),
    });
  } catch {
    throw new LinkaryAiProviderError('gemini');
  }
  if (!response.ok) throw new LinkaryAiProviderError('gemini', response.status, await responseProviderCode(response));
  let payload: GeminiPayload;
  try {
    payload = await response.json() as GeminiPayload;
  } catch {
    throw new LinkaryAiProviderError('gemini', response.status, 'invalid_response');
  }
  const text = cleanText(payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''));
  if (!text) throw new LinkaryAiProviderError('gemini', response.status, 'empty_response');
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
        max_tokens: prompt.maxOutputTokens,
        ...(provider === 'openrouter' ? { reasoning: { effort: 'minimal', exclude: true } } : {}),
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      }),
    });
  } catch {
    throw new LinkaryAiProviderError(provider);
  }
  if (!response.ok) throw new LinkaryAiProviderError(provider, response.status, await responseProviderCode(response));
  let payload: OpenAiLikePayload;
  try {
    payload = await response.json() as OpenAiLikePayload;
  } catch {
    throw new LinkaryAiProviderError(provider, response.status, 'invalid_response');
  }
  const text = openAiPayloadText(payload);
  if (!text) throw new LinkaryAiProviderError(provider, response.status, 'empty_response');
  return {
    text,
    inputUnits: positiveInt(payload.usage?.prompt_tokens) ?? positiveInt(payload.usage?.input_tokens),
    outputUnits: positiveInt(payload.usage?.completion_tokens) ?? positiveInt(payload.usage?.output_tokens),
  };
}

async function runProvider(
  env: Env,
  selected: ProviderChoice,
  prompt: LinkaryAiPrompt,
): Promise<{ text: string; inputUnits: number | null; outputUnits: number | null }> {
  if (selected.provider === 'workers_ai') return runWorkers(env, selected.model, prompt);
  if (selected.provider === 'gemini') return runGemini(env, selected.model, prompt);
  if (selected.provider === 'groq') {
    return runOpenAiCompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, selected.model, prompt);
  }
  return runOpenAiCompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, selected.model, prompt);
}

export async function probeAiProvider(env: Env, selected: ProviderChoice): Promise<AiProviderProbe> {
  const started = Date.now();
  try {
    await runProvider(env, selected, {
      system: 'You are a Linkary infrastructure health check. Reply with OK only.',
      user: 'Reply exactly with OK.',
      maxOutputTokens: 64,
    });
    return {
      provider: selected.provider,
      model: selected.model,
      healthy: true,
      latencyMs: Math.max(0, Date.now() - started),
      providerStatus: null,
      providerCode: null,
      hint: null,
    };
  } catch (error) {
    const providerError = error instanceof LinkaryAiProviderError
      ? error
      : new LinkaryAiProviderError(selected.provider, null, 'unexpected_provider_error');
    return {
      provider: selected.provider,
      model: selected.model,
      healthy: false,
      latencyMs: Math.max(0, Date.now() - started),
      providerStatus: providerError.providerStatus,
      providerCode: providerError.providerCode,
      hint: probeHint(providerError),
    };
  }
}

export class LinkaryAI {
  private readonly providers: ProviderChoice[];

  constructor(private readonly env: Env, providers?: ProviderChoice[]) {
    this.providers = providers ? providers.map((item) => ({ ...item })) : configuredAiProviders(env);
  }

  provider(): ProviderChoice {
    const provider = this.providers[0];
    if (!provider) throw new ServiceConfigurationError('No active Linkary AI model is configured');
    return provider;
  }

  async generate(prompt: LinkaryAiPrompt): Promise<LinkaryAiResult> {
    if (!this.providers.length) throw new ServiceConfigurationError('No active Linkary AI model is configured');

    const started = Date.now();
    let lastProviderError: LinkaryAiProviderError | null = null;

    for (const selected of this.providers) {
      try {
        const result = await runProvider(this.env, selected, prompt);
        return {
          provider: selected.provider,
          model: selected.model,
          text: result.text,
          inputUnits: result.inputUnits,
          outputUnits: result.outputUnits,
          latencyMs: Math.max(0, Date.now() - started),
        };
      } catch (error) {
        if (!(error instanceof LinkaryAiProviderError)) throw error;
        lastProviderError = error;
      }
    }

    throw lastProviderError || new ServiceConfigurationError('No active Linkary AI model is configured');
  }
}
