# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the product/design sources of truth. This file records repository state and separately identifies what is actually deployed.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the current specification.

## Phase A - foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Fresh-start Phase A/B D1 schema covering users, auth identities, sessions, stable platform identities, handle history, profiles, organizations, memberships, invite/access gates, Superadmin grants, invite balances, invite-click events, and audit logs
- [x] Typed D1 access layer with explicit service-configuration failure when `DB` is not bound
- [x] URL configuration layer for public/app/tracking/API/MCP origins
- [x] Server-side hashed session tokens, CSRF boundary, logout/revocation, and Superadmin authorization check
- [x] Separate Superadmin grant architecture and protected admin API boundary
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
- [x] Store CDP server API credentials as Cloudflare Worker secrets, never in Git
- [x] Implement server-side Coinbase CDP end-user access-token validation using the narrow `@coinbase/cdp-sdk/auth` boundary
- [x] Implement `POST /api/auth/cdp/session` Linkary session bridge
- [x] Enforce Linkary invite/approved-access entitlement before a new CDP identity can receive a Linkary session
- [x] Keep Linkary backend authoritative after CDP authentication
- [x] Synchronize CDP X and Telegram authentication identities into stable `platform_identities` with handle history
- [x] Production worker version `cdp-auth-foundation` deployed successfully
- [x] `linkary.xyz` production domain active
- [x] `app.linkary.xyz` production domain active
- [x] Production `/api/health` verifies database binding and CDP configuration
- [x] Current official CDP frontend packages added to the authenticated React application
- [ ] Deploy the new React/CDP frontend milestone to production
- [ ] Retire direct X OAuth routes only after the CDP frontend cutover is deployed and verified end-to-end
- [ ] Bootstrap the first Superadmin through a controlled database operation after owner login

## Phase B - user and profile foundation

- [x] Earn Access post-URL submission, using manual X URL evidence only and zero TwitterAPI.io calls
- [x] Earn Access now hands off into CDP authentication rather than legacy direct-X OAuth
- [x] Network invite preview and first-party invite landing foundation
- [x] Network invite landing now hands off into the CDP application and supports Email, Google, X, or Telegram authentication
- [x] Creator vs Company/Project onboarding choice without permanent human `user_type`
- [x] Onboarding no longer requires an X identity before a Linkary username can be claimed
- [x] Access entitlement limits the account types a user can create, including Creator-only Earn Access
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
- [x] First-party invite click attribution without TwitterAPI.io
- [x] Privacy-conscious persistent visitor token for invite unique-click analysis
- [x] Production shell removes the floating prototype navigation when `APP_ENV=production`
- [x] Mobile authentication UI is designed mobile-first with safe areas, full-width phone layout, 52px controls, and 16px mobile inputs
- [x] Real React + TypeScript + Vite authenticated application structure exists in `frontend/`
- [x] Real CDP Email OTP flow implemented
- [x] Real CDP Google OAuth flow implemented
- [x] Real CDP X OAuth flow implemented
- [x] Real CDP Telegram authentication flow implemented
- [x] CDP access token is bridged to the Linkary backend and followed by `/api/auth/me`
- [x] Responsive first-time Creator vs Company/Project onboarding UI is wired to the backend
- [x] Initial authenticated app shell and workspace selector are implemented
- [x] Initial authenticated routes exist for dashboard, campaigns, creators, communities, tracking, profile, invites, settings, and isolated Superadmin
- [ ] Profile editor UI wired to the profile/block APIs
- [ ] Full workspace switcher behavior for multiple organizations and additional projects
- [ ] Invite dashboard with generated links, clicks, joins, conversions, and quality state
- [ ] Team invitation/member management endpoints and UI
- [ ] Additional project creation flow with a separately verified project platform identity
- [ ] Old-Linkary-slug redirect workflow after profile username changes
- [ ] Integration tests with local D1 for auth, invite redemption, onboarding, profile visibility, RBAC, and Superadmin isolation

## Frontend architecture

Public production target:

- `linkary.xyz` remains the public marketing site and public profile host.
- `linkary.xyz/{username}` remains the public profile route.
- `app.linkary.xyz` now has a dedicated React SPA build target rather than reusing the public static prototype as the authenticated application.
- Vite builds the authenticated app into `app/` during CI/deployment.
- The Worker serves the React shell by hostname for `app.linkary.xyz` while preserving the existing public marketing assets on `linkary.xyz`.
- Public marketing login/create-account controls are redirected to the real app in production.
- `app.linkary.xyz` is explicitly noindexed.

