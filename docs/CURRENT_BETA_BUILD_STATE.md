# Linkary Current Beta Build State

Updated: 2026-09-06

This is the concise current-state handoff for active Linkary Beta work. If an older handoff conflicts with this file, verify against `main`, the canonical `docs/LINKARY_TECHNICAL_PRODUCT_PAPER.md`, current migrations and the latest `main` CI before rebuilding anything.

## Current production product

The core Beta product is built and production-live:

- invite-only Creator and Project onboarding
- Email, Google and X sign-in
- authenticated Personal Profile Telegram linking, separate from Linkary sign-in
- Creator Earn Access with manual Superadmin review
- Creator and verified Project public profiles
- Project roles, access requests, Team invitations and ownership transfer
- Community Manager identity and multi-Community portfolio
- Community verification review
- Partner Discovery for Creators and Community Managers
- Project shortlist and Project network
- Collaboration Inquiry V1
- accepted Inquiry -> explicit Campaign/Activity activation
- exact Creator / exact Telegram Community assignment
- Campaign Activity Lifecycle V1
- Campaign Lifecycle V1
- activity measurement evidence with explicit provenance
- actual spend ledger separate from budget/planned cost
- tracking links, clicks, outcomes, attribution and reports
- canonical new-link route `https://l.linkary.xyz/r/{code}` with immutable destination/UTM context
- immutable tracking-link partner snapshots for reassignment-safe historical attribution
- Founder Growth Intelligence across campaigns, activities, partners and channels
- Creator Campaign Proof
- Project Growth Proof
- Community Campaign Proof
- Relationship Memory
- Work Again
- chain-aware NFT picker and bounded pagination for Ethereum, Base, BNB Chain, Solana and Robinhood Chain
- Coinbase CDP wallet foundation plus optional EVM/Solana reward destinations
- LinkaryAI AI-0 governance foundation
- hourly production app-shell/API health monitoring

Current `main` regression, TypeScript and Wrangler verification are green. Treat the latest `main` CI run as the authoritative test count rather than hard-coding a count in planning documents.

## Current Linkary loop

`Identity -> Discovery -> Relationship -> Inquiry -> Accept -> Explicit activation -> Campaign -> Activity -> Exact Partner -> Track -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`

Campaigns also have their own operational lifecycle:

`Draft -> Active -> Paused -> Completed -> Archived`

with only the allowed V1 transitions enforced by the backend.

## Evidence rules that remain locked

- Inquiry acceptance means open to discussion only.
- Explicit activation assigns a partner to an exact campaign activity, but does not create performance proof.
- Activity completion records that work happened, but does not create performance proof.
- Campaign completion/archival does not create proof or rewrite activity status.
- Exact Creator / exact Telegram Community provenance remains authoritative.
- New tracking links freeze the exact partner at link creation so later activity reassignment cannot rewrite historical attribution.
- New tracking links freeze effective destination and UTM attribution context.
- Legacy backfilled tracking-link partner snapshots must remain labeled as legacy/backfilled provenance, not proven link-creation history.
- Community Manager personal Telegram verification is separate from Community asset verification.
- Community verification is asset-level.
- Manual outcome/value evidence remains Manual.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified`, and `provider_verified`.
- Missing metric denominators remain unavailable instead of being fabricated.
- Cancelled activity does not qualify as Worked before.
- No opaque reputation score or fabricated trend.

## Production D1 state

Production D1 is current through `0034_project_growth_baselines.sql`.

Relevant current migration history includes:

- `0024_activity_measurement_evidence.sql`
- `0025_actual_spend_ledger.sql`
- `0026_immutable_tracked_link_partner_snapshots.sql`
- deployed migrations `0027` through `0031`
- `0032_immutable_tracking_utm_context.sql`
- `0033_ai0_governance_and_usage.sql`
- `0034_project_growth_baselines.sql`

The latest production migration-state check returned `No migrations to apply!`.

The protected workflow remains:

- manual `workflow_dispatch` only
- always checks out `main`
- defaults to `verify`
- requires explicit `mode=apply` to write migrations
- verifies after apply that no migrations remain pending

Normal app deployments report D1 migration drift but never apply schema changes.

Never rewrite a deployed migration. Do not add another migration during the current acceptance-only phase.

## Production readiness and release controls

- Production readiness was observed at 34/34 required tables, 5/5 required automation checks and 9/9 production configuration checks.
- `main` is protected and requires `verify-and-deploy` plus `Workers Builds: linkary-xyz`.
- Required-check enforcement has been observed blocking a merge until the Worker build finished successfully.
- Latest production deploy completed regression, backend TypeScript, authenticated-app TypeScript, Wrangler, Cloudflare deployment and live health checks successfully.
- Direct-push rejection and deliberate emergency-bypass behavior should still be explicitly exercised as release-control acceptance evidence before widening the cohort.

## Authentication model

Linkary account sign-in is:

- Email verification
- Google
- X

Telegram is a separate authenticated Personal Profile connection. It is linked only after the user has a Linkary session and must not create a Linkary user, session, wallet, Community verification, campaign proof or `auth_identities` record.

Real acceptance must therefore test Email/Google/X sign-in and Telegram profile linking as separate flows.

## Campaign Lifecycle V1 is complete

Campaign Lifecycle V1 is no longer the next feature.

Supported transitions:

- Draft -> Active / Archived
- Active -> Paused / Completed / Archived
- Paused -> Active / Completed / Archived
- Completed -> Archived
- Archived is terminal

Lifecycle mutation is authenticated, CSRF protected and Project permissioned. Owner/Admin/Campaign Manager can write. Analyst/Viewer remain read-only.

Campaign status changes do not mutate activity statuses or create/delete tracking, clicks, outcomes, exact partner assignments, attribution confidence, reports, inquiries, proof or Relationship Memory.

## Alchemy / NFT Controlled Beta state

The locked Controlled Beta chain set is:

1. Ethereum
2. Base
3. BNB Chain
4. Solana
5. Robinhood Chain

Arbitrum is not part of the current Controlled Beta chain set.

Live production facts already observed:

- Alchemy production configuration is present and readiness reached 9/9.
- a real Ethereum wallet returned NFT artwork in the live Profile editor.
- the chain-aware picker/pagination implementation is deployed.
- EVM discovery is bounded to 100 items per page and preserves provider cursor state for `Load more`.
- chain-specific browsing does not need to fetch every supported chain.
- unsupported/provider-error states are distinct from a genuine empty-wallet result.

Live acceptance still needs to verify more-than-one-page browsing, chain switching, Solana, provider-capability states, avatar save/reload/public rendering and NFT Showcase save/reload/public rendering.

Issue #168 remains open because a Free Personal account can currently access paid NFT-aware profile functionality. The canonical Personal Pro / Collector boundary requires server-side enforcement. Free must retain normal image upload and reward-wallet destinations, but not wallet NFT discovery, NFT avatar, NFT Showcase, NFT collection presentation or NFT-labelled profile items.

## Growth Intelligence / attribution acceptance is the next critical gate

The schema and runtime code are production-ready for this acceptance sequence:

1. Project -> Campaign -> Activity -> Creator A.
2. Create a new tracking link while Creator A is the exact assigned partner.
3. Confirm the new URL uses `https://l.linkary.xyz/r/{code}`.
4. Open the tracking link through a real browser to record a real Linkary click and inspect the final destination/UTM parameters.
5. Record a known outcome and optional attributed USD value. Founder-entered outcomes must stay visibly Manual evidence.
6. Record actual spend if testing ROI/ROAS, keeping it separate from budget and planned cost.
7. Confirm Growth Intelligence calculations and partner snapshot coverage.
8. Reassign the activity from Creator A to Creator B.
9. Confirm the original tracking link, click, outcome and attributed value remain historically attributed to Creator A.
10. Repeat with Community Manager -> exact Telegram Community.

