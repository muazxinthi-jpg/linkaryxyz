# Linkary Codex Next Build

Updated: 2026-09-04

This is the active Codex handoff for Linkary Beta. Read `IMPLEMENTATION_STATUS.md`, `docs/CURRENT_BETA_BUILD_STATE.md`, `uilib.md`, `docs/UI_RELEASE_GATE.md`, `docs/DELIVERY_TEAM.md`, and the Linkary Technical Product & Engineering Paper before changing architecture.

Do not rebuild features marked complete in `IMPLEMENTATION_STATUS.md`.

## Current state

The core Beta product is built. Current production capabilities include:

- invite-only Creator and Project onboarding
- Email, Google, X and Telegram authentication
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
- tracking links, clicks, outcomes, attribution and growth reports
- Creator Campaign Proof, Project Growth Proof and Community Campaign Proof
- Relationship Memory and Work Again
- campaign opportunities and Creator applications
- Coinbase CDP wallet foundation plus optional EVM/Solana reward destinations
- hourly production app-shell/API health monitoring across the current Beta route surface

Current `main` regression, authenticated-app TypeScript and Wrangler verification are green. Use the latest `main` CI run as the authoritative test count instead of copying a count into this handoff.

## Production database state

The protected production D1 migration workflow was run successfully from `main` with the controlled apply path on 2026-09-04.

Production schema is therefore current through:

- `0020_exact_activity_partner_assignment.sql`
- `0021_collaboration_inquiries.sql`
- `0022_collaboration_inquiry_activations.sql`

The protected workflow remains manual-only, pinned to `main`, defaults to `verify`, and only applies migrations after explicit `mode=apply` selection. Normal production deployments may report migration drift but must never auto-apply migrations.

Never rewrite a migration that has been deployed.

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
- A Community Manager's personal Telegram verification is separate from exact Community asset verification.
- Community verification is asset-level.
- Evidence confidence remains Manual, Tracked, Correlated or Verified according to stored evidence.
- Manual outcome/value records remain manual and must not appear as strong verified public proof.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified` and `provider_verified`.
- Cancelled activities do not qualify as Worked Before.
- No editable fake proof metrics.
- No opaque Linkary Score until enough defensible data exists.

## What to build next

Do **not** start another major feature.

The active phase is **Beta acceptance, responsive QA, bug fixing and launch hardening**.

### 1. Issue #42, authenticated responsive acceptance

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

### 2. Real authentication acceptance

Use real separate accounts and test:

- Email OTP
- Google
- X
- Telegram
- existing session -> login
- existing session -> signup
- logout
- invite URL across redirect/reload
- expired invite
- revoked invite
- consumed invite
- desktop and mobile

Do not expose CDP/provider/server-token terminology in customer UI.

### 3. Real Creator acceptance

Run a second Creator through:

`Invite -> account -> Creator Earn Access -> generated LKY claim -> X post -> submit canonical X status URL -> Superadmin approval -> onboarding -> Creator profile -> 10 invite credits`

Validate claim uniqueness, official `@Linkaryxyz` tag, duplicate-post protection, status-URL validation, rejection/retry behavior and no auto-grant while manual mode is enabled.

TwitterAPI.io remains deferred and must not become a dependency for launch access or referral attribution.

### 4. Real Project acceptance

Use a separate Project's official X identity and validate:

- Project registration only through verified official X identity
- Linkary username equals Project X handle
- organization creation
- Owner membership creation
- Project public profile creation
- 50 Project invite credits on first Project onboarding
- verified X avatar/logo sync where available
- profile completion and publish flow

### 5. Role permission acceptance

With separate humans test Owner, Admin, Campaign Manager, Analyst and Viewer.

Validate:

- backend permissions match UI
- Admin cannot approve another Admin
- Owner can approve Admin
- Owner/Admin can add existing Linkary members directly
- Team invitations do not consume network invite credits
- protected Owner membership cannot be altered through normal role controls
- ownership transfer promotes the selected member and demotes the old Owner to Admin

### 6. Invite attribution acceptance

Run:

`Create invite -> recipient click -> signup -> registration -> correct inviter attribution -> credit consumed -> dashboard state -> revoke unused invite returns credit`

Do not use TwitterAPI.io for this loop.

### 7. Full Creator evidence loop

Run with real test data:

`Project -> Partner Discovery -> Collaboration Inquiry -> Accept -> explicit activation -> Campaign -> Activity -> exact Creator -> Live -> Tracking Link -> Click -> Outcome -> Attribution -> Growth Report -> Public Proof -> Completed Activity -> Relationship Memory -> Work Again`

Validate exact identity persistence, click/event integrity, evidence source/confidence, report calculations, CSV parity and no invented spend/value/conversions.

### 8. Full Community evidence loop

Run the same flow through:

`Community Manager -> exact Telegram Community asset`

Validate manager verification and Community asset verification remain separate, exact Community ID persists, changing/removing assignment does not erase historical tracking, and proof remains tied to actual evidence.

### 9. Opportunity/application acceptance

Run:

`Project -> Campaign -> publish Opportunity -> public Project profile -> Creator applies -> Project Inbox -> accept/reject -> resulting relationship/proof only when applicable`

### 10. Public profile acceptance

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

1. production D1 ledger is current through `0022`
2. Issue #42 authenticated live visual/device acceptance is clean
3. Email, Google, X and Telegram real-account acceptance passes
4. second real Creator completes Earn Access
5. second real Project completes official-X registration
6. role matrix passes with separate users
7. invite attribution passes end to end
8. Creator evidence loop passes end to end
9. exact Community evidence loop passes end to end
10. opportunity/application loop passes end to end
11. Creator and Project public profiles pass mobile/share acceptance
12. no open P0 security, auth, permission, attribution, data-integrity or responsive usability blocker remains

After that, onboard a small controlled cohort first, observe real usage, fix friction, then expand.
