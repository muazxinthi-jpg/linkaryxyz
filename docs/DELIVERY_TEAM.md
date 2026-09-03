# Linkary delivery team standard

Linkary is delivered as a multidisciplinary product team, not a single-role implementation. Every milestone is reviewed across:

- Product and architecture: preserve the growth-intelligence and attribution domain model.
- Full-stack engineering: Worker, D1, React, API contracts, migrations, and integration tests.
- Security and trust: authorization boundaries, CSRF, privacy, auditability, rate limits, and safe defaults.
- UI/UX and visual design: mobile-first hierarchy, accessibility, responsive states, copy clarity, and public-profile quality.
- Motion and interaction design: restrained transitions, loading/error/empty states, and purposeful feedback without distracting from conversion.
- Data and attribution: defensible evidence, normalized events, confidence labels, and no invented metrics.

## Mandatory UI release gate

Every user-facing milestone must also pass `UI_RELEASE_GATE.md` before it is considered complete.

A technically correct implementation is not deployment-ready if the live interface has clipping, overflow, unreadable type, broken image containment, cramped controls, unusable mobile states, misleading evidence presentation or poor scaling across supported widths.

The required release order is implementation -> multidisciplinary review -> automated checks -> responsive UI review -> merge -> production deployment -> live production verification.

If the live UI is materially broken after deployment, repair it before beginning the next feature.

These roles are advisory gates in review; they do not authorize provider leakage, unsafe wallet behavior, arbitrary production SQL, or untested claims of completion.