The current authenticated app uses React + TypeScript + Vite + React Router and the official CDP frontend packages. Tailwind, shadcn/ui, TanStack Query, React Hook Form, Zod, Recharts, and dnd-kit remain incremental frontend additions rather than reasons to delay the working auth/onboarding milestone.

## Authentication and onboarding flow now represented in code

1. User opens `app.linkary.xyz` as an existing user, through a Linkary invitation, or through Creator Earn Access.
2. Coinbase CDP authenticates through Email OTP, Google, X, or Telegram.
3. The frontend retrieves the CDP end-user access token.
4. The frontend posts the token and any invite/access context to `/api/auth/cdp/session`.
5. The backend independently validates the CDP access token with Coinbase.
6. New Linkary users must have a valid invite or approved access path before a Linkary server session is issued.
7. X and Telegram provider identities are synchronized against stable provider UIDs, not mutable usernames.
8. The frontend hydrates the Linkary server session with `/api/auth/me` and `/api/onboarding/status`.
9. First-time users choose Creator or Company / Project according to their access entitlement.
10. The user chooses a Linkary username, the profile/org is created, initial invite credits are granted, and the user enters the authenticated dashboard.

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
- X and Telegram reputation/history attach to immutable platform IDs, not mutable handles.
- Never expose CDP API secrets in chat, source control, logs, or client code.
- The Linkary backend validates CDP access tokens before mapping or creating Linkary sessions.
- The current server API key has no trade, transfer, private-key export, or policy-management authority.
- Superadmin remains isolated behind `admin_grants` and protected authorization checks.
- TwitterAPI.io remains excluded from onboarding, launch access, invite validation, referral attribution, and acquisition attribution.

## Current commits of note

- `8707587e4656a36995aa5ea93c0ba4b56f4627dc` - route Coinbase CDP access tokens into Linkary sessions
- `317d92a5b5e9413dc68e2e83633bf77d5cd7f7c2` - fix CDP token validation for Cloudflare Workers bundling
- `047c9fc0c0023b1e62ed61f38d3d54ce03273da5` - serve production shell without prototype controls
- `b729b8144e92081a6008289e8ba2a6504605331b` - responsive authentication shell across phones and tablets
- `87d0e14d00ddacbb168ac11f53513c11c7272b3a` - enforce invite-only access inside the CDP session bridge
- `4e77713f42769453f97db3f314af0f420818ae48` - route Linkary invitations through CDP app authentication
- `b980f384798ac39f3500b565284351de97b17046` - CDP social stable-identity sync and flexible first onboarding
- `3a88a1368258abb200797d74ffa45e62ce6a38dd` - real React CDP authentication, onboarding, app shell, hostname routing, and CI build integration

## CI/CD status

GitHub Actions is configured for:

push/merge to `main` -> install dependencies -> type-check authenticated app -> build React app -> Wrangler dry-run -> deploy only when Cloudflare repository secrets exist.

The workflow for commit `3a88a1368258abb200797d74ffa45e62ce6a38dd` passed:

- dependency installation
- React/TypeScript type-check
- Vite authenticated-app build
- Cloudflare Wrangler dry-run, including Worker bundling

Production deployment is currently skipped because the GitHub repository does not yet contain:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

This is a one-time GitHub/Cloudflare configuration requirement. No Cloudflare credential is to be pasted into chat or committed to Git.

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

The currently live Worker remains the earlier `cdp-auth-foundation` deployment until GitHub's Cloudflare deployment secrets are configured and the successful workflow is rerun. Repository code is ahead of production.

## Immediate next milestone after deployment

1. Configure the two one-time GitHub Actions Cloudflare repository secrets.
2. Deploy the passing React/CDP milestone to production.
3. Test Email OTP, Google, X, and Telegram on the real `app.linkary.xyz` domain.
4. Complete the first real invited owner account and verify Creator/Project onboarding against production D1.
5. Bootstrap the first Superadmin only after the real owner user ID exists.
6. Build the real Profile Editor and Invite dashboard on the authenticated shell.

## Deliberately deferred

TwitterAPI.io automation, paid social-data automation, creator referral payouts, wallet payments, deep analytics, audience overlap, and Grok MCP write actions remain deferred until the primary identity/profile/campaign foundation is deployed and verified.
