# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the source of truth. This file records repository state only.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the new specification.

## Phase A - foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Fresh-start Phase A/B D1 schema covering users, auth identities, sessions, stable platform identities, handle history, profiles, organizations, memberships, invite/access gates, Superadmin grants, invite balances, invite-click events, and audit logs
- [x] Typed D1 access layer with explicit service-configuration failure when `DB` is not bound
- [x] URL configuration layer for public/app/tracking/API/MCP origins without hard-coding production domains
- [x] Legacy direct X OAuth 2.0 PKCE boundary retained temporarily behind environment configuration
- [x] Server-side hashed session tokens, CSRF boundary, logout/revocation, and Superadmin authorization check
- [x] Separate Superadmin grant architecture and protected admin API boundary
- [x] Fresh migration validated locally against SQLite
- [x] Provision Cloudflare D1 database `linkary-db` in account `2d862c45f8afbb8fb004dec8d16a2434`
- [x] Attach real `DB` D1 binding in `wrangler.jsonc`
- [x] Apply `migrations/0001_initial.sql` to remote D1 and verify schema in Cloudflare Console
- [x] Create dedicated Coinbase CDP `Linkary` project under the existing CDP account
- [x] Configure Linkary CDP branding
- [x] Configure dedicated Linkary Telegram authentication bot in CDP
- [x] Lock CDP as primary authentication + embedded-wallet provider
- [x] Add follow-up D1 migration `0002_cdp_auth_and_wallets.sql` without rewriting deployed `0001`
- [x] Document CDP identity separation and Telegram login/tracker bot boundaries
- [ ] Apply `migrations/0002_cdp_auth_and_wallets.sql` to remote D1
- [ ] Finish CDP client-domain allowlisting for `https://app.linkary.xyz` after DNS/custom domain is active
- [ ] Integrate CDP Frontend SDK in the authenticated Linkary app
- [ ] Add server-side CDP end-user access-token validation before trusting authenticated API calls
- [ ] Retire direct X OAuth routes only after the CDP cutover is deployed and verified
- [ ] Bootstrap the first Superadmin through a controlled database operation after owner login

## Phase B - user and profile foundation

- [x] Earn Access post-URL submission, using manual X URL evidence only and zero TwitterAPI.io calls
- [x] Network invite preview and invite-to-auth handoff foundation
- [x] Creator vs Company/Project onboarding choice without permanent human `user_type`
- [x] Creator profile claim foundation
- [x] Project/company Organization + owner membership + public profile creation foundation
- [x] Initial invite allocation model: Creator 10, Project 50
- [x] Stable provider UID plus append-only handle history model
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
- [ ] Additional project creation flow with a separately verified project platform identity
- [ ] Handle-change synchronization and old-Linkary-slug redirect workflow
- [ ] Integration tests with local D1 for auth, invite redemption, onboarding, profile visibility, RBAC, and Superadmin isolation

## Telegram attribution model locked for V1

- The founder/project installs the Linkary Tracker Bot in the founder's own destination Telegram groups/channels.
- Large third-party promotional communities do not need to install any Linkary bot.
- Promotional communities publish the founder's Linkary tracking URL.
- `l.linkary.xyz` records source/campaign/POC click attribution before redirecting to the founder's Telegram destination.
- The Tracker Bot verifies joins/leaves/retention in the founder's destination community where permissions allow.
- Telegram authentication bot and Telegram campaign Tracker Bot are separate responsibilities.

## Current commits

- `50e348f057738f76fb2f74b3af4f4b86e9aa9cad` - fresh Phase A/B identity, auth, onboarding, SEO and public-profile foundation
- `462745c52888c0bd900fcf8f7eb0dabd4c05ea1f` - profile editing, workspace lifecycle, invite balances, invite generation and first-party invite-click tracking
- `a0a4a59ea08bf9206b9391d8595ab7d90fb6df8c` - real Cloudflare D1 binding for `linkary-db`
- `7bbf39f2a5433861f58f2ff2449f3e8745ab264d` - CDP user/wallet identity migration
- `40cc302558c2f8c88ff1075b8d49bbae22e20e50` - CDP authentication and Telegram bot architecture documentation

## Deployment note

The production D1 database is provisioned, bound as `DB`, and has migration `0001_initial.sql` applied. `0002_cdp_auth_and_wallets.sql` is now queued and must be applied as a new migration rather than editing `0001`.

Production domains are being attached through Cloudflare. Target values are:

- `PUBLIC_SITE_URL=https://linkary.xyz`
- `APP_BASE_URL=https://app.linkary.xyz`
- `TRACKING_BASE_URL=https://l.linkary.xyz`
- `API_BASE_URL=https://api.linkary.xyz`
- `MCP_BASE_URL=https://mcp.linkary.xyz`

The Linkary CDP project is the primary authentication and embedded-wallet provider. The current direct-X OAuth code remains only as a temporary fallback until CDP authentication is working end-to-end.

See `docs/CLOUDFLARE_SETUP.md` and `docs/CDP_AUTH_ARCHITECTURE.md`.

## Deliberately deferred

TwitterAPI.io automation, paid social-data automation, creator referral payouts, wallet payments, deep analytics, audience overlap, and Grok MCP write actions remain deferred until the primary identity/profile/campaign foundation is deployed and verified.
