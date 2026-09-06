# Linkary Codex Next Build

Updated: 2026-09-06

This is the active Codex handoff for Linkary Beta. Read `IMPLEMENTATION_STATUS.md`, `docs/CURRENT_BETA_BUILD_STATE.md`, `docs/BETA_LAUNCH_ACCEPTANCE.md`, `docs/LINKARY_TECHNICAL_PRODUCT_PAPER.md`, `uilib.md`, `docs/UI_RELEASE_GATE.md`, and `docs/DELIVERY_TEAM.md` before changing architecture.

`docs/LINKARY_TECHNICAL_PRODUCT_PAPER.md` is the canonical product and technical source of truth. Do not override its tracking domain, chain set, billing architecture, evidence rules, provider boundaries or product positioning from an older handoff.

Do not rebuild features marked complete in `IMPLEMENTATION_STATUS.md`.

## Current execution instruction

Work from the latest GitHub `main`.

Do not change the tracking domain, chain set, billing architecture, D1 migrations, or technical-paper decisions.

Do not add another migration.

Focus only on live Beta acceptance, UI QA, bug fixing for reproducible acceptance defects, and documenting evidence.

Check existing PRs and issues before creating new work.

## Current state

The core Beta product is built. Current production capabilities include:

- invite-only Creator and Project onboarding
- Email, Google and X sign-in
- authenticated Personal Profile Telegram linking, separate from Linkary sign-in
- Creator Earn Access with manual Superadmin review
- Creator and verified Project public profiles
- Project roles, access requests, Team invitations and ownership transfer
- Community Manager identity plus exact Telegram Community assets
- Community verification review
- Partner Discovery, Project shortlists and Project network
- Collaboration Inquiry V1
- accepted Inquiry -> explicit Campaign/Activity activation
- exact Creator / exact Telegram Community campaign assignment
- Activity Lifecycle V1
- Campaign Lifecycle V1
- activity measurement evidence with explicit provenance
- actual spend ledger separate from campaign budget and planned cost
- tracking links, clicks, outcomes, attribution and growth reports
- canonical new tracking links at `https://l.linkary.xyz/r/{code}`
- immutable tracking-link partner snapshots and immutable destination/UTM context
- Founder Growth Intelligence across campaigns, activities, partners and channels
- Creator Campaign Proof, Project Growth Proof and Community Campaign Proof
- Relationship Memory and Work Again
- campaign opportunities and Creator applications
- Coinbase CDP wallet foundation plus optional EVM/Solana reward destinations
- chain-aware Alchemy NFT discovery/pagination for Ethereum, Base, BNB Chain, Solana and Robinhood Chain
- LinkaryAI AI-0 governance foundation
- hourly production app-shell/API health monitoring across the current Beta route surface

Current `main` regression, authenticated-app TypeScript and Wrangler verification are green. Use the latest `main` CI run as the authoritative test count instead of copying a count into this handoff.

## Production database state

Production schema is current through `0034_project_growth_baselines.sql`.

Relevant current migration history includes:

- `0024_activity_measurement_evidence.sql`
- `0025_actual_spend_ledger.sql`
- `0026_immutable_tracked_link_partner_snapshots.sql`
- deployed migrations `0027` through `0031`
- `0032_immutable_tracking_utm_context.sql`
- `0033_ai0_governance_and_usage.sql`
- `0034_project_growth_baselines.sql`

The latest production migration-state check returned `No migrations to apply!`.

The protected workflow remains manual-only, pinned to `main`, defaults to `verify`, and only applies migrations after explicit `mode=apply` selection. Normal production deployments may report migration drift but must never auto-apply migrations.

Never rewrite a migration that has been deployed. Do not add a migration during this acceptance phase.

## Production readiness and release controls

- Production readiness was observed at 34/34 required tables, 5/5 required automation checks and 9/9 production configuration checks.
- `main` is protected with required `verify-and-deploy` and `Workers Builds: linkary-xyz` checks.
- Required-check enforcement has been observed blocking merge until the Worker build passed.
- Latest production deployment completed Cloudflare deployment and live `/` + `/profile` health checks.
- Explicit direct-push rejection/emergency-bypass acceptance should still be recorded before widening controlled Beta.

## Authentication model

Linkary sign-in providers are:

- Email verification
- Google
- X

