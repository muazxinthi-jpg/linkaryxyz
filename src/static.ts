import type { Env } from './env';
import { getLinkaryUrls } from './urls';

const APP_SHELL_ASSET = '/assets/linkary-app/index.html';

const productionShellCss = `
.preview-disclosure {
  margin: 0 0 10px;
  padding: 7px 10px;
  border: 1px solid rgba(17, 21, 23, .12);
  border-radius: 999px;
  background: rgba(255, 255, 255, .9);
  color: #555d60;
  font: 600 11px/1.35 Inter, sans-serif;
  letter-spacing: .02em;
  width: fit-content;
  max-width: 100%;
}

.metric-float .preview-example-badge {
  background: #f2f2ee;
  color: #52585b;
}

.public-pricing {
  padding: 96px max(24px, calc((100vw - 1180px) / 2));
  background: #f6f6f2;
  border-top: 1px solid rgba(17, 21, 23, .08);
}
.public-pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}
.public-plan-card,
.public-pricing-loading {
  min-width: 0;
  padding: 22px;
  border: 1px solid rgba(17, 21, 23, .12);
  border-radius: 18px;
  background: #fff;
}
.public-plan-card { display: flex; flex-direction: column; }
.public-plan-card[data-plan="project_automate"] { border-color: rgba(255, 85, 0, .55); box-shadow: 0 0 0 2px rgba(255, 85, 0, .06); }
.public-plan-audience { color: #7b8083; font: 700 10px/1.3 Inter, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
.public-plan-card h3 { margin: 7px 0 14px; font: 600 23px/1.1 "Space Grotesk", sans-serif; }
.public-plan-price { display: flex; align-items: baseline; flex-wrap: wrap; gap: 7px; min-height: 46px; }
.public-plan-price del { width: 100%; color: #8b9092; font-size: 12px; }
.public-plan-price strong { font: 600 30px/1 "Space Grotesk", sans-serif; letter-spacing: -.04em; }
.public-plan-price span { color: #707678; font-size: 12px; }
.public-plan-promo { width: fit-content; margin: 10px 0 0; padding: 5px 8px; border-radius: 999px; background: #fff0e8; color: #b83d00; font-size: 10px; font-weight: 700; }
.public-plan-card > p { min-height: 66px; margin: 14px 0; color: #5f6669; font-size: 13px; line-height: 1.55; }
.public-plan-credits { display: flex; gap: 7px; align-items: baseline; margin: 0 0 10px; padding-top: 13px; border-top: 1px solid rgba(17, 21, 23, .08); }
.public-plan-credits strong { font-size: 18px; }
.public-plan-credits span { color: #707678; font-size: 12px; }
.public-plan-card ul { list-style: none; margin: 8px 0 20px; padding: 0; display: grid; gap: 8px; }
.public-plan-card li { position: relative; padding-left: 18px; color: #3f4547; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.public-plan-card li::before { content: '✓'; position: absolute; left: 0; color: #ff5500; font-weight: 800; }
.public-plan-card a { margin-top: auto; display: flex; min-height: 46px; align-items: center; justify-content: center; border-radius: 10px; background: #111517; color: #fff; font-weight: 700; text-decoration: none; }
.public-plan-card[data-plan="project_automate"] a { background: #ff5500; color: #111517; }
.public-pricing-note { margin: 20px 0 0; color: #687073; font-size: 12px; line-height: 1.5; }

@media (max-width: 1000px) {
  .public-pricing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

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
  .preview-disclosure { margin-inline: auto; }
  .public-pricing { padding: 64px 14px; }
  .public-pricing-grid { grid-template-columns: 1fr; }
  .public-plan-card, .public-pricing-loading { padding: 18px; border-radius: 15px; }
  .public-plan-card > p { min-height: 0; }
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

function isLegacyPrototype(html: string): boolean {
  return html.includes('class="preview-nav"') && html.includes('data-page="auth"');
}

function socialPreviewMeta(publicSite: string): string {
  const root = publicSite.replace(/\/$/, '');
  const image = `${root}/assets/brand/linkary-banner.jpeg`;
  return `<link rel="canonical" href="${root}/"><meta property="og:type" content="website"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="Linkary | Growth Intelligence Network"><meta property="og:description" content="Connect creator campaigns to clicks, communities, conversions, and real growth outcomes."><meta property="og:url" content="${root}/"><meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Linkary | Growth Intelligence Network"><meta name="twitter:description" content="Connect creator campaigns to clicks, communities, conversions, and real growth outcomes."><meta name="twitter:image" content="${image}">`;
}

