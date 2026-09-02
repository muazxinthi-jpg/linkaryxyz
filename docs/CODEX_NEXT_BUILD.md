# Linkary Codex Next Build

Date: 2026-09-02

This file is the current implementation handoff for the next engineering batch. Read `IMPLEMENTATION_STATUS.md`, `uilib.md`, and the Linkary Technical Product & Engineering Paper v1.1 as the product/design sources of truth. Do not redesign the architecture from scratch.

## Confirmed production state

- `linkary.xyz` is the public marketing/profile host.
- `app.linkary.xyz` is the authenticated React + TypeScript app.
- Cloudflare Worker `linkary-xyz` deploys from GitHub `main` through GitHub Actions.
- Production D1 is `linkary-db`, binding `DB`.
- CDP authentication is working in production.
- A real production user successfully authenticated with X, redeemed the bootstrap invite, completed Creator onboarding, claimed `linkary.xyz/muazxinthi`, received 10 creator invite credits, and reached `/dashboard`.
- The auth loop was fixed by preserving both `Set-Cookie` headers from `POST /api/auth/cdp/session`. Do not regress this.
- Human `LNK-...` invite codes are case-insensitive. Non-invite security tokens remain exact/case-sensitive.
- Creator Earn Access is manual-review-first and does not depend on TwitterAPI.io.

## Owner / Superadmin bootstrap

The real owner account is the Creator profile with username `muazxinthi` and X identity `@muazxinthi`.

Superadmin must remain a separate controlled `admin_grants` operation. Do not create a public admin signup route, magic admin URL, or invite code that grants admin rights.

After the one-time grant exists, verify `/admin` and the Creator Earn Access review queue for this account.

## Immediate product problem visible after first login

The current authenticated dashboard is only a foundation. A user who joined first as a Creator cannot yet do enough useful work.

A human account is NOT permanently a Creator or Project account. The user must be able to:

- own a Creator profile,
- create one or more Project/Company organizations later,
- belong to/manage multiple organizations,
- switch workspaces without creating a second human login.

The first Creator-vs-Project choice only decides the first workspace.

## Build order

### 1. Complete Superadmin control plane for onboarding

Build/finish the real `/admin` UI, authorized only by `admin_grants.role = superadmin`.

First required admin screen:

- Creator Earn Access queue
- Submitted X URL
- Claim code
- submitted time
- creator identity information available from authenticated account
- Approve
- Reject + reason
- audit history
- verification setting

Manual review is the default.

Add a Superadmin setting for Creator Earn Access verification mode:

- `manual` default
- future `twitterapi_io`

TwitterAPI.io must remain disabled unless Superadmin explicitly configures/enables it. Do not require TwitterAPI.io for invite attribution, launch access, referral attribution, or X post submission.

### 2. Multi-workspace / Project creation

This is the highest-priority user-facing feature after Superadmin.

A Creator user must be able to click something like `Create workspace` / `Add Project` and create a Company / Project without another login.

Implement:

- Create additional Organization
- current user becomes Owner
- create corresponding Project public profile
- claim project Linkary username
- allocate initial 50 Project network invites for the first created project workspace according to locked rules
- workspace switcher listing Creator profile + organizations
- selected workspace persists
- route/dashboard context follows selected workspace
- organization archive/restore remains supported

Do not add a permanent `user_type`.

### 3. Real Profile Editor

Wire the existing profile APIs to a real UI.

Minimum V1:

- avatar/logo
- display name
- bio
- username state
- social links
- custom links
- blocks
- enable/disable blocks
- reorder blocks
- visibility
- publish/unpublish
- SEO title/description
- desktop editor + mobile preview
- responsive mobile UI

Then expand toward Linktree + Media Kit + Campaign Proof + Reputation + Work With Me + Linkary Score.

### 4. Invite Dashboard

The user currently sees only a balance number. Build the actual invite product.

Show:

- available credits
- lifetime granted
- lifetime used
- active invite links/codes
- create new invite
- Creator / Project allowed target
- clicks
- registrations
- redemption status
- later quality state

Creator initial allocation: 10.
Project initial allocation: 50.
Team invitations do not consume network invite credits.
Credits are not automatically unlimited.

### 5. Production authentication acceptance pass

Before broad onboarding, test and fix all paths:

- Email OTP
- Google
- X
- Telegram
- login when already authenticated
- signup when already authenticated
- invite URL across redirect/reload
- logout
- expired/revoked invite
- consumed invite
- mobile and tablet