Telegram is a separate authenticated Personal Profile connection, not a Linkary sign-in provider. It must not create a Linkary user, session, CDP account, wallet, Community verification, campaign proof or `auth_identities` record.

Real acceptance must test Email/Google/X sign-in and Telegram profile linking separately.

## Locked product loop

The current product loop is:

`Identity -> Discovery -> Relationship -> Inquiry -> Accept -> Explicit activation -> Campaign -> Activity -> Exact Partner -> Track -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`

Do not create a parallel campaign, attribution, inquiry or evidence system.

## Locked evidence rules

Do not regress these:

- Inquiry acceptance means open to discussion only. It is not campaign proof.
- Explicit activation assigns a partner to an exact campaign activity, but creates no performance proof.
- Activity completion records lifecycle state only. It does not create performance proof.
- Campaign completion/archival records lifecycle state only. It does not complete activities or create performance proof.
- Exact Creator / exact Telegram Community provenance is authoritative.
- New tracking links snapshot the exact assigned partner at link creation.
- New tracking links freeze their effective destination and attribution/UTM context.
- Later activity reassignment must not rewrite the historical tracking-link/click/outcome/value partner attribution.
- Legacy backfilled partner snapshots must remain explicitly labeled as legacy/backfilled, not proven link-creation history.
- A Community Manager's personal Telegram verification is separate from exact Community asset verification.
- Community verification is asset-level.
- Evidence confidence remains Manual, Tracked, Correlated or Verified according to stored evidence.
- Manual outcome/value records remain manual and must not appear as strong verified public proof.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified` and `provider_verified`.
- Missing metric denominators remain unavailable rather than fabricated.
- Cancelled activities do not qualify as Worked Before.
- No editable fake proof metrics.
- No opaque Linkary Score until enough defensible data exists.

## Locked provider and commercial boundaries

- Coinbase CDP remains Linkary wallet infrastructure.
- Alchemy is scoped NFT/onchain data and verification infrastructure, not wallet infrastructure.
- Controlled Beta chain set is Ethereum, Base, BNB Chain, Solana and Robinhood Chain. Do not substitute Arbitrum.
- Personal Pro / Collector is the paid NFT-aware profile entitlement. Free users may upload a normal image and store supported reward-wallet destinations, but must not receive wallet NFT discovery, NFT avatar, NFT Showcase, collection presentation or NFT-labelled profile items.
- LinkaryAI remains provider-agnostic with Workers AI primary and governed Gemini/Groq/OpenRouter fallbacks.

## What to build next

Do **not** start another major feature.

The active phase is **Beta acceptance, responsive QA, bug fixing and launch hardening**.

### 1. Real attribution integrity acceptance, first priority

Use designated test data, not production customer proof.

Run:

`Project -> Campaign -> Activity -> Creator A -> new Tracking Link -> real browser Click -> Outcome/value -> Growth Intelligence -> reassign Activity to Creator B`

Then verify:

- the tracking link uses the canonical `https://l.linkary.xyz/r/{code}` route
- the tracking link was created with `link_creation` partner snapshot provenance
- the real click is recorded
- destination UTM parameters are preserved and Linkary attribution identifiers remain authoritative
- founder-entered outcome/value stays visibly Manual evidence
- if actual spend is entered, ROI/ROAS uses the actual spend ledger rather than campaign budget or planned activity cost
- Growth Intelligence reflects the recorded click/outcome/value correctly
- after reassignment, the activity's current partner becomes Creator B
- the original tracking link, click, outcome, partner comparison and attributed value remain historically attributed to Creator A
- no partner spend/social metrics are silently reassigned to historical partners
- missing denominators remain unavailable

Repeat the same acceptance through:

`Community Manager -> exact Telegram Community asset`

Also confirm legacy backfilled snapshots are labeled legacy/backfilled and never presented as proven creation-time attribution.

### 2. Live NFT acceptance

Use an entitled Personal Pro / Collector test account for publish/persistence acceptance and a Free account for entitlement rejection acceptance.

Validate:

