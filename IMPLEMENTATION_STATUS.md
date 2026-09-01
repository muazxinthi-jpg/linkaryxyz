# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the product/design sources of truth. This file records the current repository and production foundation.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the current specification.

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
- [x] Provision Cloudflare D1 database `linkary-db`
- [x] Attach real `DB` D1 binding in `wrangler.jsonc`
- [x] Apply `migrations/0001_initial.sql` to remote D1
- [x] Apply `migrations/0002_cdp_auth_and_wallets.sql` to remote D1
- [x] Production `cdp_user_links` table is live
- [x] Production `wallet_accounts` table is live
- [x] Create dedicated Coinbase CDP `Linkary` project
- [x] Configure Linkary CDP branding
- [x] Configure dedicated `LinkaryAuthBot` Telegram authentication bot in CDP
- [x] Configure CDP frontend/client domains for `linkary.xyz` and `app.linkary.xyz`
- [x] Lock CDP as primary authentication + embedded-wallet provider
- [x] Add follow-up D1 migration `0002_cdp_auth_and_wallets.sql` without rewriting deployed `0001`
- [x] Document CDP identity separation and Telegram login/tracker bot boundaries
- [x] Store CDP server API credentials as Cloudflare Worker secrets, never in Git
- [x] Implement server-side Coinbase CDP end-user access-token validation
- [x] Implement `POST /api/auth/cdp/session` Linkary session bridge
- [x] Keep Linkary backend authoritative after CDP authentication
- [x] Cloudflare Worker bundles with the narrow `@coinbase/cdp-sdk/auth` boundary after the x402 dependency issue
- [x] Production worker version `cdp-auth-foundation` deployed successfully
- [x] `linkary.xyz` production domain active
- [x] `app.linkary.xyz` production domain active
- [x] Production `/api/health` verifies database binding and CDP configuration
- [ ] Integrate the current official CDP Frontend SDK in the authenticated Linkary application
- [ ] Retire direct X OAuth routes only after the CDP frontend cutover is deployed and verified
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
- [x] Production shell removes the floating prototype navigation when `APP_ENV=production`
- [x] Mobile login/create-account shell has production responsive overrides for narrow phones, safe areas, readable controls, and iOS-friendly input sizing
- [ ] Replace the static authentication simulation with the real CDP frontend authentication UI
- [ ] Responsive first-time onboarding screens wired to the new APIs
- [ ] Profile editor UI wired to the profile/block APIs
- [ ] Workspace switcher UI wired to organizations
- [ ] Invite dashboard UI with remaining credits, clicks, joins, and conversions
- [ ] Team invitation/member management endpoints and UI
- [ ] Additional project creation flow with a separately verified project platform identity
- [ ] Handle-change synchronization and old-Linkary-slug redirect workflow
- [ ] Integration tests with local D1 for auth, invite redemption, onboarding, profile visibility, RBAC, and Superadmin isolation

## Current frontend state

The current public UI is still a static HTML/CSS/JavaScript product prototype. It is now treated as a temporary shell, not the target application architecture.

Production behavior:

- The public marketing design remains intact.
- The prototype bottom switcher is stripped from production HTML by the Worker.
- Development can retain the prototype switcher for local previewing when `APP_ENV` is not `production`.
- Mobile authentication pages receive production-only responsive shell fixes while the real React + TypeScript application is built.
- The static login form is still a simulation and must not be confused with the upcoming real CDP authentication implementation.

Target frontend migration remains:

React + TypeScript + Vite + React Router + Tailwind + shadcn/ui + TanStack Query + React Hook Form + Zod, while preserving the existing Linkary visual language.

## Telegram attribution model locked for V1

- The founder/project installs the Linkary Tracker Bot in the founder's own destination Telegram groups/channels.
- Large third-party promotional communities do not need to install any Linkary bot.
- Promotional communities publish the founder's Linkary tracking URL.
- `l.linkary.xyz` records source/campaign/POC click attribution before redirecting to the founder's Telegram destination.
- The Tracker Bot verifies joins/leaves/retention in the founder's destination community where permissions allow.
- Telegram authentication bot and Telegram campaign Tracker Bot are separate responsibilities.

