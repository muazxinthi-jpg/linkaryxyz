export interface Env {
  ASSETS: Fetcher;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "linkary", version: "phase-a" });
    }

    // All non-API requests remain static so the existing preview is preserved.
    return env.ASSETS.fetch(request);
  },
};