- picker exposes `All`, `Ethereum`, `Base`, `BNB Chain`, `Solana`, `Robinhood`
- Ethereum can display more than the old 20-item limit
- `Load more` works when a wallet has more than one bounded page
- selected-chain browsing does not unnecessarily load every chain
- Solana pagination works
- BNB/Robinhood unsupported provider capability is shown as unavailable, not as a fake empty wallet
- NFT avatar saves, survives reload and renders on the public profile for an entitled account
- NFT Showcase saves, survives reload and renders on the public profile for an entitled account
- Free account is blocked server-side from NFT discovery and NFT-aware persistence according to Issue #168
- Free normal image upload and EVM/Solana reward destinations still work

Do not change billing architecture or add a migration to fix Issue #168.

### 3. Issue #42, authenticated responsive acceptance

Static responsive hardening and regression coverage now exist for the named Issue #42 surfaces. Do not interpret that as visual acceptance completion.

Run authenticated live visual/device review at minimum at:

- 320px
- 375px
- 390px
- 430px
- tablet
- desktop

Include:

- Dashboard
- Inbox
- Campaigns / Growth
- Evidence / Tracking
- Partners
- Communities / Community Manager
- Profile editor and public profile
- Projects / roles / Team invitations
- Invites
- Wallets
- Project Network
- relevant Superadmin surfaces

Validate:

- no horizontal document overflow
- no clipped headings, avatars, media or sticky controls
- mobile forms stack correctly
- useful 40 to 44px tap targets
- mobile-safe modals and sheets
- usable filters, tabs and actions
- readable type and spacing
- useful loading, empty and error states
- no provider/infrastructure terminology in customer UI
- no manual/estimated evidence presented as verified
- sensible density with one result and many results

Fix every P0/P1 before broad onboarding. Keep Issue #42 open until this authenticated live pass is complete.

### 4. Real authentication acceptance

Use real separate accounts and test:

- Email OTP sign-in
- Google sign-in
- X sign-in
- existing session -> login
- existing session -> signup
- logout
- invite URL across redirect/reload
- expired invite
- revoked invite
- consumed invite
- desktop and mobile

Separately test Telegram Personal Profile linking:

- connect from an authenticated Linkary session
- successful persistence
- cancel/error path
- duplicate Telegram identity rejection
- reconnect/current-account behavior
- no Linkary account/session/wallet/sign-in identity creation

Do not expose CDP/provider/server-token terminology in customer UI.

### 5. Real Creator acceptance

Run a second Creator through:

`Invite -> account -> Creator Earn Access -> generated LKY claim -> X post -> submit canonical X status URL -> Superadmin approval -> onboarding -> Creator profile -> 10 invite credits`

Validate claim uniqueness, official `@Linkaryxyz` tag, duplicate-post protection, status-URL validation, rejection/retry behavior and no auto-grant while manual mode is enabled.

TwitterAPI.io remains deferred and must not become a dependency for launch access or referral attribution.

### 6. Real Project acceptance

Use a separate Project's official X identity and validate:

- Project registration only through verified official X identity
- Linkary username equals Project X handle
- organization creation
- Owner membership creation
- Project public profile creation
- 50 Project invite credits on first Project onboarding
- verified X avatar/logo sync where available
- profile completion and publish flow

### 7. Role permission acceptance

With separate humans test Owner, Admin, Campaign Manager, Analyst and Viewer.

Validate:

- backend permissions match UI
- Admin cannot approve another Admin
- Owner can approve Admin
- Owner/Admin can add existing Linkary members directly
- Team invitations do not consume network invite credits
- protected Owner membership cannot be altered through normal role controls
- ownership transfer promotes the selected member and demotes the old Owner to Admin

### 8. Invite attribution acceptance

Run:

`Create invite -> recipient click -> signup -> registration -> correct inviter attribution -> credit consumed -> dashboard state -> revoke unused invite returns credit`

Do not use TwitterAPI.io for this loop.

### 9. Full Creator evidence loop

Run with real test data:

`Project -> Partner Discovery -> Collaboration Inquiry -> Accept -> explicit activation -> Campaign -> Activity -> exact Creator -> Live -> Tracking Link -> Click -> Outcome -> Attribution -> Growth Report -> Public Proof -> Completed Activity -> Relationship Memory -> Work Again`

Validate exact identity persistence, click/event integrity, evidence source/confidence, report calculations, CSV parity and no invented spend/value/conversions.

### 10. Full Community evidence loop

Run the same flow through:

`Community Manager -> exact Telegram Community asset`

