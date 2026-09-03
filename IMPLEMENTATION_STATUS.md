# Linkary implementation status

Updated: 2026-09-03

This file reflects the current repository after the exact Partner-to-Activity evidence milestone. The Technical Product and Engineering Paper v1.2, `uilib.md`, `docs/UI_RELEASE_GATE.md`, and `docs/DELIVERY_TEAM.md` remain product/design sources of truth. Do not use older handoff notes to decide whether a feature exists without checking the current repository.

## Beta target

Linkary Beta is an invite-only identity, relationship, growth and attribution product for Creators and Projects.

The Beta loop is:

Creator / Project identity -> public profile -> Project relationships -> partner discovery -> exact campaign partner assignment -> first-party evidence -> outcomes -> reusable Linkary Proof.

## Production foundation

- [x] Cloudflare Worker production deployment from GitHub `main`.
- [x] `linkary.xyz` public site and public profiles.
- [x] `app.linkary.xyz` authenticated React + TypeScript workspace.
- [x] Production D1 database `linkary-db` bound as `DB`.
- [x] Pull requests run regression tests, frontend TypeScript checks and Wrangler dry run.
- [x] `main` runs the same verification and deploys to Cloudflare when credentials are present.
- [x] Production health gate checks live app root and `/profile` after deployment.
- [x] Exact Partner evidence release deployed successfully from commit `31763431d75d4afb248eb1dc6292b243b9a6034d` after a transient first health-check failure; the rerun passed both live health endpoints.
- [ ] Confirm protected production D1 migration state and apply all pending versioned migrations through the controlled migration workflow, including `0017_project_partner_shortlists.sql`, `0018_verified_x_profile_avatars.sql`, `0019_project_team_invitations.sql`, and `0020_exact_activity_partner_assignment.sql` if not already applied.
- [x] `0020` also has an idempotent runtime schema guard so the feature fails safely while the formal migration ledger remains controlled.

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
- [x] Personal Telegram identity verification remains separate from Telegram Community verification.
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
- [x] Project Team invitations are separate from network invite credits and preserve Project role boundaries.
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
- [ ] Collaboration Inquiry events are not built yet and must not be represented as live Inbox functionality.
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

## Communities and Community Managers

- [x] Creator may become a Community Manager after verified personal Telegram identity is present.
- [x] Community Manager can represent multiple Telegram Communities.
- [x] Community portfolio is derived from stored Community assets.
- [x] Community verification is asset-level and separate from the manager's personal Telegram verification.
- [x] Community verification proof submission and Superadmin review exist.
- [x] TrackerBot remains optional/deferred for Beta and is not required to list a Community.
- [x] Partner Discovery exposes public Community Managers and their represented Community portfolio.

## Growth, campaigns and attribution

- [x] Campaign creation and listing.
- [x] Campaign activities/deliverables.
- [x] Exact Linkary Creator assignment to a campaign activity.
- [x] Exact Telegram Community assignment through `Community Manager -> exact Community asset`.
- [x] Exact Community assignment requires the manager's verified personal Telegram identity.
- [x] Exact Community verification state remains asset-level and is never inferred from manager verification.
- [x] Assignment provenance is stored separately from the generic Project network relationship through `campaign_activity_linkary_assignments`.
- [x] Exact partner assignment writes through the existing `campaign_activity_participants` attribution chain instead of creating a parallel campaign system.
- [x] Activity partner can be assigned, changed, or removed without deleting activity tracking history.
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

Canonical evidence path now supported by the product:

`Project -> Campaign -> Activity -> exact Creator / exact Telegram Community -> Tracking Link -> Click -> Outcome -> Attribution -> Relationship History`

## Partner discovery and network

