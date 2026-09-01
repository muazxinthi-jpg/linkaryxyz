import type { Env } from './env';

const productionShellCss = `
@media (max-width: 900px) {
  .auth-page.active { display: block; min-height: 100svh; }
  .auth-brand { display: none; }
  .auth-side { min-height: 100svh; }
}

@media (max-width: 700px) {
  html, body { min-width: 0; }
  .auth-side {
    display: block;
    min-height: 100svh;
    padding: max(18px, env(safe-area-inset-top)) 14px max(28px, env(safe-area-inset-bottom));
    background: var(--canvas);
  }
  .auth-card {
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
    padding: 18px 16px 24px;
    border-radius: 16px;
  }
  .auth-card > nav button { min-height: 48px; font-size: 14px; }
  .auth-card section > header { margin: 28px 0 22px; }
  .auth-card h2 {
    font-size: clamp(30px, 10vw, 40px);
    line-height: 1.02;
    letter-spacing: -.045em;
  }
  .auth-card header p { font-size: 14px; line-height: 1.45; }
  .sso { height: 52px; font-size: 14px; }
  .or { margin: 20px 0; font-size: 11px; }
  .role-select { grid-template-columns: 1fr 1fr; gap: 10px; }
  .role-select button { min-height: 124px; padding: 14px 12px; }
  .role-select button b { font-size: 14px; }
  .role-select button small { font-size: 12px; line-height: 1.25; }
  .auth-card label { font-size: 13px; }
  .auth-card input { height: 52px; font-size: 16px; }
  .password button { top: 11px; font-size: 12px; }
  .auth-options { gap: 12px; align-items: flex-start; }
  .auth-options label, .auth-options button { font-size: 12px; }
  .demo, .terms { font-size: 11px; line-height: 1.45; }
}

@media (max-width: 380px) {
  .auth-side { padding-inline: 10px; }
  .auth-card { padding-inline: 14px; border-radius: 14px; }
  .role-select { grid-template-columns: 1fr; }
  .role-select button { min-height: 94px; }
  .auth-options { flex-direction: column; }
}
`;

function isHtml(response: Response): boolean {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function productionHtml(html: string): string {
  const withoutPrototypeNavigation = html.replace(/<nav class="preview-nav"[\s\S]*?<\/nav>/i, '');
  if (withoutPrototypeNavigation.includes('id="linkary-production-shell-fixes"')) return withoutPrototypeNavigation;
  return withoutPrototypeNavigation.replace(
    '</head>',
    `<style id="linkary-production-shell-fixes">${productionShellCss}</style></head>`,
  );
}

export async function serveStatic(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (env.APP_ENV !== 'production' || !isHtml(response)) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');

  return new Response(productionHtml(await response.text()), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
