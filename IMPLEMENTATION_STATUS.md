# Linkary implementation status

The Technical Product and Engineering Paper v1.2 and `uilib.md` are the product and design sources of truth. This file records repository state and production state separately.

Fresh-start rule: old Linkary implementation decisions are not authoritative unless they independently match the current specification.

## Production foundation

- [x] Cloudflare Worker `linkary-xyz` is deployed.
- [x] Production domains `linkary.xyz` and `app.linkary.xyz` are active.
- [x] Production D1 database `linkary-db` is bound as `DB`.
- [x] `migrations/0001_initial.sql` applied to production.
- [x] `migrations/0002_cdp_auth_and_wallets.sql` applied to production.
- [x] `migrations/0003_creator_access_review.sql` applied to production.
- [x] CDP project, branding, frontend domains, Telegram authentication bot, and server validation credentials are configured.
- [x] GitHub repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.
- [x] GitHub Actions runs tests, TypeScript checks, Wrangler dry-run, and production deployment on `main`.
- [x] Pull requests run verification but do not deploy production.
- [x] Production release `37add9f4ba57fc9e565ce8ebb03b594e43d0ad1b` deployed successfully through GitHub Actions.

## Authentication and identity

- [x] React + TypeScript + Vite authenticated application exists in `frontend/`.
- [x] Email OTP authentication implemented.
- [x] Google authentication implemented.
- [x] X authentication implemented.
- [x] Telegram authentication implemented.
- [x] Frontend access token is bridged to `POST /api/auth/cdp/session`.
- [x] Linkary backend independently validates the authentication token before trusting identity data.
- [x] Linkary server sessions use secure HTTP-only cookies, hashed session tokens, CSRF protection, logout, and revocation.
- [x] Stable X and Telegram provider UIDs are stored separately from mutable handles.
- [x] Handle history is preserved.
- [x] Human accounts are not permanently typed as Creator or Project.

## Invite-only onboarding

- [x] New users require a valid Linkary invitation or approved Creator Earn Access path.
- [x] Creator first workspace receives 10 network invites.
- [x] Company / Project first workspace receives 50 network invites.
- [x] Creator onboarding creates a creator public profile.
- [x] Company / Project onboarding creates an Organization, owner membership, and project public profile.
- [x] Initial private owner bootstrap invitation exists as a single-use invitation for the first real owner account.
- [ ] First real owner account still needs to complete registration.
- [ ] First Superadmin grant still needs to be bootstrapped after that real user exists.

## Creator Earn Access

Production flow:

1. Creator opens Create account.
2. Creator chooses Creator.
3. Creator authenticates first.
4. Linkary creates a unique `LKY-...` claim.
5. Linkary shows fixed approved X copy containing `@Linkaryxyz` and the claim code.
6. `Post on X` opens X compose with the curated copy.
7. Creator publishes the post and returns to Linkary.
8. Creator submits the resulting X status URL.
9. Submission enters the Superadmin review queue.
10. Superadmin approves or rejects the claim.
11. Approval creates a one-time Creator-only Linkary access path.
12. Creator continues into normal onboarding and claims a Linkary username.

Current controls:

- [x] Arbitrary X URLs do not automatically grant access.
- [x] Only canonical X/Twitter status URLs are accepted as evidence.
- [x] Duplicate post reuse is blocked by the database uniqueness constraint.
- [x] Manual Superadmin review is the default.
- [x] Rejection reason and review history are preserved.
- [x] Superadmin review actions are protected by the existing server-side Superadmin grant boundary.
- [x] Legacy arbitrary-URL Earn Access endpoint is retired.
- [x] Automated verification is represented as an admin setting but remains disabled by default.
- [ ] TwitterAPI.io verification provider integration is deferred until Superadmin explicitly enables and configures it.

Important rule: TwitterAPI.io is not required for launch access, referrals, invite attribution, or acquisition attribution.

## Superadmin

- [x] `admin_grants` architecture exists.
- [x] `/admin/*` is isolated from normal workspaces.
- [x] Creator Earn Access review queue backend exists.
- [x] Approve and reject actions exist.
- [x] Verification mode setting exists.
- [ ] First real Superadmin user grant is not yet created.
- [ ] Full Superadmin operations dashboard beyond Creator Access review remains to be built.

Future Superadmin controls include invite operations, account moderation, reputation moderation, provider costs, referral holds, plans/contact credits, compliance, and support tools.

## URLs and public surfaces

- [x] `linkary.xyz` remains the marketing and public profile host.
- [x] `app.linkary.xyz` remains the authenticated application.
- [x] Clean `/login` and `/signup` routes are used instead of permanent hash routes.
- [x] Public marketing CTAs route to the authenticated application.
- [x] `app.linkary.xyz` is noindexed.
- [x] Production prototype toolbar is removed from normal production rendering.
- [x] Main public page contains Open Graph and Twitter card metadata.
- [x] Published public profile pages include canonical and SEO metadata.
- [ ] Dedicated generated 1200x630 social preview artwork should replace the current temporary brand image.
- [ ] Dynamic profile-specific preview images remain to be built.

