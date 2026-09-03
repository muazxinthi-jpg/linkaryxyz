# Linkary implementation status

Updated: 2026-09-02

This file reflects the current repository after the Beta completion work. The Technical Product and Engineering Paper v1.2 and `uilib.md` remain product/design sources of truth. Do not use older handoff notes to decide whether a feature exists without checking the current repository.

## Beta target

Linkary Beta is an invite-only identity, relationship, growth and attribution product for Creators and Projects.

The Beta loop is:

Creator / Project identity -> public profile -> Project relationships -> partner discovery -> campaign activity -> first-party evidence -> outcomes -> reusable Linkary Proof.

## Production foundation

- [x] Cloudflare Worker production deployment from GitHub `main`.
- [x] `linkary.xyz` public site and public profiles.
- [x] `app.linkary.xyz` authenticated React + TypeScript workspace.
- [x] Production D1 database `linkary-db` bound as `DB`.
- [x] Pull requests run regression tests, frontend TypeScript checks and Wrangler dry run.
- [x] `main` runs the same verification and deploys to Cloudflare when credentials are present.
- [ ] Confirm protected production D1 migration state and apply all pending versioned migrations, especially `0017_project_partner_shortlists.sql` and `0018_verified_x_profile_avatars.sql` if they are not already applied.

## Authentication and identity

- [x] Email OTP authentication.
- [x] Google authentication.
- [x] X authentication.
- [x] Telegram authentication.
- [x] CDP access tokens are validated server-side before Linkary trusts identity data.
- [x] Secure Linkary server sessions, CSRF protection, logout and revocation.
- [x] Stable X / Telegram provider identifiers are stored separately from mutable handles.
- [x] X profile image synchronization uses the verified X identity and upgrades `_normal` images to higher-resolution `_400x400` URLs when possible.
- [x] Existing custom non-X profile images remain user-controlled overrides.
- [ ] Run final real-account acceptance QA for all four authentication paths on production.

## Access and onboarding

- [x] Linkary remains invite-only.
- [x] Creator Earn Access path with fixed X copy, unique claim code and manual Superadmin review.
- [x] Arbitrary X URLs never auto-grant access.
- [x] Creator first workspace receives 10 network invite credits.
- [x] Project first workspace receives 50 network invite credits.
- [x] Creator onboarding creates a Creator public profile.
- [x] Project onboarding requires the Project's verified X identity and creates the Project organization/profile.
- [x] A Project Linkary username is tied to the verified Project X handle.
- [x] A personal Creator account must not free-form create or impersonate an unverified Project.
- [ ] Run a second real Creator through Earn Access -> review -> approval -> onboarding end to end.
- [ ] Run a second real Project through official-X registration end to end.

## Creator and Project profiles

- [x] Public `linkary.xyz/{username}` profiles.
- [x] Creator and Project profile editing.
- [x] Avatar/logo, display name, bio, SEO title/description and publish/unpublish.
- [x] Social links, custom links, headings and featured media.
- [x] Team member cards for Projects.
- [x] Media Kit and Work With Me / collaboration CTA blocks.
- [x] Project and Community relationship cards.
- [x] Drag-and-drop ordering plus up/down controls.
- [x] Live mobile editor preview.
- [x] Profile completion / onboarding-readiness guidance.
- [x] Public Creator Campaign Proof from accepted Linkary campaign relationships and tracked/verified collaboration evidence.
- [x] Public Project Growth Proof from stored Linkary campaign/tracking evidence.
- [x] Public Project proof excludes manual outcome/value events.
- [x] Open Project campaign opportunities appear automatically on public Project profiles.
- [ ] Dedicated dynamic 1200x630 profile preview artwork remains optional post-Beta polish.
- [ ] Linkary Score remains deferred until enough defensible data exists.

## Project relationships and permissions

- [x] Project Owner, Admin, Campaign Manager, Analyst and Viewer roles.
- [x] Creator can search verified registered Projects.
- [x] Creator can request a Project role with an optional note.
- [x] Creator can see and cancel pending requests and see past decisions.
- [x] Owner/Admin can review Project access requests.
- [x] Project Admin cannot grant another Project Admin role. Owner approval is required.
- [x] Owner/Admin can search and add existing Linkary members directly.
- [x] Owner/Admin role-management and removal controls follow backend permission boundaries.
- [x] Project ownership transfer exists with explicit Owner confirmation.
- [x] Workspace switching persists the selected Creator/Project profile.
- [ ] Real multi-account permission QA is required before broad onboarding.

## Inbox / action center

