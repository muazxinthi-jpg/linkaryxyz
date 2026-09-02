import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppV2 from './AppV2';
import { OperationsExperience, type MeResponse, type OnboardingStatus } from './OperationsExperience';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Request failed');
  return response.json() as Promise<T>;
}

function OperationsGate() {
  const [state, setState] = useState<'loading' | 'legacy' | 'operations'>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextMe = await getJson<MeResponse>('/api/auth/me');
        if (cancelled) return;
        if (!nextMe.authenticated) { setState('legacy'); return; }
        const nextStatus = await getJson<OnboardingStatus>('/api/onboarding/status');
        if (cancelled) return;
        if (!nextStatus.profiles?.length) { setState('legacy'); return; }
        setMe(nextMe);
        setStatus(nextStatus);
        setState('operations');
      } catch {
        if (!cancelled) setState('legacy');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'legacy') return <AppV2 />;
  if (state === 'operations' && me && status) return <OperationsExperience me={me} status={status} />;
  return <main className="loading-screen"><div className="spinner" /><p>Opening Linkary</p></main>;
}

export default function AppV3() {
  const location = useLocation();
  if (location.pathname === '/campaigns' || location.pathname === '/tracking') return <OperationsGate />;
  return <AppV2 />;
}
