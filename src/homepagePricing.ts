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

export async function enhancePublicHomepage(request: Request, response: Response): Promise<Response> {
  if (request.method !== 'GET') return response;
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/' && pathname !== '/index.html') return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  if (!html.includes('id="pricing"')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="/pricing-home.css">\n</head>');
    const faqMarker = '<section class="faq" id="faq">';
    if (html.includes(faqMarker)) html = html.replace(faqMarker, `${PRICING_SECTION}\n      ${faqMarker}`);
    else html = html.replace('</main>', `${PRICING_SECTION}\n  </main>`);
    html = html.replace('</body>', '  <script src="/pricing-home.js" defer></script>\n</body>');
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
