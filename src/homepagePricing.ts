const PRICING_SECTION = `<section class="pricing-home" id="pricing" aria-labelledby="pricing-title">
  <div class="pricing-home-head">
    <div><span class="index">06 / PRICING</span><h2 id="pricing-title">Start lean.<br><em>Scale when growth needs it.</em></h2></div>
    <p>Choose the operating allowance that fits your profile or Project. Usage Credits cover provider-assisted and intelligence features while first-party tracking remains available.</p>
  </div>
  <div class="pricing-beta-note"><strong>Controlled Beta</strong><span>We are not requiring payment from initial Beta users. Eligible plans can be granted manually by Linkary while we validate real workflows.</span></div>
  <div class="pricing-home-grid" data-pricing-grid aria-live="polite" aria-busy="true">
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
  </div>
  <p class="pricing-home-footnote">Usage Credits are an operating allowance, not money, rewards, or transferable value. Plan details shown here come from Linkary's live billing catalog.</p>
</section>`;

const LEGACY_INLINE_PRICING = /<script\s+id=["']linkary-pricing-catalog["'][^>]*>[\s\S]*?<\/script>/i;
const STATIC_PRICING_SCRIPT = '<script src="/pricing-catalog.js" defer></script>';

function appendBeforeBody(html: string, markup: string): string {
  if (html.includes('</body>')) return html.replace('</body>', `  ${markup}\n</body>`);
  return `${html}\n${markup}`;
}

export async function enhancePublicHomepage(request: Request, response: Response): Promise<Response> {
  if (request.method !== 'GET') return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const pathname = new URL(request.url).pathname;
  let html = await response.text();

  // Production legacy pages already contain the correct pricing section, but an
  // older inline renderer can leak JavaScript into the visible document. Remove
  // only that renderer and replace it with a normal external asset. This leaves
  // the existing homepage/header/hero/layout HTML completely untouched.
  html = html.replace(LEGACY_INLINE_PRICING, '');
  if (html.includes('id="linkary-pricing-grid"') && !html.includes('/pricing-catalog.js')) {
    html = appendBeforeBody(html, STATIC_PRICING_SCRIPT);
  }

  // Fallback for a public shell that does not yet contain the production pricing
  // section. Limit this additive path to the actual homepage only.
  if ((pathname === '/' || pathname === '/index.html') && !html.includes('id="pricing"')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="/pricing-home.css">\n</head>');
    const faqMarker = '<section class="faq" id="faq">';
    if (html.includes(faqMarker)) html = html.replace(faqMarker, `${PRICING_SECTION}\n      ${faqMarker}`);
    else html = html.replace('</main>', `${PRICING_SECTION}\n  </main>`);
    html = appendBeforeBody(html, '<script src="/pricing-home.js" defer></script>');
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