Use designated test data so acceptance does not masquerade as real customer proof.

## Production reliability is now stronger

Normal `main` deployments verify `/` and `/profile` after Cloudflare deployment.

In addition, a separate hourly production-health workflow checks the current Beta app-shell route surface:

- `/`
- `/dashboard`
- `/dashboard/inbox`
- `/opportunities`
- `/communities`
- `/campaigns`
- `/tracking`
- `/partners`
- `/creators`
- `/profile`
- `/invites`
- `/wallets`
- `/settings/team-invites`
- `/settings`
- `/admin/readiness`
- `/admin/community-verifications`
- `/team-invite`
- `/api/auth/me`

App routes must return HTTP 200 and the real React shell marker, with retries before the check fails. The API health check must return the expected authentication-state field. These are shell/API availability checks, not substitutes for authenticated product-flow acceptance.

## Acceptance gate still open

Issue #42 remains the broad authenticated responsive acceptance gate.

Required widths:

- 320px
- 375px
- 390px
- 430px
- tablet
- desktop

Static responsive hardening and regression coverage now exist for the named Issue #42 Creator, Project, Community, Wallet, Growth, Tracking, Inbox, Profile, Network and Superadmin surfaces. This does **not** close the gate. Full authenticated live visual/device acceptance is still required across the same widths and primary flows.

## Real-user acceptance still required

Before broad onboarding, run:

1. Growth attribution integrity: Creator A -> tracking link -> real click -> outcome/value -> Creator B reassignment, then repeat with exact Telegram Community.
2. Canonical tracking-domain/UTM redirect acceptance with a real `l.linkary.xyz/r/{code}` link.
3. Creator Invite -> auth -> Earn Access -> X evidence -> Superadmin approval -> onboarding -> profile.
4. Project Invite -> auth -> official Project X -> claim -> workspace -> Team roles.
5. Email / Google / X sign-in with real accounts, plus separate Telegram Personal Profile linking.
6. Owner / Admin / Campaign Manager / Analyst / Viewer permission matrix with separate users.
7. Creator evidence loop:
   `Project -> Campaign -> Activity -> Creator -> Tracking Link -> Click -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`.
8. Community evidence loop using `Community Manager -> exact Telegram Community`.
9. Invite click -> signup -> registration attribution.
10. Opportunity -> application -> Project decision.
11. Public Creator/Project profile acceptance on real mobile devices.
12. Full issue #42 authenticated visual acceptance and P0/P1 bug fixing.
13. NFT chain/pagination/persistence live acceptance.
14. Fix Issue #168 before monetized Personal Pro onboarding.
15. Resolve or disposition Issue #169 during landing-page UI/content QA.
16. Explicitly verify direct-push/emergency-bypass release-control behavior.

## What to build next

Do **not** start another major feature.

The next work is:

1. finish real attribution/end-to-end acceptance
2. finish real-account auth/onboarding/role/invite acceptance
3. finish issue #42 authenticated visual/device acceptance
4. finish live NFT acceptance and fix Issue #168
5. fix every P0/P1 found
6. verify the already protected `main` release path end to end
7. keep documentation synchronized with `main`
8. open a small controlled Beta cohort only after the acceptance gate is clean

## Deferred until Beta stability

Keep these deferred while acceptance blockers remain:

- Telegram TrackerBot automation
- automatic Telegram join/leave verification
- advanced Alchemy webhook attribution
- user-facing AI expansion beyond the already deployed AI-0 foundation
- AI partner recommendations / Linkary Score
- reputation voting/moderation
- payments and payouts
- referral revenue automation
- delegated wallet signing
- advanced audience-overlap intelligence
