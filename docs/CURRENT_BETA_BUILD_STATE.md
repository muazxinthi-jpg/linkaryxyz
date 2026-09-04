# Linkary Current Beta Build State

Updated: 2026-09-04

This is the concise current-state handoff for active Linkary Beta work. If an older handoff conflicts with this file, verify against `main`, current migrations and CI before rebuilding anything.

## Current production product

The core Beta product is built and production-live:

- invite-only Creator and Project onboarding
- Email, Google, X and Telegram authentication
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
- tracking links, clicks, outcomes, attribution and reports
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
- Community Manager personal Telegram verification is separate from Community asset verification.
- Community verification is asset-level.
- Manual outcome/value evidence remains Manual.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified`, and `provider_verified`.
- Cancelled activity does not qualify as Worked before.
- No opaque reputation score or fabricated trend.

## Production D1 state

The protected production D1 migration workflow was run successfully from `main` on 2026-09-04 using the controlled apply path.

Production schema is current through:

- `0020_exact_activity_partner_assignment.sql`
- `0021_collaboration_inquiries.sql`
- `0022_collaboration_inquiry_activations.sql`

The migration workflow remains protected:

- manual `workflow_dispatch` only
- always checks out `main`
- defaults to `verify`
- requires explicit `mode=apply` to write migrations
- verifies after apply that no migrations remain pending

Normal app deployments report D1 migration drift but never apply schema changes.

Never rewrite a deployed migration.

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

1. Creator Invite -> auth -> Earn Access -> X evidence -> Superadmin approval -> onboarding -> profile.
2. Project Invite -> auth -> official Project X -> claim -> workspace -> Team roles.
3. Email / Google / X / Telegram authentication with real accounts.
4. Owner / Admin / Campaign Manager / Analyst / Viewer permission matrix with separate users.
5. Creator evidence loop:
   `Project -> Campaign -> Activity -> Creator -> Tracking Link -> Click -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`.
6. Community evidence loop using `Community Manager -> exact Telegram Community`.
7. Invite click -> signup -> registration attribution.
8. Opportunity -> application -> Project decision.
9. Public Creator/Project profile acceptance on real mobile devices.
10. Full issue #42 authenticated visual acceptance and P0/P1 bug fixing.

## What to build next

Do **not** start another major feature.

The next work is:

1. finish real-account/end-to-end acceptance
2. finish issue #42 authenticated visual/device acceptance
3. fix every P0/P1 found
4. keep documentation synchronized with `main`
5. open a small controlled Beta cohort only after the acceptance gate is clean

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