## Public profiles

- [x] Public `linkary.xyz/{username}` profile rendering foundation.
- [x] Public profile JSON read model.
- [x] Profile edit APIs.
- [x] Profile block create, update, delete, and reorder APIs.
- [x] Profile publish and unpublish APIs.
- [x] Username history foundation.
- [x] Sitemap and robots handling.
- [ ] Real Profile Editor UI wired to these APIs.
- [ ] Drag and drop profile editor.
- [ ] Appearance and SEO editor.
- [ ] Live mobile preview.
- [ ] Creator media kit, campaign proof, reputation, Work With Me, and Linkary Score modules.

## Organizations and workspaces

- [x] Organization creation during Project onboarding.
- [x] Owner membership creation.
- [x] Organization list API.
- [x] Archive and restore lifecycle.
- [x] Initial workspace selector.
- [ ] Full multi-organization workspace switching.
- [ ] Additional project creation.
- [ ] Team invitation and membership management.

## Invites and referrals

- [x] Invite balance model.
- [x] Invite ledger.
- [x] Network invite creation with credit consumption.
- [x] First-party invite landing and click attribution.
- [x] Persistent privacy-conscious visitor token foundation.
- [ ] Invite dashboard UI.
- [ ] Registration and conversion reporting.
- [ ] Referral quality scoring and credit refresh rules.

## Campaign and attribution product

The next product milestone after first-user onboarding is the V1 campaign operating system.

Still to build in the official production stack:

- [ ] Campaign CRUD.
- [ ] Activity and deliverable tracking.
- [ ] Creator, promotional community, and POC assignment.
- [ ] Manual campaign spend and outcome entry.
- [ ] `l.linkary.xyz` first-party redirect infrastructure.
- [ ] Click and visitor attribution.
- [ ] Conversion ingestion.
- [ ] Telegram destination-community Tracker Bot.
- [ ] Join, leave, and retention verification where Telegram permissions allow.
- [ ] CPC, CPA, cost per join, cost per retained user, conversion, and ROI calculations.
- [ ] Data labels: Manual, Linkary tracked, Telegram verified, Provider verified.
- [ ] CSV export.

## Reputation

Still to build:

- [ ] Manager / POC reputation entity and UI.
- [ ] Promotional Platform reputation entity and UI.
- [ ] Upvote and downvote system.
- [ ] Reason tags.
- [ ] 180 Unicode character reviews.
- [ ] Verified campaign weighting.
- [ ] Vote-change audit history.
- [ ] Moderation, disputes, and anti-brigading controls.

POC reputation and Promotional Platform reputation must remain separate.

## Wallet and payment safety

- [x] Embedded wallet mapping foundation exists.
- [x] Current server credential does not have trade, transfer, private-key export, or policy-management authority.
- [x] User-controlled wallet model remains the locked direction.
- [ ] Subscription payment authorization is future work.
- [ ] Creator payout authorization is future work.
- [ ] Delegated signing is not enabled.

## v1.2 external wallets and onchain attribution

- [ ] Manual EVM/Solana external wallet model and management UI.
- [ ] External wallets remain private, unverified, and separate from the Linkary Wallet.
- [ ] Preferred airdrop destination requires explicit acknowledgement and audit history.
- [ ] Alchemy onchain attribution adapter and normalized D1 event model.
- [ ] Shared network webhooks only: Base, BNB Chain, Solana, Arbitrum, Robinhood Chain.
- [ ] Feature flags, usage controls, webhook signature validation, and idempotent ingestion.
- [ ] Onchain metrics feed campaign analytics only when attribution evidence is defensible.

## Immediate next milestone

1. Use the one-time owner invitation to create the first real Linkary account.
2. Confirm the real user and workspace are created in production.
3. Bootstrap that real user with an active `superadmin` grant using a controlled database operation.
4. Verify `/admin` and the Creator Earn Access review queue end to end.
5. Run a real Creator Earn Access test from signup through approval and onboarding.
6. Verify Email, Google, X, and Telegram authentication paths on production.
7. Build the real Profile Editor UI.
8. Build the Invite dashboard.
9. Begin the official V1 Campaign, Activity, Tracking Link, and Result stack from the Technical Product and Engineering Paper v1.1.

## Deliberately deferred

TwitterAPI.io automation, paid social intelligence, creator referral payouts, wallet payments, deep analytics, audience overlap, reputation scoring automation, MCP write actions, and advanced AI intelligence remain deferred until identity, onboarding, profiles, invites, and first-party campaign attribution are production-stable.
