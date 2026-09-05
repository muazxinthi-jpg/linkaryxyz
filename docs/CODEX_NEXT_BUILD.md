# Linkary Codex Next Build

Updated: 2026-09-05

This is the active Codex handoff for Linkary Beta. Read `IMPLEMENTATION_STATUS.md`, `docs/CURRENT_BETA_BUILD_STATE.md`, `docs/BETA_LAUNCH_ACCEPTANCE.md`, `uilib.md`, `docs/UI_RELEASE_GATE.md`, `docs/DELIVERY_TEAM.md`, and the Linkary Technical Product & Engineering Paper before changing architecture.

Do not rebuild features marked complete in `IMPLEMENTATION_STATUS.md`.

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
- immutable tracking-link partner snapshots for reassignment-safe historical attribution
- Founder Growth Intelligence across campaigns, activities, partners and channels
- Creator Campaign Proof, Project Growth Proof and Community Campaign Proof
- Relationship Memory and Work Again
- campaign opportunities and Creator applications
- Coinbase CDP wallet foundation plus optional EVM/Solana reward destinations
- hourly production app-shell/API health monitoring across the current Beta route surface

Current `main` regression, authenticated-app TypeScript and Wrangler verification are green. Use the latest `main` CI run as the authoritative test count instead of copying a count into this handoff.

## Production database state

The protected production D1 migration workflow was run successfully from `main` with the controlled apply path on 2026-09-05.

Production schema is current through:

- `0023_personal_profile_identity.sql`
- `0024_activity_measurement_evidence.sql`
- `0025_actual_spend_ledger.sql`
- `0026_immutable_tracked_link_partner_snapshots.sql`

The post-apply verification returned `No migrations to apply!`.

The protected workflow remains manual-only, pinned to `main`, defaults to `verify`, and only applies migrations after explicit `mode=apply` selection. Normal production deployments may report migration drift but must never auto-apply migrations.

Never rewrite a migration that has been deployed.

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

## What to build next

Do **not** start another major feature.

The active phase is **Beta acceptance, responsive QA, bug fixing and launch hardening**.

### 1. Real attribution integrity acceptance, first priority

Use designated test data, not production customer proof.

Run:

`Project -> Campaign -> Activity -> Creator A -> new Tracking Link -> real browser Click -> Outcome/value -> Growth Intelligence -> reassign Activity to Creator B`

Then verify:

- the tracking link was created with `link_creation` partner snapshot provenance
- the real click is recorded
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

### 2. Issue #42, authenticated responsive acceptance

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

### 3. Real authentication acceptance

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

### 4. Real Creator acceptance

Run a second Creator through:

`Invite -> account -> Creator Earn Access -> generated LKY claim -> X post -> submit canonical X status URL -> Superadmin approval -> onboarding -> Creator profile -> 10 invite credits`

Validate claim uniqueness, official `@Linkaryxyz` tag, duplicate-post protection, status-URL validation, rejection/retry behavior and no auto-grant while manual mode is enabled.

TwitterAPI.io remains deferred and must not become a dependency for launch access or referral attribution.

### 5. Real Project acceptance

Use a separate Project's official X identity and validate:

- Project registration only through verified official X identity
- Linkary username equals Project X handle
- organization creation
- Owner membership creation
- Project public profile creation
- 50 Project invite credits on first Project onboarding
- verified X avatar/logo sync where available
- profile completion and publish flow

### 6. Role permission acceptance

With separate humans test Owner, Admin, Campaign Manager, Analyst and Viewer.

Validate:

- backend permissions match UI
- Admin cannot approve another Admin
- Owner can approve Admin
- Owner/Admin can add existing Linkary members directly
- Team invitations do not consume network invite credits
- protected Owner membership cannot be altered through normal role controls
- ownership transfer promotes the selected member and demotes the old Owner to Admin

### 7. Invite attribution acceptance

Run:

`Create invite -> recipient click -> signup -> registration -> correct inviter attribution -> credit consumed -> dashboard state -> revoke unused invite returns credit`

Do not use TwitterAPI.io for this loop.

### 8. Full Creator evidence loop

Run with real test data:

`Project -> Partner Discovery -> Collaboration Inquiry -> Accept -> explicit activation -> Campaign -> Activity -> exact Creator -> Live -> Tracking Link -> Click -> Outcome -> Attribution -> Growth Report -> Public Proof -> Completed Activity -> Relationship Memory -> Work Again`

Validate exact identity persistence, click/event integrity, evidence source/confidence, report calculations, CSV parity and no invented spend/value/conversions.

### 9. Full Community evidence loop

Run the same flow through:

`Community Manager -> exact Telegram Community asset`

Validate manager verification and Community asset verification remain separate, exact Community ID persists, changing/removing assignment does not erase historical tracking, and proof remains tied to actual evidence.

### 10. Opportunity/application acceptance

Run:

`Project -> Campaign -> publish Opportunity -> public Project profile -> Creator applies -> Project Inbox -> accept/reject -> resulting relationship/proof only when applicable`

### 11. Public profile acceptance

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

### 12. Repository release hardening

Before controlled Beta, protect `main` with a GitHub ruleset or branch protection that requires the normal PR + green CI route and blocks accidental direct pushes. Keep only a deliberate admin/emergency bypass if needed.

## Bug-fix priority order

1. authentication/session blockers
2. onboarding dead ends
3. permission/security errors
4. incorrect attribution/evidence
5. data loss or duplicate writes
6. mobile usability blockers
7. confusing loading/empty/error states
8. cosmetic polish

## Deferred while acceptance blockers remain

Do not start these until Beta stability:

- Telegram TrackerBot automation
- automatic Telegram join/leave verification
- advanced Alchemy webhook attribution
- AI partner recommendations
- Linkary Score
- reputation voting/moderation
- billing, payments and payouts
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
- PRs run regression + frontend TypeScript + Wrangler dry run
- `main` remains the only production source branch
- normal deploys do not auto-apply D1 migrations
- production health failure is a release blocker until a clean live check is observed

## Definition of controlled Beta-ready

Do not call broad Creator/Project onboarding ready until all are true:

1. production D1 ledger is current through `0026_immutable_tracked_link_partner_snapshots.sql`
2. real Creator attribution reassignment acceptance passes
3. real exact Community attribution reassignment acceptance passes
4. Issue #42 authenticated live visual/device acceptance is clean
5. Email, Google and X real-account sign-in acceptance passes
6. Telegram Personal Profile linking acceptance passes separately
7. second real Creator completes Earn Access
8. second real Project completes official-X registration
9. role matrix passes with separate users
10. invite attribution passes end to end
11. Creator evidence loop passes end to end
12. exact Community evidence loop passes end to end
13. opportunity/application loop passes end to end
14. Creator and Project public profiles pass mobile/share acceptance
15. `main` is protected against accidental direct pushes
16. no open P0 security, auth, permission, attribution, data-integrity or responsive usability blocker remains

After that, onboard a small controlled cohort first, observe real usage, fix friction, then expand.
