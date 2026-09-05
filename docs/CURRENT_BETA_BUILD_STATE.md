# Linkary Current Beta Build State

Updated: 2026-09-05

This is the concise current-state handoff for active Linkary Beta work. If an older handoff conflicts with this file, verify against `main`, current migrations and CI before rebuilding anything.

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
- immutable tracking-link partner snapshots for reassignment-safe historical attribution
- Founder Growth Intelligence across campaigns, activities, partners and channels
- Creator Campaign Proof
- Project Growth Proof
- Community Campaign Proof
- Relationship Memory
- Work Again
- NFT showcase/avatar metadata resilience for EVM/Base/Abstract/Solana
- Coinbase CDP wallet foundation plus optional EVM/Solana reward destinations
- hourly production app-shell/API health monitoring

Current `main` regression, TypeScript and Wrangler verification are green. Treat the latest `main` CI run as the authoritative test count rather than hard-coding a count in planning documents.

## Current Linkary loop

`Discover -> Inquire -> Accept -> Explicit activation -> Campaign -> Activity -> exact Partner -> Mark live/completed -> Track -> Outcome -> Proof -> Relationship Memory -> Work Again`

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
- Legacy backfilled tracking-link partner snapshots must remain labeled as legacy/backfilled provenance, not proven link-creation history.
- Community Manager personal Telegram verification is separate from Community asset verification.
- Community verification is asset-level.
- Manual outcome/value evidence remains Manual.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified`, and `provider_verified`.
- Missing metric denominators remain unavailable instead of being fabricated.
- Cancelled activity does not qualify as Worked before.
- No opaque reputation score or fabricated trend.

## Production D1 state

The protected production D1 migration workflow was run successfully from `main` on 2026-09-05 using the controlled apply path.

Production schema is current through:

- `0023_personal_profile_identity.sql`
- `0024_activity_measurement_evidence.sql`
- `0025_actual_spend_ledger.sql`
- `0026_immutable_tracked_link_partner_snapshots.sql`

The migration post-check returned `No migrations to apply!`.

The protected workflow remains:

- manual `workflow_dispatch` only
- always checks out `main`
- defaults to `verify`
- requires explicit `mode=apply` to write migrations
- verifies after apply that no migrations remain pending

Normal app deployments report D1 migration drift but never apply schema changes.

Never rewrite a deployed migration.

## Authentication model

Linkary account sign-in is:

- Email verification
- Google
- X

Telegram is a separate authenticated Personal Profile connection. It is linked only after the user has a Linkary session and must not create a Linkary user, session, wallet, Community verification, campaign proof or `auth_identities` record.

Real acceptance must therefore test Email/Google/X sign-in and Telegram profile linking as separate flows.

## Campaign Lifecycle V1 is complete

Campaign Lifecycle is no longer the next feature.

Supported transitions:

- Draft -> Active / Archived
- Active -> Paused / Completed / Archived
- Paused -> Active / Completed / Archived
- Completed -> Archived
- Archived is terminal

Lifecycle mutation is authenticated, CSRF protected and Project permissioned. Owner/Admin/Campaign Manager can write. Analyst/Viewer remain read-only.

Campaign status changes do not mutate activity statuses or create/delete tracking, clicks, outcomes, exact partner assignments, attribution confidence, reports, inquiries, proof or Relationship Memory.

## Growth Intelligence / attribution acceptance is the next critical gate

The schema and runtime code are now production-ready for this acceptance sequence:

1. Project -> Campaign -> Activity -> Creator A.
2. Create a new tracking link while Creator A is the exact assigned partner.
3. Open the tracking link through a real browser to record a real Linkary click.
4. Record a known outcome and optional attributed USD value. Founder-entered outcomes must stay visibly Manual evidence.
5. Record actual spend if testing ROI/ROAS, keeping it separate from budget and planned cost.
6. Confirm Growth Intelligence calculations and partner snapshot coverage.
7. Reassign the activity from Creator A to Creator B.
8. Confirm the original tracking link, click, outcome and attributed value remain historically attributed to Creator A.
9. Repeat with Community Manager -> exact Telegram Community.

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
2. Creator Invite -> auth -> Earn Access -> X evidence -> Superadmin approval -> onboarding -> profile.
3. Project Invite -> auth -> official Project X -> claim -> workspace -> Team roles.
4. Email / Google / X sign-in with real accounts, plus separate Telegram Personal Profile linking.
5. Owner / Admin / Campaign Manager / Analyst / Viewer permission matrix with separate users.
6. Creator evidence loop:
   `Project -> Campaign -> Activity -> Creator -> Tracking Link -> Click -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`.
7. Community evidence loop using `Community Manager -> exact Telegram Community`.
8. Invite click -> signup -> registration attribution.
9. Opportunity -> application -> Project decision.
10. Public Creator/Project profile acceptance on real mobile devices.
11. Full issue #42 authenticated visual acceptance and P0/P1 bug fixing.
12. Add `main` branch protection/ruleset requiring the normal PR + green CI release path before controlled Beta.

## What to build next

Do **not** start another major feature.

The next work is:

1. finish real attribution/end-to-end acceptance
2. finish real-account auth/onboarding/role/invite acceptance
3. finish issue #42 authenticated visual/device acceptance
4. fix every P0/P1 found
5. protect `main` against accidental direct pushes
6. keep documentation synchronized with `main`
7. open a small controlled Beta cohort only after the acceptance gate is clean

## Deferred until Beta stability

Keep these deferred while acceptance blockers remain:

- Telegram TrackerBot automation
- automatic Telegram join/leave verification
- advanced Alchemy webhook attribution
- AI partner recommendations / Linkary Score
- reputation voting/moderation
- billing, payments and payouts
- referral revenue automation
- delegated wallet signing
- advanced audience-overlap intelligence