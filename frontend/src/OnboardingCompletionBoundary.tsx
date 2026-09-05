import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function requestTarget(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

export default function OnboardingCompletionBoundary() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/onboarding') return undefined;

    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await originalFetch(input, init);
      const method = requestMethod(input, init);
      const pathname = new URL(requestTarget(input), window.location.origin).pathname;

      if (method === 'POST' && pathname === '/api/onboarding/complete' && response.ok) {
        window.location.replace('/dashboard');
        return new Promise<Response>(() => undefined);
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [location.pathname]);

  return null;
}