Never expose CDP, access-token, TwitterAPI.io, server secret, or internal provider implementation terminology in customer-facing UI. Public wallet wording may say `Coinbase Wallet` where relevant.

### 6. Creator Earn Access real-world acceptance test

Run with a second real creator account:

Creator -> Create account -> Creator Earn Access -> authenticate -> Linkary generates unique claim -> `Post on X` opens curated X compose -> user publishes -> submits status URL -> submission appears in Superadmin queue -> Superadmin approves -> creator receives access -> onboarding -> profile -> 10 invites.

Required fixed curated post rules:

- official `@Linkaryxyz` tag
- unique `LKY-...` claim code
- no arbitrary creator copy for the access claim
- only X/Twitter status URLs accepted
- duplicate post reuse blocked
- submission does not auto-grant access in manual mode

### 7. Campaign + Activity + Attribution V1

After onboarding/profile/invites are stable, build the actual Linkary product.

Create new migrations only. Never rewrite deployed migrations.

Core entities/features:

- Campaign CRUD
- Activity / deliverable records
- Creator assignment
- Promotional Community assignment
- Manager / POC assignment
- platform
- spend
- promised reach
- actual reach
- views
- likes
- shares
- clicks
- joins
- conversion
- revenue
- retention where known
- data provenance label

Labels:

- Manual
- Linkary tracked
- Telegram verified
- Provider verified

### 8. `l.linkary.xyz` first-party tracking

Implement first-party redirect/tracking infrastructure.

Tracked link should resolve:

campaign + activity + source identity/community/POC -> record privacy-conscious click/visitor event -> append UTMs where appropriate -> immediate redirect to destination.

Do not use TwitterAPI.io for this.

Then add conversion ingestion and campaign result aggregation.

### 9. Telegram Tracker Bot

Keep responsibilities separate:

- `LinkaryAuthBot` = authentication only
- Linkary Tracker Bot = campaign attribution

A promotional Telegram community does NOT need to install the Tracker Bot.
It posts an `l.linkary.xyz/...` link.
The founder/project installs the Tracker Bot in the founder's destination community/channel.
Track joins/leaves/retention where Telegram permissions allow.

### 10. Reputation, billing, intelligence later

After campaign attribution works end to end:

- POC reputation
- Promotional Platform reputation
- verified campaign reviews
- Creator campaign history
- Creator Score
- referral quality scoring
- billing/subscriptions
- referral revenue ledger
- provider cost ledger
- advanced intelligence

POC reputation and Promotional Platform reputation must remain separate.

## UX requirements

Treat onboarding and dashboard UX as a first-class product problem.

- no dead ends
- no raw provider errors
- no duplicate login/signup confusion
- never ask the user to repair authentication state manually
- one obvious primary action per onboarding screen
- desktop, tablet, and mobile must all be intentionally designed
- no prototype/debug navigation in production
- no em dash in user-facing copy
- use `uilib.md` visual language

Dashboard must become a command center, not an analytics dump.

For a Creator, likely next actions include completing profile, publishing profile, creating invites, and creating a Project workspace.
For a Project, likely next actions include completing project profile, creating first campaign, adding activities/partners, and generating tracking links.

## Security rules

- backend remains authority
- validate CDP access token server-side
- preserve secure Linkary session cookies and CSRF protection
- never trust client-supplied user IDs
- no public privilege-escalation route
- no server wallet authority for trade/transfer/export/manage policies
- stable X/Telegram provider UID is canonical, not mutable username
- do not expose secrets
- do not rewrite migrations already deployed

## CI / deployment

- PRs: tests + TypeScript + Wrangler dry-run, no production deployment
- `main`: tests + TypeScript + dry-run + Cloudflare deployment
- do not automatically apply production D1 migrations until the migration deployment strategy is explicitly approved

## Definition of next milestone complete

Do not call the next milestone complete until all are true:

1. `muazxinthi` is Superadmin through `admin_grants`.
2. `/admin` Creator Access queue works.
3. Creator can create a Project workspace from the same human account.
4. Workspace switcher works.
5. Profile Editor works.
6. Invite Dashboard works.
7. A second real Creator completes Earn Access through Superadmin approval.
8. Email, Google, X, and Telegram login are acceptance-tested.

Then begin Campaign + Activity + `l.linkary.xyz` attribution as the next milestone.