- [x] `/dashboard/inbox` exists in the authenticated app.
- [x] Surfaces Project access requests requiring Owner/Admin action.
- [x] Surfaces pending campaign opportunity applications for Owner/Admin/Campaign Manager.
- [x] Access requests can be approved/rejected from Inbox.
- [x] Campaign applications can be accepted/rejected from Inbox.
- [x] User sees recent decisions on their own Project access requests.
- [x] Owner-only access decisions are clearly separated.
- [ ] Persisted read/unread notification infrastructure is intentionally deferred until Beta usage proves it is needed.

## Invites and referral attribution

- [x] Invite balance and ledger.
- [x] Creator and Project invite allocations.
- [x] Invite creation and revocation.
- [x] First-party invite landing/click attribution.
- [x] Invite dashboard UI.
- [x] Click and registration counts.
- [x] Recipient/redemption state where known.
- [x] Privacy-conscious visitor token foundation.
- [ ] Automatic invite quality scoring / credit refresh rules remain deferred. Superadmin can manage credits for Beta.

## Growth, campaigns and attribution

- [x] Campaign creation and listing.
- [x] Campaign activities/deliverables.
- [x] Creator/community/partner assignment foundation.
- [x] First-party tracked links and redirects.
- [x] Click attribution.
- [x] Conversion/outcome ingestion.
- [x] Evidence confidence/source labels.
- [x] Growth report aggregation.
- [x] Spend, tracked clicks, outcomes, attributed value and conversion calculations.
- [x] Source performance reporting.
- [x] CSV export.
- [x] Campaign opportunities and Creator applications.
- [x] Project review of campaign applications.
- [ ] Telegram destination-community Tracker Bot automation is deferred until Beta stability.
- [ ] Telegram join/leave/retention verification is deferred.

## Partner directory and network

- [x] Partner Manager directory.
- [x] Manager represented assets.
- [x] Project private partner shortlist.
- [x] Shortlist status progression.
- [x] Promote selected partner into Project campaign evidence network.
- [x] Collaboration/performance history foundation.
- [ ] Public voting/review reputation system, disputes and anti-brigading controls are post-Beta.

## Wallets

- [x] Coinbase CDP remains the Linkary wallet infrastructure.
- [x] Linkary/Base wallet mapping foundation.
- [x] Manual additional EVM reward destination.
- [x] Manual additional Solana reward destination.
- [x] Clear warning that additional wallets do not need to be connected and may receive eligible rewards/airdrops directly.
- [x] Additional wallet destinations remain private and do not grant Linkary control over those wallets.
- [ ] Alchemy onchain attribution automation is deferred until the core Beta is stable.
- [ ] Payments, subscriptions, payouts and delegated signing are deferred.

## Mobile UX

- [x] Authenticated workspace has a phone bottom-navigation mode.
- [x] Mobile primary navigation is limited to Overview, Inbox, Growth, Profile, Invites and Projects.
- [x] Evidence, Partners and Wallets remain available through workspace flows without overcrowding the phone nav.
- [x] Profile editor has a responsive mobile layout and mobile preview.
- [ ] Final real-device QA remains required at 320, 375, 390 and 430px widths, tablet and desktop.

## Superadmin

- [x] Server-side Superadmin grant boundary.
- [x] Creator Earn Access review queue.
- [x] Approve/reject with rejection reason/history.
- [x] User suspension/restoration operations foundation.
- [x] Invite-credit adjustment operations foundation.
- [x] Verification-mode setting exists, with manual review as default.
- [ ] Run final production acceptance QA with the real Superadmin account.

## Launch-critical work remaining

1. Apply/verify protected D1 migrations, especially 0017 and 0018 if pending.
2. Test Email, Google, X and Telegram authentication with real accounts.
3. Test Creator Earn Access from X post through Superadmin approval and onboarding.
4. Test official-X Project registration with a real second Project.
5. Test invite click -> signup -> registration attribution -> recipient/quality state.
6. Test Creator -> Project access request -> approval -> role switch.
7. Test Owner, Admin, Campaign Manager, Analyst and Viewer permissions using separate users.
8. Test Project -> Campaign -> Activity -> Partner -> Tracking Link -> Click -> Outcome -> Growth Report end to end.
9. Test public Creator/Project profiles on real mobile devices and social-sharing previews.
10. Fix only bugs found in those acceptance passes before broad onboarding.

## Deliberately deferred until Beta is stable

TwitterAPI.io automation, Telegram Tracker Bot automation, Alchemy webhooks/onchain attribution, advanced audience overlap, full reputation voting/moderation, AI recommendations, dedicated `admin.linkary.xyz`, subscription billing, payouts, referral revenue automation and delegated signing.
