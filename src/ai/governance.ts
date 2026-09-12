import type { Db } from '../db/client';
import type { Env } from '../env';
import { configuredAiProviders, type AiProvider, type ProviderChoice } from './LinkaryAI';

export type AiRuntimeGovernance = {
  enabled: boolean;
  explicitModelPolicy: boolean;
  providers: ProviderChoice[];
};

export type AiProviderConfiguration = {
  provider: AiProvider;
  configured: boolean;
  environmentModel: string | null;
};

type SettingsRow = { ai_enabled: number };
type PolicyRow = {
  provider: AiProvider;
  model: string;
  is_active: number;
  priority: number;
};

const WORKERS_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

function cleanModel(value: string | undefined): string | null {
  const model = value?.trim();
  return model ? model.slice(0, 200) : null;
}

export function isAiProviderConfigured(env: Env, provider: AiProvider): boolean {
  if (provider === 'workers_ai') return Boolean(env.AI);
  if (provider === 'gemini') return Boolean(env.GEMINI_API_KEY?.trim());
  if (provider === 'groq') return Boolean(env.GROQ_API_KEY?.trim());
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}

export function environmentModelForProvider(env: Env, provider: AiProvider): string | null {
  if (provider === 'workers_ai') return env.AI ? cleanModel(env.AI_WORKERS_MODEL) || WORKERS_DEFAULT_MODEL : null;
  if (provider === 'gemini') return cleanModel(env.AI_GEMINI_MODEL);
  if (provider === 'groq') return cleanModel(env.AI_GROQ_MODEL);
  return cleanModel(env.AI_OPENROUTER_MODEL);
}

export function aiProviderConfiguration(env: Env): AiProviderConfiguration[] {
  return (['workers_ai', 'gemini', 'groq', 'openrouter'] as const).map((provider) => ({
    provider,
    configured: isAiProviderConfigured(env, provider),
    environmentModel: environmentModelForProvider(env, provider),
  }));
}

export async function loadAiRuntimeGovernance(db: Db, env: Env): Promise<AiRuntimeGovernance> {
  const settings = await db.first<SettingsRow>(
    `SELECT ai_enabled FROM ai_runtime_settings WHERE id = 'global' LIMIT 1`,
  );
  const policies = await db.all<PolicyRow>(
    `SELECT provider, model, is_active, priority
       FROM ai_provider_model_policies
      ORDER BY priority ASC, provider ASC, model ASC`,
  );

  const explicitModelPolicy = policies.length > 0;
  const providers = explicitModelPolicy
    ? policies
        .filter((row) => row.is_active === 1 && isAiProviderConfigured(env, row.provider))
        .map((row) => ({ provider: row.provider, model: row.model }))
    : configuredAiProviders(env);

  return {
    enabled: settings ? settings.ai_enabled === 1 : true,
    explicitModelPolicy,
    providers,
  };
}
