import { useEffect, useMemo, useState } from 'react';
import './admin-ai-governance.css';

type AiProvider = 'workers_ai' | 'gemini' | 'groq' | 'openrouter';

type ProviderConfiguration = {
  provider: AiProvider;
  configured: boolean;
  environmentModel: string | null;
};

type ModelPolicy = {
  id?: string;
  provider: AiProvider;
  model: string;
  isActive: boolean;
  priority: number;
  configured?: boolean;
  updatedAt?: string;
};

type GovernanceState = {
  aiEnabled: boolean;
  updatedAt: string | null;
  explicitModelPolicy: boolean;
  providers: ProviderConfiguration[];
  policies: ModelPolicy[];
};

type ProviderProbe = {
  provider: AiProvider;
  model: string;
  healthy: boolean;
  latencyMs: number;
  providerStatus: number | null;
  providerCode: string | null;
  hint: string | null;
};

type ProbeResponse = {
  ok: boolean;
  explicitModelPolicy: boolean;
  probes: ProviderProbe[];
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  workers_ai: 'Cloudflare Workers AI',
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
};

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

async function api<T>(init?: RequestInit, path = '/api/admin/ai-governance'): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || 'AI governance request failed');
  return body;
}

export default function AdminAiGovernanceExperience() {
  const [state, setState] = useState<GovernanceState | null>(null);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [policies, setPolicies] = useState<ModelPolicy[]>([]);
  const [provider, setProvider] = useState<AiProvider>('workers_ai');
  const [model, setModel] = useState('');
  const [priority, setPriority] = useState('10');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<ProviderProbe[]>([]);
  const [probeMessage, setProbeMessage] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api<GovernanceState>();
      setState(result);
      setMasterEnabled(result.aiEnabled);
      setPolicies(result.policies || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI governance could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const providerMap = useMemo(
    () => new Map<AiProvider, ProviderConfiguration>((state?.providers || []).map((item) => [item.provider, item] as const)),
    [state],
  );
  const probeMap = useMemo(
    () => new Map<AiProvider, ProviderProbe>(probeResults.map((item) => [item.provider, item] as const)),
    [probeResults],
  );
  const runtimeReady = masterEnabled && (policies.length === 0
    ? (state?.providers || []).some((item) => item.configured && item.environmentModel)
    : policies.some((item) => item.isActive && providerMap.get(item.provider)?.configured));
  const automaticChain = useMemo(() => (state?.providers || [])
    .filter((item) => item.configured && item.environmentModel)
    .map((item) => `${PROVIDER_LABELS[item.provider]} (${item.environmentModel})`)
    .join(' → '), [state]);

  function toggle(index: number) {
    setPolicies((current) => current.map((item, i) => i === index ? { ...item, isActive: !item.isActive } : item));
  }

  function changePriority(index: number, value: string) {
    const parsed = Number(value);
    setPolicies((current) => current.map((item, i) => i === index ? { ...item, priority: Number.isInteger(parsed) ? parsed : item.priority } : item));
  }

  function addModel() {
    const clean = model.trim();
    const parsedPriority = Number(priority);
    if (!clean || /\s/.test(clean)) return setMessage('Enter a valid model ID without spaces.');
    if (!Number.isInteger(parsedPriority) || parsedPriority < 1 || parsedPriority > 9999) return setMessage('Priority must be between 1 and 9999.');
    if (policies.some((item) => item.provider === provider && item.model === clean)) return setMessage('That provider/model policy already exists.');
    setPolicies((current) => [...current, { provider, model: clean, isActive: true, priority: parsedPriority }]);
    setModel('');
    setPriority(String(parsedPriority + 10));
    setMessage('Manual model override added locally. Save changes to activate it.');
  }

  async function runProviderProbe() {
    const token = csrf();
    if (!token) {
      const missing = 'Security token is missing. Refresh the Superadmin console and try again.';
      setProbeMessage(missing);
      return setMessage(missing);
    }
    setProbing(true);
    setProbeMessage('Testing active AI providers…');
    setMessage('');
    try {
      const result = await api<ProbeResponse>(
        { method: 'PATCH', headers: { 'x-csrf-token': token } },
        '/api/admin/ai-governance?action=probe',
      );
      setProbeResults(result.probes || []);
      const healthy = (result.probes || []).filter((item) => item.healthy).length;
      const total = (result.probes || []).length;
      const summary = total
        ? `Provider health test complete: ${healthy}/${total} active providers responded.`
        : 'No active AI providers are available to test.';
      setProbeMessage(summary);
      setMessage(summary);
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'AI provider health test failed.';
      setProbeResults([]);
      setProbeMessage(`Provider health test failed: ${failure}`);
      setMessage(failure);
    } finally {
      setProbing(false);
    }
  }

  async function save() {
    const token = csrf();
    if (!token) return setMessage('Security token is missing. Refresh the Superadmin console and try again.');
    setSaving(true);
    setMessage('');
    try {
      const result = await api<GovernanceState>({
        method: 'PATCH',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          aiEnabled: masterEnabled,
          policies: policies.map(({ provider: p, model: m, isActive, priority: order }) => ({ provider: p, model: m, isActive, priority: order })),
        }),
      });
      setState(result);
      setMasterEnabled(result.aiEnabled);
      setPolicies(result.policies || []);
      setProbeResults([]);
      setProbeMessage('');
      setMessage('LinkaryAI runtime governance saved. Changes take effect on the next AI request.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI governance could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-ai-governance">
      <header className="admin-ai-header">
        <div>
          <span className="admin-ai-eyebrow">LINKARYAI CONTROL PLANE</span>
          <h1>AI runtime governance</h1>
          <p>Control whether LinkaryAI can run, verify provider health, and optionally override the automatic fallback chain.</p>
        </div>
        <span className={`admin-ai-runtime ${runtimeReady ? 'ready' : 'stopped'}`}>{runtimeReady ? 'RUNTIME READY' : 'RUNTIME STOPPED'}</span>
      </header>

      {message ? <div className="admin-ai-message" role="status">{message}</div> : null}
      {loading ? <div className="admin-ai-panel">Loading AI governance…</div> : (
        <>
          <section className="admin-ai-panel admin-ai-master">
            <div>
              <span className="admin-ai-label">MASTER SWITCH</span>
              <h2>LinkaryAI {masterEnabled ? 'enabled' : 'disabled'}</h2>
              <p>When disabled, AI requests stop before provider inference or Usage Credit reservation.</p>
            </div>
            <button type="button" className={`admin-ai-switch ${masterEnabled ? 'on' : ''}`} onClick={() => setMasterEnabled((value) => !value)} aria-pressed={masterEnabled}>
              <span>{masterEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </section>

          <section className="admin-ai-panel">
            <div className="admin-ai-section-heading">
              <div><span className="admin-ai-label">PROVIDER READINESS</span><h2>Server configuration and live health</h2></div>
              <div className="admin-ai-provider-actions">
                <p>Secrets stay in Cloudflare. Health tests return status only, never API keys or generated content.</p>
                <button type="button" onClick={() => void runProviderProbe()} disabled={probing}>{probing ? 'Testing…' : 'Test active providers'}</button>
                {probeMessage ? <small className="admin-ai-provider-status" role="status">{probeMessage}</small> : null}
              </div>
            </div>
            <div className="admin-ai-provider-grid">
              {(state?.providers || []).map((item) => {
                const probe = probeMap.get(item.provider);
                return (
                  <article key={item.provider}>
                    <strong>{PROVIDER_LABELS[item.provider]}</strong>
                    <span className={item.configured ? 'configured' : 'missing'}>{item.configured ? 'Configured' : 'Secret/binding missing'}</span>
                    <small>{item.environmentModel ? `Environment model: ${item.environmentModel}` : 'No environment model selected'}</small>
                    {probe ? (
                      <div className={`admin-ai-probe ${probe.healthy ? 'healthy' : 'unhealthy'}`}>
                        <b>{probe.healthy ? 'Healthy' : 'Unavailable'}</b>
                        <small>{probe.healthy ? `${probe.latencyMs} ms` : [probe.providerCode ? `Code ${probe.providerCode}` : null, probe.providerStatus ? `HTTP ${probe.providerStatus}` : null].filter(Boolean).join(' · ') || 'No provider response'}</small>
                        {!probe.healthy && probe.hint ? <small>{probe.hint}</small> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {policies.length === 0 ? (
              <div className="admin-ai-auto-route">
                <span className="admin-ai-label">AUTOMATIC ROUTING ACTIVE</span>
                <strong>{automaticChain || 'No configured provider chain available'}</strong>
                <small>No manual model selection is required. Linkary tries the configured providers in this order and falls through when a provider is unavailable.</small>
              </div>
            ) : null}
          </section>

          <section className="admin-ai-panel">
            <div className="admin-ai-section-heading">
              <div><span className="admin-ai-label">MODEL ALLOWLIST / ROUTING</span><h2>{policies.length ? 'Manual model policy' : 'Automatic model selection'}</h2></div>
              <p>{policies.length ? 'Explicit model policy is active. Only enabled rows can run.' : 'Automatic selection is active. You do not need to select or add a model.'}</p>
            </div>

            {policies.length ? (
              <div className="admin-ai-table-wrap">
                <table className="admin-ai-table">
                  <thead><tr><th>Provider</th><th>Model</th><th>Configured</th><th>Priority</th><th>Active</th></tr></thead>
                  <tbody>
                    {policies.map((item, index) => (
                      <tr key={`${item.provider}:${item.model}`}>
                        <td>{PROVIDER_LABELS[item.provider]}</td>
                        <td><code>{item.model}</code></td>
                        <td>{providerMap.get(item.provider)?.configured ? 'Yes' : 'No'}</td>
                        <td><input aria-label={`Priority for ${item.model}`} type="number" min="1" max="9999" value={item.priority} onChange={(event) => changePriority(index, event.target.value)} /></td>
                        <td><button type="button" className={`admin-ai-row-toggle ${item.isActive ? 'active' : ''}`} onClick={() => toggle(index)}>{item.isActive ? 'Enabled' : 'Disabled'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-ai-auto-policy">
                <strong>Automatic provider/model routing is enabled.</strong>
                <span>Linkary uses the server-configured models above. OpenRouter automatically uses <code>openrouter/free</code> when its key is configured.</span>
              </div>
            )}

            <details className="admin-ai-advanced">
              <summary>Advanced: pin or override a model</summary>
              <p>Only use this when you intentionally want to replace automatic model selection with an explicit provider/model policy.</p>
              <div className="admin-ai-add-model">
                <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)} aria-label="AI provider">
                  {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((key) => <option key={key} value={key}>{PROVIDER_LABELS[key]}</option>)}
                </select>
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model ID, e.g. gemini-2.5-flash" aria-label="AI model ID" />
                <input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="1" max="9999" aria-label="AI model priority" />
                <button type="button" onClick={addModel}>Add override</button>
              </div>
            </details>
          </section>

          <footer className="admin-ai-actions">
            <div><strong>Runtime governance changes require no application redeploy.</strong><span>Saving creates an auditable Superadmin governance event.</span></div>
            <button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save AI governance'}</button>
          </footer>
        </>
      )}
    </div>
  );
}
