export const AUTH_INIT_SLOW_MS = 3_500;
export const AUTH_INIT_MAX_MS = 10_000;
export const AUTH_RECOVERY_SLOW_MS = 3_500;
export const AUTH_RECOVERY_MAX_MS = 15_000;
export const AUTH_REQUEST_TIMEOUT_MS = 6_000;
export const AUTH_SESSION_BRIDGE_TIMEOUT_MS = 8_000;
export const AUTH_TOKEN_TIMEOUT_MS = 6_000;

export type InitializationPhase = 'loading' | 'slow' | 'timeout' | 'ready';
export type AuthDiagnosticOutcome = 'start' | 'success' | 'slow' | 'timeout' | 'error' | 'http_error' | 'deduplicated' | 'blocked';

type EndpointPolicy = {
  stage: 'auth_me' | 'session_bridge' | 'onboarding_status';
  timeoutMs: number;
  timeoutCode: string;
  reference: string;
  publicMessage: string;
};

type RedirectRecord = { from: string; to: string; at: number };

type ResponseSnapshot = {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: Headers;
};

const REDIRECT_STORAGE = 'linkary.auth.redirect.v1';
const REDIRECT_LOOP_WINDOW_MS = 8_000;
const BRIDGE_DEDUPE_RELEASE_MS = 750;

const ENDPOINT_POLICIES = new Map<string, EndpointPolicy>([
  ['/api/auth/me', {
    stage: 'auth_me',
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    timeoutCode: 'auth_me_timeout',
    reference: 'LK-AUTH-ME',
    publicMessage: 'Linkary took too long to load your secure account state. Please try again.',
  }],
  ['/api/auth/cdp/session', {
    stage: 'session_bridge',
    timeoutMs: AUTH_SESSION_BRIDGE_TIMEOUT_MS,
    timeoutCode: 'session_bridge_timeout',
    reference: 'LK-AUTH-BRIDGE',
    publicMessage: 'Linkary took too long to finish your secure sign-in. Please try again.',
  }],
  ['/api/onboarding/status', {
    stage: 'onboarding_status',
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    timeoutCode: 'onboarding_status_timeout',
    reference: 'LK-AUTH-ONBOARDING',
    publicMessage: 'Linkary took too long to load your account setup. Please try again.',
  }],
]);

export class AuthReliabilityError extends Error {
  constructor(
    readonly code: string,
    readonly reference: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthReliabilityError';
  }
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function authDiagnostic(
  stage: string,
  outcome: AuthDiagnosticOutcome,
  startedAt: number,
  extra: Record<string, string | number | boolean | null | undefined> = {},
) {
  const durationMs = Math.max(0, Math.round(monotonicNow() - startedAt));
  const safeExtra = Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined));
  console.info('[linkary-auth]', {
    event: 'auth_stage',
    stage,
    outcome,
    durationMs,
    ...safeExtra,
  });
}

export function initializationPhase(isInitialized: boolean, elapsedMs: number): InitializationPhase {
  if (isInitialized) return 'ready';
  if (elapsedMs >= AUTH_INIT_MAX_MS) return 'timeout';
  if (elapsedMs >= AUTH_INIT_SLOW_MS) return 'slow';
  return 'loading';
}

export function isAuthenticationEntryPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/signup';
}

export function shouldRecoverSession(isInitialized: boolean, isSignedIn: boolean, pathname: string): boolean {
  return Boolean(isInitialized && isSignedIn && isAuthenticationEntryPath(pathname));
}

export function authenticatedRoute(profileCount: number): '/dashboard' | '/onboarding' {
  return profileCount > 0 ? '/dashboard' : '/onboarding';
}

export function authReliabilityCode(error: unknown): string | undefined {
  if (error instanceof AuthReliabilityError) return error.code;
  return error instanceof Error ? error.message : undefined;
}

export function authReliabilityReference(error: unknown): string | undefined {
  return error instanceof AuthReliabilityError ? error.reference : undefined;
}