function pricingSection(): string {
  return `<section class="public-pricing" id="pricing"><div class="section-head light"><div><span class="index">06 / PRICING</span><h2>Start free.<br><em>Upgrade when you need more.</em></h2></div><p>One live plan catalog for creators, founders and growth teams. Usage credits keep variable provider costs controlled without limiting Linkary first-party tracking.</p></div><div id="linkary-pricing-grid" class="public-pricing-grid" aria-live="polite"><article class="public-pricing-loading">Loading current Linkary plans…</article></div><p class="public-pricing-note">Paid plans use your Linkary wallet. Final paid access activates only after an eligible payment or account entitlement is verified.</p></section>`;
}

function pricingClientScript(appBase: string): string {
  const app = JSON.stringify(appBase.replace(/\/$/, ''));
  return `<script id="linkary-pricing-catalog">(function(){var app=${app};function money(cents,currency){if(cents===null)return'Custom';if(cents===0)return'$0';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD',minimumFractionDigits:2}).format(cents/100)}catch(_){return'$'+(cents/100).toFixed(2)}}function el(tag,cls,text){var node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}function render(plans){var grid=document.getElementById('linkary-pricing-grid');if(!grid)return;grid.replaceChildren();plans.forEach(function(plan){var card=el('article','public-plan-card');card.dataset.plan=plan.code||'';card.appendChild(el('span','public-plan-audience',plan.audience||''));card.appendChild(el('h3','',plan.name||''));var price=el('div','public-plan-price');var discounted=plan.basePriceCents!==null&&plan.effectivePriceCents!==null&&plan.effectivePriceCents<plan.basePriceCents;if(discounted)price.appendChild(el('del','',money(plan.basePriceCents,plan.currency)));price.appendChild(el('strong','',money(plan.effectivePriceCents,plan.currency)));if(plan.billingPeriod==='monthly')price.appendChild(el('span','','/ month'));card.appendChild(price);if(plan.promotion&&plan.promotion.label)card.appendChild(el('div','public-plan-promo',plan.promotion.label));card.appendChild(el('p','',plan.description||''));var credits=el('div','public-plan-credits');credits.appendChild(el('strong','',Number(plan.monthlyUsageCredits||0).toLocaleString()));credits.appendChild(el('span','','monthly usage credits'));card.appendChild(credits);var list=el('ul');(plan.features||[]).forEach(function(feature){list.appendChild(el('li','',feature))});card.appendChild(list);var cta=el('a','',plan.billingPeriod==='custom'?'Explore custom access':plan.code==='free'?'Create free profile':'Choose '+plan.name);cta.href=app+'/signup';card.appendChild(cta);grid.appendChild(card)})}fetch('/api/billing/plans',{credentials:'same-origin'}).then(function(response){if(!response.ok)throw new Error('pricing');return response.json()}).then(function(payload){render(payload.plans||[])}).catch(function(){var grid=document.getElementById('linkary-pricing-grid');if(grid){grid.replaceChildren(el('article','public-pricing-loading','Pricing is temporarily unavailable. Please try again shortly.'))}})})();</script>`;
}

function trustSafePublicPreview(html: string): string {
  const disclosure = '<p class="preview-disclosure" role="note">Illustrative product preview · Example data, not live customer results.</p>';
  return html
    .replace('<div class="hero-ui">', `<div class="hero-ui">${disclosure}`)
    .replace(/<i class="status live">● Live data<\/i>/g, '<i class="status preview-example-badge">Example data</i>')
    .replace(/<em>Updated 2m ago<\/em>/g, '<em>Illustrative product preview</em>')
    .replace('<span class="status complete">✓ Verified creator</span>', '<span class="status complete">Example creator</span>')
    .replace('<a href="#faq">Resources</a>', '<a href="#pricing">Pricing</a><a href="#faq">Resources</a>')
    .replace('<section class="faq" id="faq">', `${pricingSection()}<section class="faq" id="faq">`)
    .replace('<span class="index">06 / QUESTIONS</span>', '<span class="index">07 / QUESTIONS</span>')
    .replace('<section class="attribution matrix-light">', '<section class="attribution matrix-light" id="attribution">')
    .replace('<a>Campaigns</a><a>Creators</a><a>Analytics</a>', '<a href="#workflow">Campaigns</a><a href="#roles">Creators</a><a href="#attribution">Attribution</a>')
    .replace('<a>About</a><a>Contact</a><a>Privacy</a>', '<a href="#roles">About</a><a href="#faq">FAQ</a>')
    .replace('<a>Documentation</a><a>Help center</a><a href="./uilib.md">UI library</a>', '<a href="#workflow">How it works</a><a href="#faq">Help & questions</a>');
}