- [x] Partner Discovery V1 is Project-scoped.
- [x] Creator discovery uses real published Linkary Creator identities.
- [x] Community discovery uses public Community Manager identities with Community portfolios.
- [x] Personal Telegram verification and Community verification are shown separately.
- [x] Partner Discovery responsive stabilization protects avatars, card scaling, filters, single-result layouts and mobile actions.
- [x] Partner Manager directory foundation.
- [x] Manager represented assets.
- [x] Project private partner shortlist.
- [x] Shortlist status progression.
- [x] Promote selected partner into Project campaign evidence network.
- [x] Collaboration/performance history foundation.
- [ ] Collaboration Inquiry V1 is not built yet. It remains after Beta/UI acceptance blockers are cleared.
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

## Responsive UI release gate

- [x] `docs/UI_RELEASE_GATE.md` is the mandatory user-facing release rule.
- [x] `docs/DELIVERY_TEAM.md` requires multidisciplinary review before release.
- [x] Partner Discovery has dedicated responsive regression protection.
- [x] Exact Partner Evidence workspace has dedicated 320px / 430px, 44px-target and mobile-modal regression protection.
- [x] Production deployment health is checked after merge.
- [ ] Full authenticated visual acceptance across all primary surfaces is still open in issue #42.
- [ ] Final real-device QA remains required at 320, 375, 390 and 430px widths, tablet and desktop.

## Mobile UX

- [x] Authenticated workspace has a phone bottom-navigation mode.
- [x] Mobile primary navigation is limited to Overview, Inbox, Growth, Profile, Invites and Projects.
- [x] Evidence, Partners and Wallets remain available through workspace flows without overcrowding the phone nav.
- [x] Profile editor has a responsive mobile layout and mobile preview.
- [x] Exact Partner Evidence actions stack on narrow screens with practical 44px targets and mobile-safe modals.
- [ ] Final real-device QA remains required at 320, 375, 390 and 430px widths, tablet and desktop.

## Superadmin

- [x] Server-side Superadmin grant boundary.
- [x] Creator Earn Access review queue.
- [x] Approve/reject with rejection reason/history.
- [x] User suspension/restoration operations foundation.
- [x] Invite-credit adjustment operations foundation.
- [x] Verification-mode setting exists, with manual review as default.
- [x] Community verification review queue exists.
- [ ] Run final production acceptance QA with the real Superadmin account.

## Launch-critical work remaining

1. Apply/verify protected D1 migrations through the controlled workflow, including `0017` through `0020` if pending.
2. Complete issue #42, the full authenticated responsive UI acceptance audit, at 320, 375, 390, 430px, tablet and desktop. Fix any P0/P1 blocker before expanding execution features.
3. Test Email, Google, X and Telegram authentication with real accounts.
4. Test Creator Earn Access from X post through Superadmin approval and onboarding.
5. Test official-X Project registration with a real second Project.
6. Test invite click -> signup -> registration attribution -> recipient/quality state.
7. Test Creator -> Project access request -> approval -> role switch.
8. Test Owner, Admin, Campaign Manager, Analyst and Viewer permissions using separate users.
9. Test Project -> Campaign -> Activity -> exact Creator / exact Telegram Community -> Tracking Link -> Click -> Outcome -> Growth Report end to end.
10. Validate reassignment/removal of an exact activity partner without losing the activity's tracking history.
11. Test the Creator opportunity/application loop end to end.
12. Test public Creator/Project profiles on real mobile devices and social-sharing previews.
13. Fix only bugs found in those acceptance passes before broad onboarding.

## Next feature after the acceptance gate

When the Beta/UI acceptance gate is clean, the next product milestone is Collaboration Inquiry V1, connected to Partner Discovery and Inbox. Do not build it while a P0/P1 acceptance bug remains open.

## Deliberately deferred until Beta is stable

TwitterAPI.io automation, Telegram Tracker Bot automation, Alchemy webhooks/onchain attribution, advanced audience overlap, full reputation voting/moderation, AI recommendations, dedicated `admin.linkary.xyz`, subscription billing, payouts, referral revenue automation and delegated signing.
