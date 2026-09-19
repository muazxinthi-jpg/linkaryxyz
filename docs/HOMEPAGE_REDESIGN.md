# Public homepage — approved Stitch design

Implements the desktop/mobile direction from stitch_linkary_homepage_redesign (3).zip as one responsive page.

## Scope

- Changes the public HTML, homepage-only CSS/JavaScript, and public pricing renderer.
- Uses the supplied illustrative portrait as a local asset. It is not a member photograph.
- The hero reads local photos from assets/homepage/hero-slides.json. Add images under assets/homepage and add their local asset path and accurate image description to that list; rotation and controls activate when there are at least two valid images. Automatic motion pauses for reduced-motion preference, hover, keyboard focus, hidden tabs, or the user's pause control.
- Enlarges the original wordmark by framing its actual artwork bounds in CSS; the brand asset is unchanged.
- Uses the existing signup/login destinations and existing public profile/auction entry points.
- Preserves the existing public Worker transformation and routing. Authenticated app code, authentication, tracking, billing endpoints, database migrations, deployment configuration, and preservation contracts are unchanged.
- Keeps pricing attached to /api/billing/plans, with one renderer, separate audience groups, catalog prices/promotions, and a retry state. The homepage intentionally shows names, audience, prices, and entry actions; commercial entitlements remain in the existing billing product.
- Uses the established LinkedIn, X, and Product Hunt destinations already present on the public site. Trustpilot remains visibly pending until an official destination is confirmed.
- Retains the previously approved Muaz Xinthi public profile link. Member and partner showcases use honest future states.
- Labels the community image “Early supporters” and omits the “Illustrative artwork” caption. Optional hero photos are listed in `assets/homepage/hero-slides.json`; add at least two local images in `assets/homepage/` with accurate alt text to enable automatic rotation. Visitors can navigate and pause the carousel, and reduced-motion preferences are respected.

## Validation

- Existing regression suite: 935 passing tests.
- Backend and authenticated app TypeScript checks.
- App and public Worker deployment dry runs.
- Browser checks at 320, 390, 768, 1024, and 1440 CSS pixels: no horizontal overflow, loaded local assets, six catalog plans.
- Mobile navigation opening/closing, Escape and section links; FAQ expansion.
- Pricing failure/retry and safe display of markup-like catalog text.
- Hero carousel fallback with one image, automatic rotation, manual controls, pause/resume, and reduced-motion behavior.

Local visual review uses the repository's default catalog through the existing public pricing handler. Production continues to use its current live catalog.

## Release

This is a reviewable branch change. Merge and release follow the repository's existing checks and production workflow. There are no migrations or configuration changes. Reverting the homepage commit restores the prior public design.