export async function withPromiseTimeout<T>(
  stage: string,
  promise: Promise<T>,
  timeoutMs: number,
  code: string,
  reference: string,
  publicMessage: string,
): Promise<T> {
  const startedAt = monotonicNow();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        authDiagnostic(stage, 'timeout', startedAt, { timeoutMs, reference });
        reject(new AuthReliabilityError(code, reference, publicMessage));
      }, timeoutMs);
    });
    const result = await Promise.race([promise, timeout]);
    authDiagnostic(stage, 'success', startedAt);
    return result;
  } catch (error) {
    if (!(error instanceof AuthReliabilityError)) authDiagnostic(stage, 'error', startedAt);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requestPath(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === 'string') return new URL(input, window.location.origin).pathname;
    if (input instanceof URL) return input.pathname;
    return new URL(input.url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

async function timedFetch(
  baseFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  path: string,
  policy: EndpointPolicy,
): Promise<Response> {
  const startedAt = monotonicNow();
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let timedOut = false;
  const onUpstreamAbort = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) controller.abort(upstreamSignal.reason);
  else upstreamSignal?.addEventListener('abort', onUpstreamAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, policy.timeoutMs);

  try {
    const response = await baseFetch(input, { ...init, signal: controller.signal });
    authDiagnostic(policy.stage, response.ok ? 'success' : 'http_error', startedAt, {
      path,
      status: response.status,
    });
    return response;
  } catch (error) {
    if (timedOut) {
      authDiagnostic(policy.stage, 'timeout', startedAt, {
        path,
        timeoutMs: policy.timeoutMs,
        reference: policy.reference,
      });
      throw new AuthReliabilityError(policy.timeoutCode, policy.reference, policy.publicMessage);
    }
    authDiagnostic(policy.stage, 'error', startedAt, { path, aborted: controller.signal.aborted });
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', onUpstreamAbort);
  }
}

function responseSnapshot(response: Response): Promise<ResponseSnapshot> {
  return response.arrayBuffer().then((body) => ({
    body,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  }));
}

function restoreResponse(snapshot: ResponseSnapshot): Response {
  return new Response(snapshot.body.slice(0), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: new Headers(snapshot.headers),
  });
}

export function createAuthFetchGuard(baseFetch: typeof window.fetch): typeof window.fetch {
  let bridgeFlight: Promise<ResponseSnapshot> | null = null;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = requestPath(input);
    const policy = path ? ENDPOINT_POLICIES.get(path) : undefined;
    if (!path || !policy) return baseFetch(input, init);

    const method = requestMethod(input, init);
    if (path === '/api/auth/cdp/session' && method === 'POST') {
      if (bridgeFlight) {
        const startedAt = monotonicNow();
        authDiagnostic('session_bridge', 'deduplicated', startedAt, { path });
        return restoreResponse(await bridgeFlight);
      }

      const flight = timedFetch(baseFetch, input, init, path, policy).then(responseSnapshot);
      bridgeFlight = flight;
      try {
        return restoreResponse(await flight);
      } finally {
        setTimeout(() => {
          if (bridgeFlight === flight) bridgeFlight = null;
        }, BRIDGE_DEDUPE_RELEASE_MS);
      }
    }

    return timedFetch(baseFetch, input, init, path, policy);
  };
}

export function installAuthFetchTimeoutGuard() {
  if (typeof window === 'undefined') return;
  const guardedWindow = window as typeof window & { __linkaryAuthFetchGuardV1?: boolean };
  if (guardedWindow.__linkaryAuthFetchGuardV1) return;
  const baseFetch = window.fetch.bind(window);
  window.fetch = createAuthFetchGuard(baseFetch);
  guardedWindow.__linkaryAuthFetchGuardV1 = true;
}

function readRedirectRecord(): RedirectRecord | null {
  try {
    const raw = sessionStorage.getItem(REDIRECT_STORAGE);
    if (!raw) return null;
    const value = JSON.parse(raw) as RedirectRecord;
    if (!value || typeof value.from !== 'string' || typeof value.to !== 'string' || typeof value.at !== 'number') return null;
    return value;
  } catch {
    return null;
  }
}

export function wouldLoopRedirect(previous: RedirectRecord | null, from: string, to: string, now: number): boolean {
  if (!previous || now - previous.at > REDIRECT_LOOP_WINDOW_MS) return false;
  const repeated = previous.from === from && previous.to === to;
  const reversed = previous.from === to && previous.to === from;
  return repeated || reversed;
}

export function replaceAuthRoute(target: string): 'same' | 'navigated' | 'blocked' {
  const from = window.location.pathname;
  if (from === target) return 'same';
  const now = Date.now();
  const previous = readRedirectRecord();
  if (wouldLoopRedirect(previous, from, target, now)) {
    authDiagnostic('auth_redirect', 'blocked', monotonicNow(), { from, to: target, reference: 'LK-AUTH-ROUTE' });
    return 'blocked';
  }
  sessionStorage.setItem(REDIRECT_STORAGE, JSON.stringify({ from, to: target, at: now } satisfies RedirectRecord));
  window.location.replace(target);
  return 'navigated';
}
