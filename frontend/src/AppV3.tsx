import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppV2 from './AppV2';
import { OperationsExperience } from './OperationsExperience';
import NetworkExperience from './NetworkExperience';
import InviteExperience from './InviteExperience';
import type { ProductMe, ProductStatus } from './ProductWorkspace';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Request failed');
  return response.json() as Promise<T>;
}

type Experience = 'operations' | 'network' | 'invites';

function ProductGate({ experience }: { experience: Experience }) {
  const [state, setState] = useState<'loading' | 'legacy' | 'ready'>('loading');
  const [me, setMe] = useState<ProductMe | null>(null);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextMe = await getJson<ProductMe>('/api/auth/me');
        if (cancelled) return;
        if (!nextMe.authenticated) { setState('legacy'); return; }
        const nextStatus = await getJson<ProductStatus>('/api/onboarding/status');
        if (cancelled) return;
        if (!nextStatus.profiles?.length) { setState('legacy'); return; }
        setMe(nextMe); setStatus(nextStatus); setState('ready');
      } catch {
        if (!cancelled) setState('legacy');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'ready' && me && status) {
    if (experience === 'network') return <NetworkExperience me={me} status={status} />;
    if (experience === 'invites') return <InviteExperience me={me} status={status} />;
    return <OperationsExperience me={me} status={status} />;
  }
  return <main className="loading-screen"><div className="spinner" /><p>Opening Linkary</p></main>;
}

export default function AppV3() {
  const location = useLocation();
  if (location.pathname === '/campaigns' || location.pathname === '/tracking') return <ProductGate experience="operations" />;
  if (location.pathname === '/creators' || location.pathname === '/communities') return <ProductGate experience="network" />;
  if (location.pathname === '/invites') return <ProductGate experience="invites" />;
  return <AppV2 />;
}