function productionHtml(html: string, appBase: string, publicSite: string): string {
  const withoutPrototypeNavigation = html.replace(/<nav class="preview-nav"[\s\S]*?<\/nav>/i, '');
  const safeAppBase = JSON.stringify(appBase.replace(/\/$/, ''));
  const redirectScript = `<script id="linkary-production-routing">(function(){var app=${safeAppBase};function clean(){history.replaceState(null,'',window.location.pathname+window.location.search);}function go(path){window.location.replace(app+path);}if(window.location.hash==='#auth'||window.location.hash.indexOf('#auth/')===0){go('/login');return;}if(window.location.hash==='#dashboard'||window.location.hash.indexOf('#dashboard/')===0){go('/dashboard');return;}if(window.location.hash==='#library'||window.location.hash==='#home'){clean();}window.addEventListener('DOMContentLoaded',function(){if(window.location.hash==='#home')clean();});document.addEventListener('click',function(event){var node=event.target&&event.target.closest?event.target.closest('[data-route]'):null;if(!node)return;var route=node.getAttribute('data-route');if(route==='auth'){event.preventDefault();event.stopImmediatePropagation();window.location.href=app+(node.getAttribute('data-auth')==='signup'?'/signup':'/login');return;}if(route==='home'){event.preventDefault();event.stopImmediatePropagation();clean();window.scrollTo({top:0,behavior:'smooth'});}},true);})();</script>`;
  const preview = socialPreviewMeta(publicSite);
  return trustSafePublicPreview(withoutPrototypeNavigation)
    .replace('</head>', `${preview}<style id="linkary-production-shell-fixes">${productionShellCss}</style>${redirectScript}${pricingClientScript(appBase)}</head>`);
}

function normalizeAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname === '/app/index.html') {
    url.pathname = APP_SHELL_ASSET;
    url.search = '';
    return new Request(url.toString(), request);
  }
  if (url.pathname !== '/') return request;
  url.pathname = '/index.html';
  return new Request(url.toString(), request);
}

function appHost(request: Request, env: Env): string | null {
  try {
    return new URL(env.APP_BASE_URL || new URL(request.url).origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAppDeepLink(request: Request, env: Env): boolean {
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) return false;
  const url = new URL(request.url);
  const configured = appHost(request, env);
  if (!configured || url.hostname.toLowerCase() !== configured) return false;
  if (url.pathname === '/app/index.html' || url.pathname === APP_SHELL_ASSET) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/app/assets/') || url.pathname.startsWith('/assets/')) return false;
  const last = url.pathname.split('/').filter(Boolean).pop() || '';
  return !last.includes('.');
}

function appShellRequest(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = APP_SHELL_ASSET;
  url.search = '';
  return new Request(url.toString(), { method: 'GET', headers: request.headers });
}

function productionHtmlHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return headers;
}

export async function serveStatic(request: Request, env: Env): Promise<Response> {
  let response = await env.ASSETS.fetch(normalizeAssetRequest(request));

  // Cloudflare Static Assets returns a real 404 for SPA deep links such as
  // /profile or /dashboard. Recover at the asset boundary so an app route can
  // never leak that 404 to the browser, even if host routing is bypassed or
  // refactored elsewhere in the Worker.
  if (response.status === 404 && isAppDeepLink(request, env)) {
    response = await env.ASSETS.fetch(appShellRequest(request));
  }

  if (env.APP_ENV !== 'production' || !isHtml(response)) return response;

  const source = await response.text();
  const headers = productionHtmlHeaders(response);
  if (!isLegacyPrototype(source)) {
    return new Response(source, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const urls = getLinkaryUrls(request, env);
  return new Response(productionHtml(source, urls.app, urls.publicSite), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