Validate manager verification and Community asset verification remain separate, exact Community ID persists, changing/removing assignment does not erase historical tracking, and proof remains tied to actual evidence.

### 11. Opportunity/application acceptance

Run:

`Project -> Campaign -> publish Opportunity -> public Project profile -> Creator applies -> Project Inbox -> accept/reject -> resulting relationship/proof only when applicable`

### 12. Public profile and landing UI acceptance

Test Creator and Project profiles for:

- verified X avatar/logo
- custom image override
- socials
- featured media
- Media Kit
- Work With Me / collaboration CTA
- Project/Community cards
- Team cards
- reorder/hide/show
- SEO title/description
- publish/unpublish
- canonical URL/share metadata
- Creator Campaign Proof
- Project Growth Proof
- open Project Opportunities

Never add editable fake proof metrics.

Also disposition Issue #169. The public landing must present the canonical tracking-first product position rather than making Linkary appear execution-first. This is UI/content QA, not new feature scope.

### 13. Repository release-control acceptance

`main` is already protected with the required normal PR checks. Do not rebuild branch protection.

Record the remaining acceptance evidence:

- direct push is rejected for the normal path
- required checks cannot be bypassed accidentally
- branch deletion/force-push behavior matches the intended protection
- any admin/emergency bypass is deliberate and understood

## Known acceptance issues

- #168 Free Personal account can use paid NFT-aware profile functionality.
- #169 public landing copy is execution-first and conflicts with the canonical tracking-first position.
- #42 broad authenticated responsive/device acceptance remains open.

Check existing issues before opening duplicates.

## Bug-fix priority order

1. authentication/session blockers
2. onboarding dead ends
3. permission/security errors
4. incorrect attribution/evidence
5. commercial entitlement bypass
6. data loss or duplicate writes
7. mobile usability blockers
8. confusing loading/empty/error states
9. cosmetic polish

## Deferred while acceptance blockers remain

Do not start these until Beta stability:

- Telegram TrackerBot automation
- automatic Telegram join/leave verification
- advanced Alchemy webhook attribution
- user-facing AI expansion beyond the already deployed AI-0 foundation
- AI partner recommendations
- Linkary Score
- reputation voting/moderation
- payments and payouts
- referral revenue automation
- delegated wallet signing
- advanced audience-overlap intelligence

## Security and deployment rules

- backend remains authority
- validate provider access tokens server-side
- preserve secure Linkary session cookies and CSRF protection
- never trust client-supplied user IDs
- no public privilege escalation
- stable X/Telegram provider UID is canonical, not mutable username
- Project identity stays tied to verified official Project X ownership
- personal Telegram verification does not verify represented Communities
- no server authority for wallet trade, transfer, private-key export or policy management
- additional EVM/Solana reward destinations do not connect those wallets to Linkary
- never expose secrets
- never rewrite deployed migrations
- do not add a new migration during the current acceptance phase
- PRs run regression + frontend TypeScript + Wrangler dry run
- `main` remains the only production source branch
- normal deploys do not auto-apply D1 migrations
- production health failure is a release blocker until a clean live check is observed

## Definition of controlled Beta-ready

Do not call broad Creator/Project onboarding ready until all are true:

1. production D1 ledger is current through `0034_project_growth_baselines.sql`
2. latest production migration-state check reports `No migrations to apply!`
3. real Creator attribution reassignment acceptance passes
4. real exact Community attribution reassignment acceptance passes
5. canonical `l.linkary.xyz` tracking/UTM acceptance passes
6. live NFT pagination/chain/persistence acceptance passes
7. Issue #168 paid NFT entitlement enforcement is fixed
8. Issue #42 authenticated live visual/device acceptance is clean
9. Email, Google and X real-account sign-in acceptance passes
10. Telegram Personal Profile linking acceptance passes separately
11. second real Creator completes Earn Access
12. second real Project completes official-X registration
13. role matrix passes with separate users
14. invite attribution passes end to end
15. Creator evidence loop passes end to end
16. exact Community evidence loop passes end to end
17. opportunity/application loop passes end to end
18. Creator and Project public profiles pass mobile/share acceptance
19. `main` release-control acceptance is recorded
20. no open P0 security, auth, permission, attribution, entitlement, data-integrity or responsive usability blocker remains

After that, onboard a small controlled cohort first, observe real usage, fix friction, then expand.
