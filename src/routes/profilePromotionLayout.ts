const PROMOTION_LAYOUT_REFINEMENT = `<style id="linkary-promotion-layout-refinement-v4">
/* Geometry-only refinement. This intentionally does not alter promotion data, links or tracking. */
@media(min-width:1025px){
  .page.linkary-promotion-page .linkary-promotion-top{top:0!important;width:100%!important;padding-inline:18px!important}
  .page.linkary-promotion-page .linkary-sponsored-header{--linkary-cta-avatar-gap:clamp(68px,4.8vw,78px);width:100%!important;margin:-18px 0 0!important;transform:none!important}
  .page.linkary-promotion-page .linkary-sponsored-banner{height:clamp(285px,25vw,320px)!important}
  .page.linkary-promotion-page .linkary-promotion-hero .avatar{width:clamp(150px,11vw,170px)!important;height:clamp(150px,11vw,170px)!important;transform:translateY(-24px)!important}
}
@media(min-width:641px) and (max-width:1024px){
  .page.linkary-promotion-page .linkary-promotion-top{top:0!important;width:100%!important;padding-inline:16px!important}
  .page.linkary-promotion-page .linkary-sponsored-header{--linkary-cta-avatar-gap:clamp(56px,5vw,66px);width:100%!important;margin:-14px 0 0!important;transform:none!important}
  .page.linkary-promotion-page .linkary-sponsored-banner{height:clamp(270px,32vw,305px)!important}
  .page.linkary-promotion-page .linkary-promotion-hero .avatar{width:clamp(144px,17vw,164px)!important;height:clamp(144px,17vw,164px)!important;transform:translateY(-18px)!important}
}
@media(max-width:640px){
  .page.linkary-promotion-page .linkary-promotion-top{top:8px!important;width:100%!important;padding-inline:10px!important}
  .page.linkary-promotion-page .linkary-sponsored-header{--linkary-cta-avatar-gap:40px;width:100%!important;margin:-6px 0 0!important;transform:none!important}
  .page.linkary-promotion-page .linkary-sponsored-banner{height:248px!important}
  .page.linkary-promotion-page .linkary-promotion-hero .avatar{transform:translateY(-12px)!important}
}
</style>`;

export async function refinePublicProfilePromotionLayout(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const html = await response.text();
  const hasPromotionHolder = html.includes('id="linkary-sponsored-header-style"') && html.includes('linkary-sponsored-header');
  if (!hasPromotionHolder) {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  }

  const refined = html.includes('</head>')
    ? html.replace('</head>', `${PROMOTION_LAYOUT_REFINEMENT}</head>`)
    : `${PROMOTION_LAYOUT_REFINEMENT}${html}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(refined, { status: response.status, statusText: response.statusText, headers });
}
