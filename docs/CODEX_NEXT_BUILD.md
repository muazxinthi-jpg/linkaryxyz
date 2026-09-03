# Linkary Codex Next Build

Updated: 2026-09-03

This handoff reflects the current repository after the exact Partner-to-Activity evidence milestone. Read `IMPLEMENTATION_STATUS.md`, `uilib.md`, `docs/UI_RELEASE_GATE.md`, `docs/DELIVERY_TEAM.md`, and the Linkary Technical Product & Engineering Paper v1.2 before changing architecture.

Do not rebuild features marked complete in `IMPLEMENTATION_STATUS.md`.

## Current Beta product

Implemented product surfaces now include:

- invite-only onboarding and Creator Earn Access
- Creator and verified Project public profiles
- verified X avatar synchronization
- profile completion guidance
- Media Kit and Work With Me / collaboration CTAs
- drag-and-drop profile ordering and mobile preview
- automatic Creator Campaign Proof and Project Growth Proof
- open Project campaign opportunities on public profiles
- Project search, role requests, approvals, Team invitations, team roles and ownership transfer
- workspace switching across Creator / Project relationships
- personal Telegram verification separated from Community verification
- Community Manager workspace and multi-Community portfolio
- Community verification proof submission and Superadmin review
- Inbox action center
- invite dashboard and attribution
- campaigns, activities, tracked links, clicks, outcomes and growth reports
- Partner Discovery V1 for Creators and Community Managers
- Project shortlists and Project network
- exact Creator assignment to campaign activities
- exact Telegram Community assignment through Community Manager -> Community asset
- campaign opportunity applications
- Linkary wallet plus optional EVM/Solana reward destinations

The next engineering phase remains **Beta acceptance and bug fixing**, not broad new feature development.

Collaboration Inquiry V1 comes only after the acceptance gate is clean.

## Locked identity and evidence rules

Do not regress these:

- A human account is not permanently typed as Creator or Project.
- A Creator can belong to many Project organizations through roles.
- A Project itself must be registered/claimed through the Project's official verified X identity.
- The Project Linkary username must match the verified Project X handle.
- A personal Creator account must not free-form create or impersonate a Project.
- People manage Projects through Owner, Admin, Campaign Manager, Analyst and Viewer roles.
- A Community Manager is a person/P.O.C. who may represent multiple Telegram Communities.
- Personal Telegram verification proves the manager's identity. It does not verify every Community they represent.
- Community verification is asset-level and must remain separate from manager verification.
- A Community campaign placement must resolve to the exact Telegram Community asset when one is assigned.
- Evidence confidence must remain Manual, Tracked, Correlated, or Verified according to stored evidence. Never silently upgrade evidence.

## Canonical evidence path

The current product supports:

`Project -> Campaign -> Activity -> exact Creator / exact Telegram Community -> Tracking Link -> Click -> Outcome -> Attribution -> Relationship History`

Exact assignment is stored through `campaign_activity_linkary_assignments` while still writing through the existing `campaign_activity_participants` attribution chain. Do not create a parallel campaign or attribution system.

## Beta acceptance order

### 1. Production migrations

Verify the protected production D1 migration state.

Apply pending versioned migrations through the controlled migration workflow. In particular verify:

- `0017_project_partner_shortlists.sql`
- `0018_verified_x_profile_avatars.sql`
- `0019_project_team_invitations.sql`
- `0020_exact_activity_partner_assignment.sql`

`0020` has an idempotent runtime guard for operational safety, but the formal migration ledger must still be handled through the protected migration workflow.

Never rewrite a migration already deployed.

### 2. Full authenticated responsive UI acceptance

Issue #42 is the active UI acceptance gate.

Review the primary authenticated product at minimum at:

- 320px
- 375px
- 390px
- 430px
- tablet
- desktop

Include:

- Dashboard
- Inbox
- Profile editor and public profile
- Communities / Community Manager
- Growth
- Evidence
- Partners
- Projects / roles / Team invitations
- Invites
- Wallets
- relevant Superadmin user-facing surfaces

Validate:

- no avatar/logo/media overflow
- no clipped headings or sticky collisions
- no horizontal document overflow
- readable type and spacing
- stacked mobile forms
- practical 40 to 44px interaction targets
- mobile-safe modals
- usable filters, tabs and actions
- useful loading, empty and error states
- no provider/infrastructure language in customer UI
- no manual/estimated evidence presented as verified
- sensible density for one-result and many-result states

Fix any P0/P1 blocker before starting Collaboration Inquiry or broader campaign execution features.

### 3. Authentication acceptance

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

### 4. Creator Earn Access acceptance

Run a second real Creator through:

Create account -> Creator Earn Access -> authenticate -> generated `LKY-...` claim -> curated X post -> submit canonical X status URL -> Superadmin queue -> approve -> onboarding -> Creator profile -> 10 invite credits.

Validate:

- official `@Linkaryxyz` tag
- unique claim code
- only X/Twitter status URLs
- duplicate-post protection
- no auto-grant while manual mode is enabled
- rejection reason and retry behavior

TwitterAPI.io remains optional/deferred and must not become a dependency for launch access or referral attribution.

### 5. Real Project registration acceptance

Use a second Project's official X account.

Validate:

- Project registers only through verified X identity
- Linkary username equals Project X handle
- Organization is created
- Owner membership is created
- Project public profile is created
- 50 Project invite credits are allocated for first Project onboarding
- Project avatar/logo syncs from verified X where available
- public profile can be completed and published

