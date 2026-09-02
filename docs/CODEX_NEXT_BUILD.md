# Linkary Codex Next Build

Updated: 2026-09-02

This handoff reflects the current repository. Read `IMPLEMENTATION_STATUS.md`, `uilib.md`, and the Linkary Technical Product & Engineering Paper v1.2 before changing architecture.

Do not rebuild features marked complete in `IMPLEMENTATION_STATUS.md`.

## Current Beta product

Linkary is now substantially beyond the old onboarding prototype.

Implemented product surfaces include:

- invite-only onboarding and Creator Earn Access
- Creator and verified Project public profiles
- verified X avatar synchronization
- profile completion guidance
- Media Kit and Work With Me / collaboration CTAs
- drag-and-drop profile ordering and mobile preview
- automatic Creator Campaign Proof and Project Growth Proof
- open Project campaign opportunities on public profiles
- Project search, role requests, approvals, team roles and ownership transfer
- workspace switching across Creator / Project relationships
- Inbox action center
- invite dashboard and attribution
- campaigns, activities, tracked links, clicks, outcomes and growth reports
- Partner directory, shortlists and Project network
- campaign opportunity applications
- Linkary wallet plus optional EVM/Solana reward destinations

The next engineering phase is **Beta acceptance and bug fixing**, not broad new feature development.

## Locked identity rule

Do not regress this:

- A human account is not permanently typed as Creator or Project.
- A Creator can belong to many Project organizations through roles.
- A Project itself must be registered/claimed through the Project's official verified X identity.
- The Project Linkary username must match the verified Project X handle.
- A personal Creator account must not free-form create or impersonate a Project.
- People manage Projects through Owner, Admin, Campaign Manager, Analyst and Viewer roles.

If a Creator cannot find a Project, the correct flow is for the Project to register with its official X identity first, then the person requests/receives a role.

## Beta acceptance order

### 1. Production migrations

Verify the protected production D1 migration state.

Apply pending versioned migrations through the controlled migration workflow. In particular verify:

- `0017_project_partner_shortlists.sql`
- `0018_verified_x_profile_avatars.sql`

Never rewrite a migration already deployed.

### 2. Authentication acceptance

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

### 3. Creator Earn Access acceptance

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

### 4. Real Project registration acceptance

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

### 5. Creator -> Project relationship acceptance

With separate human accounts:

Creator -> Projects -> search verified Project -> request Campaign Manager/Analyst/Viewer/Admin -> Project Owner/Admin sees Inbox -> approve/reject -> Creator refreshes -> Project workspace appears -> role permissions match backend rules.

Validate:

- Admin cannot approve another Admin
- Owner can approve Admin
- Owner/Admin can add existing Linkary members directly
- Owner/Admin cannot alter protected Owner membership through normal role controls
- ownership transfer demotes old Owner to Admin and promotes selected active member to Owner

### 6. Invite attribution acceptance

Test:

Creator/Project creates invite -> recipient clicks -> signup -> registration -> correct inviter attribution -> balance consumed -> dashboard shows clicks/registration/recipient state -> unused invite revoke returns credit.

Do not use TwitterAPI.io for this loop.

### 7. Core Linkary evidence loop

Run the full flow with real test data:

Project -> Campaign -> Activity -> Partner -> Tracking Link -> Click -> Outcome -> Growth Report -> Public Growth Proof.

Validate:

- destination redirect works immediately
- click counts increment exactly once per stored event
- outcomes attach to the correct campaign/activity/link where supplied
- evidence confidence/source is preserved
- report calculations do not invent spend, conversions, outcomes or attributed value
- CSV output matches the on-screen report
- manual outcome/value records never appear as verified public Project proof

### 8. Creator campaign opportunity loop

Project -> Campaign -> publish Opportunity -> public Project profile shows open opportunity -> Creator applies -> Project Inbox receives application -> Project accepts/rejects -> accepted relationship appears in Creator Campaign Proof when applicable.

### 9. Public profile acceptance

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

### 10. Mobile acceptance

Test at minimum:

- 320px
- 375px
- 390px
- 430px
- tablet
- desktop

Primary phone nav intentionally shows:

- Overview
- Inbox
- Growth
- Profile
- Invites
- Projects

Evidence, Partners and Wallets remain accessible from relevant flows without overcrowding the bottom nav.

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

## Security rules

- backend remains authority
- validate CDP access tokens server-side
- preserve secure Linkary session cookies and CSRF protection
- never trust client-supplied user IDs
- no public privilege escalation
- stable X/Telegram provider UID is canonical, not mutable username
- Project identity remains tied to verified Project X ownership
- no server authority for wallet trade, transfer, private-key export or policy management
- additional EVM/Solana wallet destinations do not connect those wallets to Linkary
- do not expose secrets
- do not rewrite deployed migrations

## CI and deployment

- Pull requests: regression tests + frontend TypeScript + Wrangler dry-run, no production deployment.
- `main`: verification + Cloudflare production deployment.
- Production D1 migrations stay controlled and are not silently auto-applied by normal app deploys.

## Definition of Beta-ready

Do not call broad Creator/Project onboarding ready until all are true:

1. protected production migrations are current
2. Email, Google, X and Telegram auth pass real-account acceptance
3. second real Creator completes Earn Access
4. second real Project completes official-X registration
5. Creator -> Project request/approval/role switching passes with separate users
6. invite attribution passes end to end
7. core campaign evidence loop passes end to end
8. opportunity/application loop passes end to end
9. Creator and Project public profiles pass mobile/share acceptance
10. no open P0 security, auth, permission, attribution or data-integrity bug remains

After that, begin controlled Beta onboarding. Only then revisit deferred automation and intelligence features.
