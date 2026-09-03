import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';
import './creator-opportunities.css';

type Opportunity = {
  id: string;
  campaign_id: string;
  organization_id: string;
  title: string;
  brief: string;
  compensation_text: string;
  deliverables_text: string;
  status: string;
  application_deadline: string | null;
  campaign_name: string;
  project_name: string;
  applications: number;
  my_application_id: string | null;
  my_application_status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | null;
};

type Manager = {
  id: string;
  profile_id: string;
  manager_type: string;
  display_name: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body;
}

function csrf(): string | null {
  const hit = document.cookie.split('; ').find((part) => part.startsWith('__Host-linkary_csrf='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null;
}

function date(value: string | null): string {
  if (!value) return 'No deadline';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No deadline';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function human(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function applicationLabel(status: Opportunity['my_application_status']): string | null {
  if (!status) return null;
  if (status === 'pending') return 'Application pending';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Not selected';
  return 'Withdrawn';
}

export default function CreatorOpportunitiesExperience({
  me,
  status,
}: {
  me: ProductMe;
  status: ProductStatus;
}) {
  const creator = status.profiles.find((item) => item.profile_type === 'creator');
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(
    saved && status.profiles.some((item) => item.id === saved) ? saved : creator?.id || status.profiles[0]?.id || '',
  );
  const profile = status.profiles.find((item) => item.id === profileId) || creator || status.profiles[0];
  const personalProfile = status.profiles.find((item) => item.profile_type === 'creator');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [mode, setMode] = useState<'browse' | 'mine'>('browse');
  const [query, setQuery] = useState('');
  const [applyTo, setApplyTo] = useState<Opportunity | null>(null);
  const [managerId, setManagerId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const myManagers = useMemo(
    () => personalProfile ? managers.filter((manager) => manager.profile_id === personalProfile.id) : [],
    [managers, personalProfile?.id],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return opportunities;
    return opportunities.filter((item) =>
      `${item.title} ${item.project_name} ${item.campaign_name} ${item.brief} ${item.compensation_text} ${item.deliverables_text}`
        .toLowerCase()
        .includes(term),
    );
  }, [opportunities, query]);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [opportunityResult, managerResult] = await Promise.all([
        api<{ opportunities: Opportunity[] }>(`/api/campaign-opportunities${mode === 'mine' ? '?mine=1' : ''}`),
        api<{ managers: Manager[] }>('/api/partner-managers').catch(() => ({ managers: [] })),
      ]);
      setOpportunities(opportunityResult.opportunities);
      setManagers(managerResult.managers);
    } catch (error) {
      setOpportunities([]);
      setMessage(error instanceof Error ? error.message : 'Opportunities are temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [mode]);

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    const token = csrf();
    if (!token || !applyTo || !personalProfile) return;
    setBusy(true);
    setMessage('');
    try {
      await api('/api/campaign-opportunity-applications', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: JSON.stringify({
          opportunityId: applyTo.id,
          profileId: personalProfile.id,
          managerId: managerId || null,
          note,
        }),
      });
      setApplyTo(null);
      setManagerId('');
      setNote('');
      setMessage('Application sent. The Project team can review it in Linkary.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your application could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  if (!personalProfile) {
    return (
      <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
        <section className="ops-empty prominent">
          <div className="ops-empty-icon">✦</div>
          <h2>Create your Creator identity first</h2>
          <p>Campaign opportunities are applied to through a personal Linkary Creator profile.</p>
          <NavLink className="ops-button primary" to="/profile">Open Profile</NavLink>
        </section>
      </ProductWorkspace>
    );
  }

  return (
    <ProductWorkspace me={me} status={status} profile={profile as ProductProfile} onProfileChange={changeProfile}>
      <div className="ops-stack creator-opportunities">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">CREATOR OPPORTUNITIES</span>
            <h1>Find campaigns worth joining</h1>
            <p>Browse campaigns opened by verified Projects. Apply with your Creator identity, then build campaign history as the work is accepted and tracked.</p>
          </div>
          <NavLink className="ops-button secondary" to="/dashboard/inbox">Open Inbox</NavLink>
        </div>

        <section className="creator-opportunity-principle">
          <strong>Your profile becomes stronger through real work.</strong>
          <span>Accepted Linkary campaign relationships can contribute to Campaign Proof. Performance appears publicly only when evidence is tracked or verified.</span>
        </section>

        <div className="creator-opportunity-toolbar">
          <nav className="ops-tabs">
            <button type="button" className={mode === 'browse' ? 'active' : ''} onClick={() => setMode('browse')}>Browse opportunities</button>
            <button type="button" className={mode === 'mine' ? 'active' : ''} onClick={() => setMode('mine')}>My applications</button>
          </nav>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Project, campaign or brief" aria-label="Search opportunities" />
        </div>

        {message && <div className="ops-message">{message}</div>}

        <section className="ops-section">
          <div className="ops-section-title">
            <div>
              <h2>{mode === 'mine' ? 'Your open applications' : 'Open campaigns'}</h2>
              <p>{mode === 'mine' ? 'Track applications while the campaign remains open.' : 'Only opportunities still accepting applications are shown.'}</p>
            </div>
          </div>
          {loading ? (
            <div className="ops-loading">Loading opportunities...</div>
          ) : !filtered.length ? (
            <div className="ops-empty">
              <div className="ops-empty-icon">◇</div>
              <h3>{mode === 'mine' ? 'No open applications' : 'No matching opportunities'}</h3>
              <p>{mode === 'mine' ? 'Apply to an open campaign and it will appear here while the opportunity remains active.' : 'Try another search or check again when Projects open new campaigns.'}</p>
              {mode === 'mine' && <button className="ops-button secondary" type="button" onClick={() => setMode('browse')}>Browse opportunities</button>}
            </div>
          ) : (
            <div className="creator-opportunity-grid">
              {filtered.map((item) => {
                const state = applicationLabel(item.my_application_status);
                const canApply = !item.my_application_status || item.my_application_status === 'rejected' || item.my_application_status === 'withdrawn';
                return (
                  <article className="creator-opportunity-card" key={item.id}>
                    <div className="creator-opportunity-head">
                      <span>{item.project_name}</span>
                      {state && <b className={`creator-application-state state-${item.my_application_status}`}>{state}</b>}
                    </div>
                    <h3>{item.title}</h3>
                    <small>{item.campaign_name}</small>
                    <p>{item.brief || 'The Project has not added a longer brief yet.'}</p>
                    {item.deliverables_text && <div className="creator-opportunity-detail"><span>DELIVERABLES</span><strong>{item.deliverables_text}</strong></div>}
                    <div className="creator-opportunity-meta">
                      <span><b>Deal</b>{item.compensation_text || 'Discuss with Project'}</span>
                      <span><b>Deadline</b>{date(item.application_deadline)}</span>
                    </div>
                    <div className="creator-opportunity-footer">
                      <span>{item.applications || 0} application{item.applications === 1 ? '' : 's'}</span>
                      {canApply ? (
                        <button className="ops-button primary small" type="button" onClick={() => { setApplyTo(item); setManagerId(''); setNote(''); }}>
                          {item.my_application_status === 'rejected' ? 'Apply again' : 'Apply'}
                        </button>
                      ) : (
                        <span className="creator-opportunity-locked">{human(item.my_application_status || '')}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {applyTo && (
          <div className="ops-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setApplyTo(null); }}>
            <form className="ops-modal" onSubmit={apply}>
              <div className="ops-modal-head">
                <div><span className="ops-kicker">CAMPAIGN OPPORTUNITY</span><h2>{applyTo.title}</h2></div>
                <button type="button" onClick={() => setApplyTo(null)}>×</button>
              </div>
              <div className="creator-apply-context">
                <strong>{applyTo.project_name}</strong>
                <span>{applyTo.compensation_text || 'Compensation to discuss'} · {date(applyTo.application_deadline)}</span>
              </div>
              {myManagers.length > 0 && (
                <label>
                  Apply as
                  <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                    <option value="">{personalProfile.display_name} · Creator</option>
                    {myManagers.map((manager) => <option value={manager.id} key={manager.id}>{manager.display_name} · {human(manager.manager_type)}</option>)}
                  </select>
                </label>
              )}
              <label>
                Note to the Project
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why are you a fit? Add your proposed approach, relevant audience or experience." maxLength={1000} />
              </label>
              <div className="ops-form-actions">
                <button className="ops-button ghost" type="button" onClick={() => setApplyTo(null)}>Cancel</button>
                <button className="ops-button primary" disabled={busy}>{busy ? 'Sending...' : 'Send application'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </ProductWorkspace>
  );
}