### 6. Creator -> Project relationship acceptance

With separate human accounts:

Creator -> Projects -> search verified Project -> request Campaign Manager/Analyst/Viewer/Admin -> Project Owner/Admin sees Inbox -> approve/reject -> Creator refreshes -> Project workspace appears -> role permissions match backend rules.

Validate:

- Admin cannot approve another Admin
- Owner can approve Admin
- Owner/Admin can add existing Linkary members directly
- Team invitations do not consume network invite credits
- Owner/Admin cannot alter protected Owner membership through normal role controls
- ownership transfer demotes old Owner to Admin and promotes selected active member to Owner

### 7. Invite attribution acceptance

Test:

Creator/Project creates invite -> recipient clicks -> signup -> registration -> correct inviter attribution -> balance consumed -> dashboard shows clicks/registration/recipient state -> unused invite revoke returns credit.

Do not use TwitterAPI.io for this loop.

### 8. Core Linkary evidence loop

Run the full flow with real test data:

Project -> Campaign -> Activity -> exact Partner -> Tracking Link -> Click -> Outcome -> Growth Report -> Public Growth Proof.

For Creator activity:

`Activity -> exact Linkary Creator profile`

For Telegram placement:

`Activity -> Community Manager -> exact Telegram Community asset`

Validate:

- exact Creator identity persists on the activity
- Community Manager and exact Community IDs both persist for Telegram placement
- Community assignment is rejected if the manager's personal Telegram identity is not verified
- Community verification state remains the asset's actual state
- changing/removing the partner does not delete the activity's existing tracking history
- destination redirect works immediately
- click counts increment exactly once per stored event
- outcomes attach to the correct campaign/activity/link where supplied
- evidence confidence/source is preserved
- report calculations do not invent spend, conversions, outcomes or attributed value
- CSV output matches the on-screen report
- manual outcome/value records never appear as verified public Project proof

### 9. Creator campaign opportunity loop

Project -> Campaign -> publish Opportunity -> public Project profile shows open opportunity -> Creator applies -> Project Inbox receives application -> Project accepts/rejects -> accepted relationship appears in Creator Campaign Proof when applicable.

### 10. Public profile acceptance

Test both Creator and Project profiles:

- verified X avatar/logo
- custom image override
- socials
- featured media
- Media Kit
- Work With Me / collaboration CTA
- Project/Community cards
- Team cards
- drag/reorder
- hide/show
- SEO title/description
- publish/unpublish
- canonical URL
- share metadata
- Creator Campaign Proof
- Project Growth Proof
- open Project Opportunities

Never add editable fake proof metrics.

## Bug-fix priorities

During acceptance, fix in this order:

1. authentication/session blockers
2. onboarding dead ends
3. permission/security errors
4. incorrect attribution/evidence
5. data loss or duplicate writes
6. mobile usability blockers
7. confusing empty/error states
8. cosmetic polish

Do not start Alchemy automation, Telegram Tracker Bot automation, reputation voting, AI recommendations, billing or payouts while a P0/P1 acceptance bug remains open.

## Next product milestone after acceptance

Once the acceptance gate is clean, build **Collaboration Inquiry V1**.

It should connect Partner Discovery to Project workflow without turning Linkary into an execution-first marketplace.

Expected flow:

`Project -> Partner Discovery -> Collaboration Inquiry -> Creator / Community Manager -> Inbox -> Accept / Decline -> optional Campaign / Activity binding -> evidence chain`

For Community work, any accepted collaboration that becomes a campaign activity must still identify the exact Community asset before evidence is attributed.

Do not build Collaboration Inquiry as a separate campaign database.

## Security rules

- backend remains authority
- validate CDP access tokens server-side
- preserve secure Linkary session cookies and CSRF protection
- never trust client-supplied user IDs
- no public privilege escalation
- stable X/Telegram provider UID is canonical, not mutable username
- Project identity remains tied to verified Project X ownership
- personal Telegram verification does not verify represented Communities
- no server authority for wallet trade, transfer, private-key export or policy management
- additional EVM/Solana wallet destinations do not connect those wallets to Linkary
- do not expose secrets
- do not rewrite deployed migrations

## CI and deployment

- Pull requests: regression tests + frontend TypeScript + Wrangler dry-run, no production deployment.
- `main`: verification + Cloudflare production deployment.
- Production health must pass after deployment before a release is called complete.
- Production D1 migrations stay controlled and are not silently auto-applied by normal app deploys.
- A transient health failure must be treated as a release blocker until a clean live health check is observed.

## Definition of Beta-ready

Do not call broad Creator/Project onboarding ready until all are true:

1. protected production migrations are current through the required Beta schema
2. full authenticated responsive UI acceptance is clean
3. Email, Google, X and Telegram auth pass real-account acceptance
4. second real Creator completes Earn Access
5. second real Project completes official-X registration
6. Creator -> Project request/approval/role switching passes with separate users
7. invite attribution passes end to end
8. exact Creator / Community campaign evidence loop passes end to end
9. opportunity/application loop passes end to end
10. Creator and Project public profiles pass mobile/share acceptance
11. no open P0 security, auth, permission, attribution, data-integrity or responsive usability bug remains

After that, begin controlled Beta onboarding and then build Collaboration Inquiry V1. Only after Beta stability should Linkary revisit deferred automation and intelligence features.
