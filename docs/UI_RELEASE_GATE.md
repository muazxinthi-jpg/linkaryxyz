# Linkary UI release gate

Updated: 2026-09-08

This gate is mandatory for any user-facing Linkary deployment. Read it together with `LINKARY_TECHNICAL_PRODUCT_PAPER.md`, `DELIVERY_TEAM.md`, `IMPLEMENTATION_STATUS.md` and `CODEX_NEXT_BUILD.md`.

## Principle

A feature is not complete when the backend works or when CI passes. It is complete only when the live user interface is readable, responsive, stable and consistent with the Linkary product system.

Readability and responsive behavior are product requirements, not post-release polish.

## Accepted UI preservation rule

Once a user-facing capability has been reviewed, accepted and confirmed in production, unrelated work must not remove, hide, rename or disconnect it unless an explicit product decision approves that change.

Every accepted UI contract that has previously regressed must have an automated source-level regression test. Critical accepted surfaces should also have a production-bundle health assertion so a stale or incomplete deployment is detected after release.

The Private Network contract under `/invites` is locked as:

- `Invitations`
- `My network`
- `Network map`
- Personal-profile network lineage across up to seven generations
- the approved interactive relationship map implementation, including current-user identity rendering

Project Network remains a separate Project workspace capability and must not replace or hide the Personal Private Network contract.

## Required review before merge

For every changed user-facing surface:

1. Verify information hierarchy, spacing and density.
2. Verify images, avatars, logos and media are constrained inside their intended containers.
3. Verify long names, handles, URLs and descriptions do not overlap or force horizontal page overflow.
4. Verify form controls, filters, buttons and tabs remain usable without cramped layouts.
5. Verify empty, loading, error and disabled states.
6. Verify keyboard focus states and practical pointer/tap targets.
7. Verify customer UI does not expose infrastructure/provider terminology or internal errors.
8. Verify no manual, estimated or uncertain metric is visually presented as verified evidence.
9. Verify accepted neighboring capabilities on the same workspace still exist and remain reachable after the change.

## Responsive acceptance widths

At minimum, review:

- 320px phone
- 375px phone
- 390px phone
- 430px phone
- tablet
- desktop

Responsive review must check:

- no horizontal document overflow
- no clipped headings or controls
- no image overflow
- readable type scale
- stacked forms where required
- usable modal behavior
- usable navigation
- sensible single-result and empty-result layouts
- action buttons that remain reachable without overlapping content

## Deployment gate

The release sequence is:

1. Implement functionality.
2. Run multidisciplinary review: product/architecture, engineering, security/trust, UI/UX, motion/interaction and data/attribution.
3. Run automated regression, TypeScript and Wrangler dry-run checks.
4. Complete responsive UI review at the required widths.
5. Fix P0/P1 functional or visual blockers before merge.
6. Merge to `main` and allow the normal production deployment.
7. Verify the live production surface after deployment.
8. Verify locked accepted UI contracts remain present in the deployed bundle.
9. If the live surface differs materially from review or has clipping, overflow, unusable controls, missing accepted capabilities or misleading evidence presentation, treat the deployment as incomplete and repair it before beginning the next feature.

## Partner Discovery regression rule

Partner Discovery cards specifically require:

- avatar/image width and height constrained to the avatar container
- clipping and `object-fit: cover` for profile images
- cards that adapt cleanly from multi-column desktop layouts to one-column mobile layouts
- compact evidence metrics that do not collide with identity content
- actions that wrap or stack instead of overflowing
- Community portfolio detail modal that remains usable on mobile

This rule exists because the first Partner Discovery release reached production with an unconstrained profile image that escaped its avatar container. That class of regression must be caught before deployment.
