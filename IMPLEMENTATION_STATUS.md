# Linkary implementation status

The Technical Product and Engineering Paper v1.1 and `uilib.md` are the source of truth. This file records repository state only.

Fresh-start rule: legacy Linkary implementation decisions are not authoritative. Reuse only code that independently matches the new specification.

## Phase A - foundation

- [x] Cloudflare Worker entrypoint with static-asset fallback
- [x] `/api/health` runtime smoke endpoint
- [x] Fresh-start D1 schema covering users, auth identities, sessions, stable platform identities, handle history, profiles, organizations, memberships, invite/access gates, Superadmin grants, invite balances, invite-click events, and audit logs
- [x] Typed D1 access layer with explicit service-configuration failure when `DB` is not bound
- [x] URL configuration layer for public/app/tracking/API/MCP origins without hard-coding production domains
- [x] Server-side hashed Linkary session tokens, CSRF boundary, logout/revocation, and Superadmin authorization check
- [x] Separate Superadmin grant architecture and protected admin API boundary
- [x] Provision Cloudflare D1 database `linkary-db` in account `2d862c45f8afbb8fb004dec8d16a2434`
- [x] Attach real `DB` D1 binding in `wrangler.jsonc`
- [x] Apply `migrations/0001_initial.sql` to remote D1 and verify schema in Cloudflare Console
- [x] Create separate Coinbase CDP project for Linkary
- [x] Configure Linkary CDP branding and Telegram authentication bot
- [x] Define CDP as primary authentication and embedded-wallet provider
- [x] Add `migrations/0002_cdp_auth.sql` for embedded wallet account storage on the CDP migration branch
- [x] Add backend CDP access-token validation/session-exchange boundary on the CDP migration branch
- [x] Add stable X and Telegram UID mapping from validated CDP authentication methods
- [ ] Install and lock `@coinbase/cdp-sdk` locally before the CDP branch can compile or merge
- [ ] Create Linkary CDP Secret API Key and store ID/secret as Cloudflare Worker secrets
- [ ] Apply `migrations/0002_cdp_auth.sql` to remote D1 after branch validation
- [ ] Bootstrap the first Superadmin through a controlled database operation after owner CDP login

Direct X OAuth PKCE code remains temporarily as a rollback/migration fallback. It is no longer the intended primary login path and new UI must not depend on it.

## Phase B - user and profile foundation

- [x] Earn Access post-URL submission, using manual X URL evidence only and zero TwitterAPI.io calls
- [x] Network invite preview and first-party invite click attribution
- [x] Creator vs Company/Project onboarding choice without permanent human `user_type`
- [x] Initial invite allocation model: Creator 10, Project 50
- [x] Stable platform UID plus append-only handle history model
- [x] Profile username history foundation
- [x] Published public-profile JSON read model
- [x] Public `/{username}` profile rendering foundation with canonical URL and SEO metadata
- [x] Dynamic sitemap and robots/noindex handling for private application/admin/API surfaces
- [x] Profile edit and block CRUD/reorder APIs
- [x] Profile publish/unpublish API
- [x] Organization list and archive/restore lifecycle
- [x] Invite balance read API
- [x] Network invite creation with atomic credit consumption
- [x] Privacy-conscious persistent visitor token for invite unique-click analysis
- [x] CDP migration branch removes mandatory X identity from normal invite onboarding
- [x] CDP migration branch lets users choose a Linkary username, with X/Telegram handle used only as a suggestion/default
- [x] CDP migration branch preserves X-only ownership verification for Earn Access without TwitterAPI.io
- [ ] Responsive CDP login and onboarding screens
- [ ] Profile editor UI wired to the profile/block APIs
- [ ] Workspace switcher UI wired to organizations
- [ ] Invite dashboard UI with remaining credits, clicks, joins, and conversions
- [ ] Team invitation/member management endpoints and UI
- [ ] Additional project creation flow with separately verified project identities
- [ ] Handle-change synchronization and old-Linkary-slug redirect workflow
- [ ] Integration tests with local D1 for CDP auth, invite redemption, Earn Access, onboarding, profile visibility, RBAC, and Superadmin isolation

## Current production infrastructure

Cloudflare Worker: `linkary-xyz`

D1:

- database: `linkary-db`
- binding: `DB`
- database ID: `cc44263b-f179-4c2b-be75-343cb9967d77`

Coinbase CDP Linkary Project ID:

`ec85aa2b-208c-4ec9-a0f2-3da31a8e2218`

The `linkary.xyz` zone is currently being migrated from Namecheap DNS to Cloudflare. Assigned nameservers are:

- `khloe.ns.cloudflare.com`
- `rocky.ns.cloudflare.com`

Once the Cloudflare zone is Active, attach `linkary.xyz` and `app.linkary.xyz`, then allowlist `https://app.linkary.xyz` in CDP Clients.

## Active build branch

`build/cdp-auth-foundation`

Important branch commits include:

- `32a0aa54f51fc9079b803e1aaddadeaebea5f069` - CDP wallet-account migration
- `7ff0e59cd16aae8dd9c001ee9d56584197967883` - CDP user, stable platform identity, and wallet mapping
- `cd28730d5303f522b1742fa561d389c2e9898ec0` - CDP access-token validation and Linkary session exchange
- `741a71e91fab17abd0aa67a1dc6fbc5ab031c25f` - CDP environment boundary
- subsequent branch commits route invites/Earn Access/onboarding through CDP

Do not merge or deploy this branch until the CDP server SDK dependency is installed, TypeScript checks pass, migration 0002 is validated, and required Worker secrets are configured.

## Domain/environment values

Production target:

- `PUBLIC_SITE_URL=https://linkary.xyz`
- `APP_BASE_URL=https://app.linkary.xyz`
- `TRACKING_BASE_URL=https://l.linkary.xyz`
- `API_BASE_URL` can initially share the app/Worker origin and later move to `https://api.linkary.xyz`
- `MCP_BASE_URL=https://mcp.linkary.xyz` later

See `docs/CDP_AUTH_SETUP.md` and `docs/CLOUDFLARE_SETUP.md`.

## V1 Telegram attribution boundary

The future Linkary Tracker Bot is installed in the founder/project's own destination Telegram chats/channels, not in large third-party promotional communities. Promotional communities only publish Linkary tracking URLs. Linkary associates the source promotional platform and POC with click attribution, while the founder-owned Tracker Bot verifies destination joins/leaves/retention.

## Deliberately deferred

TwitterAPI.io paid intelligence, audience overlap, creator referral payouts, wallet payments, full Telegram Tracker Bot implementation, campaigns/manual tracking UI, deep analytics, and Grok MCP write actions remain behind the authentication/profile foundation.
