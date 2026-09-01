# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the source of truth. This file records repository state only.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the new specification.

## Phase A - foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Fresh-start Phase A/B D1 schema covering users, X auth identities, sessions, stable platform identities, handle history, profiles, organizations, memberships, invite/access gates, Superadmin grants, invite balances, invite-click events, and audit logs
- [x] Typed D1 access layer with explicit service-configuration failure when `DB` is not bound
- [x] URL configuration layer for public/app/tracking/API/MCP origins without hard-coding production domains
- [x] Real X OAuth 2.0 PKCE boundary implemented behind environment configuration
- [x] Server-side hashed session tokens, CSRF boundary, logout/revocation, and Superadmin authorization check
- [x] Separate Superadmin grant architecture and protected admin API boundary
- [x] Fresh migration validated locally against SQLite
- [x] Provision Cloudflare D1 database `linkary-db` in account `2d862c45f8afbb8fb004dec8d16a2434`
- [x] Attach real `DB` D1 binding in `wrangler.jsonc`
- [x] Apply `migrations/0001_initial.sql` to remote D1 and verify schema in Cloudflare Console
- [ ] Configure real X Developer credentials and callback vars
- [ ] Bootstrap the first Superadmin through a controlled database operation after owner login

## Phase B - user and profile foundation

- [x] Earn Access post-URL submission, using manual X URL evidence only and zero TwitterAPI.io calls
- [x] Network invite preview and invite-to-X-auth handoff
- [x] Creator vs Company/Project onboarding choice without permanent human `user_type`
- [x] Creator profile claim from verified X provider UID/current handle
- [x] Project/company Organization + owner membership + public profile creation from verified X identity
- [x] Initial invite allocation model: Creator 10, Project 50
- [x] Stable X provider UID plus append-only handle history model
- [x] Profile username history foundation
- [x] Published public-profile JSON read model
- [x] Public `/{username}` profile rendering foundation with canonical URL and SEO metadata
- [x] Dynamic sitemap and robots/noindex handling for private application/admin/API surfaces
- [x] Profile edit API
- [x] Profile block create/update/delete/reorder APIs
- [x] Profile publish/unpublish API
- [x] Organization list API
- [x] Organization archive/restore lifecycle, with no normal hard-delete path
- [x] Invite balance read API
- [x] Network invite creation with atomic credit consumption
- [x] First-party invite landing route and click attribution without TwitterAPI.io
- [x] Privacy-conscious persistent visitor token for invite unique-click analysis
- [ ] Responsive onboarding screens wired to the new APIs
- [ ] Profile editor UI wired to the profile/block APIs
- [ ] Workspace switcher UI wired to organizations
- [ ] Invite dashboard UI with remaining credits, clicks, joins, and conversions
- [ ] Team invitation/member management endpoints and UI
- [ ] Additional project creation flow with a separately verified project X identity
- [ ] Handle-change synchronization and old-Linkary-slug redirect workflow
- [ ] Integration tests with local D1 for auth, invite redemption, onboarding, profile visibility, RBAC, and Superadmin isolation

## Current commits

- `50e348f057738f76fb2f74b3af4f4b86e9aa9cad` - fresh Phase A/B identity, auth, onboarding, SEO and public-profile foundation
- `462745c52888c0bd900fcf8f7eb0dabd4c05ea1f` - profile editing, workspace lifecycle, invite balances, invite generation and first-party invite-click tracking
- `a0a4a59ea08bf9206b9391d8595ab7d90fb6df8c` - real Cloudflare D1 binding for `linkary-db`

## Deployment note

The production D1 database is now provisioned, bound as `DB`, migrated, and verified in the Cloudflare Console. Database-backed routes can now be deployed against the real schema once the Worker is deployed with the current `main` branch.

The real production domains are intentionally not hard-coded. Until they are attached, URL generation falls back to the active Worker origin. Later the following environment values can be configured without changing route logic:

- `PUBLIC_SITE_URL`
- `APP_BASE_URL`
- `TRACKING_BASE_URL`
- `API_BASE_URL`
- `MCP_BASE_URL`

See `docs/CLOUDFLARE_SETUP.md`.

## Deliberately deferred

TwitterAPI.io automation, paid social-data automation, creator referral payouts, CDP wallet payments, Telegram attribution, campaigns, deep analytics, audience overlap, and Grok MCP write actions remain deferred until Phase A/B identity/profile foundations are deployed and verified.
