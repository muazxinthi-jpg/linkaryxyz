# Linkary implementation status

The technical paper is the source of truth. This file records repository state only.

## Phase A — foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Initial identity schema migration (users, profiles, organizations, memberships)
- [ ] Provision D1 and attach the production binding
- [ ] Add authentication provider and server-side session boundary
- [ ] Add Superadmin role and audit-log boundary

## Phase B — first vertical slice

- [ ] Profile read model and published-profile route
- [ ] Registration and onboarding flow
- [ ] Organization creation and membership management
- [ ] Username reservation and rename history
- [ ] Public-profile SEO metadata and sitemap generation
- [ ] Unit/integration tests for authorization and profile visibility

## Deliberately deferred

Provider analytics, paid social-data automation, referral payouts, and deep intelligence remain deferred until the identity/profile/tracking foundations are stable.
