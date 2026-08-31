# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the source of truth. This file records repository state only.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the new specification.

## Phase A - foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Fresh-start Phase A/B D1 schema covering users, X auth identities, sessions, stable platform identities, handle history, profiles, organizations, memberships, invite/access gates, Superadmin grants, invite balances, and audit logs
- [x] Typed D1 access layer with explicit service-configuration failure when `DB` is not bound
- [x] URL configuration layer for public/app/tracking/API/MCP origins without hard-coding production domains
- [x] Real X OAuth 2.0 PKCE boundary implemented behind environment configuration
- [x] Server-side hashed session tokens, CSRF boundary, logout/revocation, and Superadmin authorization check
- [x] Separate Superadmin grant architecture and protected admin API boundary
- [ ] Provision Cloudflare D1 database `linkary-db` in account `2d862c45f8afbb8fb004dec8d16a2434`
- [ ] Attach real `DB` D1 binding in `wrangler.jsonc`
- [ ] Apply `migrations/0001_initial.sql` to remote D1 and verify schema
- [ ] Configure real X Developer credentials and callback vars
- [ ] Bootstrap the first Superadmin through a controlled database operation after owner login

## Phase B - first vertical slice

- [x] Earn Access post-URL submission, using manual X URL evidence only and zero TwitterAPI.io calls
- [x] Network invite preview and invite-to-X-auth handoff
- [x] Creator vs Company/Project onboarding choice without permanent human `user_type`
- [x] Creator profile claim from verified X provider UID/current handle
- [x] Project/company Organization + owner membership + public profile creation from verified X identity
- [x] Initial invite allocation model: Creator 10, Project 50
- [x] Stable X provider UID plus append-only handle history model
- [x] Profile username history foundation
- [ ] Profile editor write APIs and publish flow
- [ ] Organization list/create/archive/restore/team endpoints
- [ ] Invite creation/credit-use endpoints
- [ ] Responsive onboarding screens wired to APIs
- [ ] Integration tests with local D1

## Deployment note

Database-backed routes remain unavailable until real D1 is provisioned and `DB` is attached. This is deliberate. No fake database or fake production authentication is used.

See `docs/CLOUDFLARE_SETUP.md`.

## Deliberately deferred

TwitterAPI.io automation, paid social-data automation, referral payouts, CDP wallet payments, Telegram attribution, campaigns, deep analytics, audience overlap, and Grok MCP write actions remain deferred until Phase A/B identity/profile foundations are deployed and verified.