## Production identity/security rules

- `User`, `Profile`, `Organization`, `OrganizationMembership`, `PlatformIdentity`, invites/referrals, and future billing remain separate concepts.
- Do not introduce a permanent human `user_type=creator/project`.
- X and Telegram reputation/history must attach to immutable platform IDs, not mutable handles.
- Never expose CDP API secrets in chat, source control, logs, or client code.
- The Linkary backend validates CDP access tokens before mapping or creating Linkary sessions.
- The current server API key has no trade, transfer, private-key export, or policy-management authority.
- Superadmin remains isolated behind `admin_grants` and protected authorization checks.
- TwitterAPI.io remains excluded from onboarding, launch access, invite validation, referral attribution, and acquisition attribution.

## Current commits of note

- `50e348f057738f76fb2f74b3af4f4b86e9aa9cad` - fresh Phase A/B identity, auth, onboarding, SEO and public-profile foundation
- `462745c52888c0bd900fcf8f7eb0dabd4c05ea1f` - profile editing, workspace lifecycle, invite balances, invite generation and first-party invite-click tracking
- `7bbf39f2a5433861f58f2ff2449f3e8745ab264d` - CDP user/wallet identity migration
- `40cc302558c2f8c88ff1075b8d49bbae22e20e50` - CDP authentication and Telegram bot architecture documentation
- `8707587e4656a36995aa5ea93c0ba4b56f4627dc` - route Coinbase CDP access tokens into Linkary sessions
- `317d92a5b5e9413dc68e2e83633bf77d5cd7f7c2` - fix CDP token validation for Cloudflare Workers bundling
- `d15a09184e25e64eaea25bd295649b48c2a6f415` - production shell/mobile auth responsiveness helper
- `047c9fc0c0023b1e62ed61f38d3d54ce03273da5` - serve production shell without prototype controls

## Deployment note

Production D1 migrations `0001_initial.sql` and `0002_cdp_auth_and_wallets.sql` are already applied. Never edit those deployed migrations. Future database changes begin with `0003_...`.

Current production values include:

- `PUBLIC_SITE_URL=https://linkary.xyz`
- `APP_BASE_URL=https://app.linkary.xyz`
- `APP_ENV=production`

Planned dedicated surfaces remain:

- `TRACKING_BASE_URL=https://l.linkary.xyz`
- `API_BASE_URL=https://api.linkary.xyz`
- `MCP_BASE_URL=https://mcp.linkary.xyz`

The Linkary CDP project is the primary authentication and embedded-wallet provider. The current direct-X OAuth code remains only as a temporary fallback until the frontend CDP authentication flow is working end-to-end.

See `docs/CLOUDFLARE_SETUP.md` and `docs/CDP_AUTH_ARCHITECTURE.md`.

## Immediate next milestone

A real person visits Linkary, authenticates through CDP, Linkary validates the CDP access token, creates or loads the D1 user and wallet mapping, completes Creator or Company/Project onboarding, and lands in the real authenticated dashboard.

Build order:

1. Real React + TypeScript application shell.
2. Current official Coinbase CDP frontend SDK integration.
3. Email OTP, Google, X, and Telegram authentication states.
4. CDP access token to `POST /api/auth/cdp/session`.
5. Linkary session hydration through `GET /api/auth/me`.
6. First-time Creator vs Company/Project onboarding.
7. Real authenticated dashboard and workspace switcher.
8. Controlled first Superadmin bootstrap only after real owner authentication.

## Deliberately deferred

TwitterAPI.io automation, paid social-data automation, creator referral payouts, wallet payments, deep analytics, audience overlap, and Grok MCP write actions remain deferred until the primary identity/profile/campaign foundation is deployed and verified.
