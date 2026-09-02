export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'request_error') {
    super(message);
  }
}

function mergeHeaders(defaults: HeadersInit, provided?: HeadersInit): Headers {
  const headers = new Headers(defaults);
  if (!provided) return headers;

  const incoming = provided instanceof Headers ? provided : new Headers(provided);
  const getSetCookie = (incoming as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(incoming) : [];

  incoming.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    headers.set(key, value);
  });

  if (setCookies.length) {
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
  } else {
    const cookie = incoming.get('set-cookie');
    if (cookie) headers.append('set-cookie', cookie);
  }

  return headers;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = mergeHeaders(
    {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    init.headers,
  );
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function html(body: string, init: ResponseInit = {}): Response {
  const headers = mergeHeaders({ 'content-type': 'text/html; charset=utf-8' }, init.headers);
  return new Response(body, { ...init, headers });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new HttpError(415, 'Expected application/json', 'invalid_content_type');
  try { return (await request.json()) as T; }
  catch { throw new HttpError(400, 'Invalid JSON body', 'invalid_json'); }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.code, message: error.message }, { status: error.status });
  if (error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return json({ error: 'service_unavailable', message: error.message }, { status: (error as { status: number }).status });
  }
  console.error(error);
  return json({ error: 'internal_error', message: 'An unexpected error occurred' }, { status: 500 });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: 'method_not_allowed', message: `Allowed methods: ${allowed.join(', ')}` }, { status: 405, headers: { allow: allowed.join(', ') } });
}
