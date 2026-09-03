import { useEffect, useState } from 'react';
import { ProductWorkspace, type ProductMe, type ProductProfile, type ProductStatus } from './ProductWorkspace';

type Health = {
  ok: boolean;
  counts: { users: number; profiles: number; organizations: number };
  betaReadiness: {
    ready: boolean;
    schema: {
      ready: boolean;
      requiredTableCount: number;
      presentRequiredTableCount: number;
      missingTables: string[];
      requiredTriggerCount: number;
      presentRequiredTriggerCount: number;
      missingTriggers: string[];
      migrationLedgerPresent: boolean;
    };
    inspectionError: string | null;
    nextAction: string;
  };
};

async function loadHealth(): Promise<Health> {
  const response = await fetch('/api/admin/health', { credentials: 'same-origin' });
  const body = (await response.json().catch(() => ({}))) as Health & { message?: string };
  if (!response.ok) throw new Error(body.message || 'Unable to check production readiness.');
  return body;
}

export default function AdminReadinessExperience({
  me,
  status,
}: {
  me: ProductMe;
  status: ProductStatus;
}) {
  const first = status.profiles[0];
  const saved = window.localStorage.getItem('linkary.active.profile');
  const [profileId, setProfileId] = useState(
    saved && status.profiles.some((item) => item.id === saved) ? saved : first?.id || '',
  );
  const profile = status.profiles.find((item) => item.id === profileId) || first;
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function changeProfile(id: string) {
    setProfileId(id);
    window.localStorage.setItem('linkary.active.profile', id);
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setHealth(await loadHealth());
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Unable to check production readiness.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!profile) return null;

  return (
    <ProductWorkspace
      me={me}
      status={status}
      profile={profile as ProductProfile}
      onProfileChange={changeProfile}
    >
      <div className="ops-stack">
        <div className="ops-heading-row">
          <div>
            <span className="ops-kicker">SUPERADMIN</span>
            <h1>Beta readiness</h1>
            <p>
              Confirm that production has the Linkary capabilities required before inviting Creators and Projects into the Beta.
            </p>
          </div>
          <div className="ops-heading-actions">
            <a className="ops-button secondary" href="/admin">Creator access review</a>
            <button className="ops-button primary" type="button" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Checking...' : 'Refresh readiness'}
            </button>
          </div>
        </div>

        {error && <div className="ops-message error">{error}</div>}

        {health && (
          <>
            <div className={`ops-callout ${health.betaReadiness.ready ? 'neutral' : 'verification'}`}>
              <div>
                <span className="ops-kicker">PRODUCTION STATUS</span>
                <h3>{health.betaReadiness.ready ? 'Ready for Beta acceptance' : 'Action required before onboarding'}</h3>
                <p>{health.betaReadiness.nextAction}</p>
              </div>
              <span className={`ops-project-state ${health.betaReadiness.ready ? 'verified' : 'pending'}`}>
                {health.betaReadiness.ready ? 'Ready for Beta' : 'Not ready'}
              </span>
            </div>

            <div className="ops-metrics">
              <article>
                <span>REQUIRED TABLES</span>
                <strong>{health.betaReadiness.schema.presentRequiredTableCount}/{health.betaReadiness.schema.requiredTableCount}</strong>
                <small>Core Linkary product capabilities</small>
              </article>
              <article>
                <span>REQUIRED AUTOMATION</span>
                <strong>{health.betaReadiness.schema.presentRequiredTriggerCount}/{health.betaReadiness.schema.requiredTriggerCount}</strong>
                <small>Verified-X identity and Project team access</small>
              </article>
              <article>
                <span>USERS</span>
                <strong>{health.counts.users}</strong>
                <small>Current Linkary accounts</small>
              </article>
              <article>
                <span>PROFILES</span>
                <strong>{health.counts.profiles}</strong>
                <small>Creator and Project identities</small>
              </article>
            </div>

            {!health.betaReadiness.ready && (
              <section className="ops-section">
                <div className="ops-section-title">
                  <div>
                    <h2>Missing production capabilities</h2>
                    <p>Run the protected production migration workflow before real-account Beta acceptance.</p>
                  </div>
                </div>
                <div className="ops-table-list">
                  {health.betaReadiness.inspectionError && (
                    <div className="ops-activity-row">
                      <div className="ops-activity-main">
                        <span className="ops-type-chip">Check</span>
                        <strong>Schema inspection</strong>
                        <small>{health.betaReadiness.inspectionError}</small>
                      </div>
                    </div>
                  )}
                  {health.betaReadiness.schema.missingTables.map((name) => (
                    <div className="ops-activity-row" key={`table:${name}`}>
                      <div className="ops-activity-main">
                        <span className="ops-type-chip">Table</span>
                        <strong>{name}</strong>
                        <small>Required by the current Beta product.</small>
                      </div>
                    </div>
                  ))}
                  {health.betaReadiness.schema.missingTriggers.map((name) => (
                    <div className="ops-activity-row" key={`trigger:${name}`}>
                      <div className="ops-activity-main">
                        <span className="ops-type-chip">Automation</span>
                        <strong>{name}</strong>
                        <small>Required by the current Beta identity or Project access flow.</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {health.betaReadiness.ready && (
              <section className="ops-section">
                <div className="ops-section-title">
                  <div>
                    <h2>Next: real-account acceptance</h2>
                    <p>The schema is ready. Do not broaden onboarding until the end-to-end Beta checklist passes with separate accounts.</p>
                  </div>
                </div>
                <div className="ops-table-list">
                  {[
                    'Fresh Creator Earn Access and Superadmin approval',
                    'Official-X Project registration and ownership',
                    'Creator to Project role request and approval',
                    'Free Project team invitation, redemption and role assignment',
                    'Invite click, signup and redemption attribution',
                    'Campaign, tracking link, click, outcome and public Proof',
                    'Campaign opportunity application and decision',
                    'Mobile, tablet and desktop acceptance',
                  ].map((item, index) => (
                    <div className="ops-activity-row" key={item}>
                      <div className="ops-activity-main">
                        <span className="ops-type-chip">{index + 1}</span>
                        <strong>{item}</strong>
                        <small>Acceptance test required before broad onboarding.</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ProductWorkspace>
  );
}
