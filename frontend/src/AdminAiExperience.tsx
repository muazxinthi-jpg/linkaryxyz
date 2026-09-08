import { useEffect, useState } from 'react';
import './admin-ai.css';

type Provider = {
  id?: string;
  provider: 'workers_ai' | 'openrouter';
  label: string;
  taskKey?: string;
  routeRole: 'primary' | 'fallback';
  priority?: number;
  enabled: boolean;
  model: string;
  paidModelsEnabled: boolean;
  maxCallsPerHour: number;
  callsLastHour: number | null;
  runtimeConfigured: boolean;
  updatedAt?: string;
};

type ProviderResponse = {
  migrationRequired: boolean;
  migration: string | null;
  providers: Provider[];
  message?: string;
};

function cookie(name: string): string | null {
  const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  const payload = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'Request failed');
  return payload;
}

export default function AdminAiExperience() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [migration, setMigration] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const result = await apiJson<ProviderResponse>('/api/admin/ai/providers');
      setProviders(result.providers || []);
      setMigrationRequired(result.migrationRequired);
      setMigration(result.migration);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI provider controls are unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function updateLocal(provider: Provider['provider'], patch: Partial<Provider>) {
    setProviders((current) => current.map((item) => item.provider === provider ? { ...item, ...patch } : item));
  }

  async function save(item: Provider) {
    const csrf = cookie('__Host-linkary_csrf');
    if (!csrf) { setMessage('Your Superadmin session needs to be refreshed.'); return; }
    setBusy(item.provider);
    setMessage('');
    try {
      await apiJson(`/api/admin/ai/providers/${encodeURIComponent(item.provider)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          enabled: item.enabled,
          model: item.model,
          paidModelsEnabled: item.paidModelsEnabled,
          maxCallsPerHour: item.maxCallsPerHour,
        }),
      });
      setMessage(`${item.label} routing policy saved.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Provider policy could not be saved.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="admin-ai-page">
      <div className="admin-ai-heading">
        <div>
          <span>LINKARYAI CONTROL</span>
          <h1>AI providers</h1>
          <p>Technical Paper 60.8 routing: Cloudflare Workers AI is primary. OpenRouter is a secondary, optional fallback. Provider secrets are never exposed in this console.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && <div className="admin-ai-message">{message}</div>}
      {migrationRequired && (
        <div className="admin-ai-warning">
          <strong>Provider-policy migration required.</strong>
          <span>Apply <code>{migration || '0042_ai_provider_routing.sql'}</code>. Until then Linkary stays on the existing Workers AI path and OpenRouter remains inactive.</span>
        </div>
      )}

      <div className="admin-ai-policy">
        <strong>Locked architecture</strong>
        <span>Workers AI = primary/default</span>
        <span>OpenRouter = secondary/optional fallback</span>
        <span>Paid OpenRouter models = OFF by default</span>
        <span>No AI invocation on page load</span>
      </div>

      <div className="admin-ai-grid">
        {providers.map((item) => (
          <section className="admin-ai-card" key={item.provider}>
            <div className="admin-ai-card-head">
              <div>
                <span>{item.routeRole === 'primary' ? 'PRIMARY' : 'FALLBACK'}</span>
                <h2>{item.label}</h2>
              </div>
              <span className={`admin-ai-runtime ${item.runtimeConfigured ? 'ready' : 'missing'}`}>
                {item.runtimeConfigured ? 'Runtime configured' : 'Secret/binding missing'}
              </span>
            </div>

            <label className="admin-ai-toggle">
              <input
                type="checkbox"
                checked={item.enabled}
                disabled={migrationRequired}
                onChange={(event) => updateLocal(item.provider, { enabled: event.target.checked })}
              />
              <span><strong>{item.enabled ? 'Enabled' : 'Disabled'}</strong><small>{item.provider === 'workers_ai' ? 'Default LinkaryAI route.' : 'Used only after an eligible primary-provider failure.'}</small></span>
            </label>

            <label className="admin-ai-field">
              <span>Model</span>
              <input
                value={item.model}
                disabled={migrationRequired}
                maxLength={200}
                onChange={(event) => updateLocal(item.provider, { model: event.target.value })}
              />
              {item.provider === 'openrouter' && !item.paidModelsEnabled && <small>Free-only mode accepts <code>openrouter/free</code> or a model ending in <code>:free</code>.</small>}
            </label>

            <label className="admin-ai-field">
              <span>Provider calls per hour</span>
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                value={item.maxCallsPerHour}
                disabled={migrationRequired}
                onChange={(event) => updateLocal(item.provider, { maxCallsPerHour: Math.max(1, Number(event.target.value || 1)) })}
              />
              <small>{item.callsLastHour === null ? 'Attempt telemetry starts after migration 0042.' : `${item.callsLastHour} provider attempt${item.callsLastHour === 1 ? '' : 's'} in the last hour.`}</small>
            </label>

            {item.provider === 'openrouter' && (
              <label className="admin-ai-toggle admin-ai-paid">
                <input
                  type="checkbox"
                  checked={item.paidModelsEnabled}
                  disabled={migrationRequired}
                  onChange={(event) => updateLocal(item.provider, { paidModelsEnabled: event.target.checked })}
                />
                <span><strong>Allow paid OpenRouter models</strong><small>OFF by default. Enabling this can create external API spend.</small></span>
              </label>
            )}

            <div className="admin-ai-footer">
              <span>{item.runtimeConfigured ? 'Provider credentials are present server-side.' : item.provider === 'openrouter' ? 'Add OPENROUTER_API_KEY as a Cloudflare secret before enabling fallback.' : 'Workers AI binding must exist.'}</span>
              <button type="button" disabled={migrationRequired || busy === item.provider} onClick={() => void save(item)}>
                {busy === item.provider ? 'Saving…' : 'Save policy'}
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="admin-ai-note">
        <strong>Usage Credit rule</strong>
        <p>A fallback does not create a second customer AI charge. One user action reserves one Usage Credit event; provider attempts are operational telemetry only.</p>
      </div>
    </div>
  );
}
