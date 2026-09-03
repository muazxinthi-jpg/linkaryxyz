# Linkary Current Beta Build State

Updated: 2026-09-04

This file is the concise current-state handoff for active Beta development. When older status/handoff files conflict with this file, verify against `main` and prefer the current repository.

## Current production baseline

Production `main` currently includes the following post-acceptance milestones:

- Partner Discovery V1 for published Creators and public Community Managers
- exact Creator assignment to campaign activities
- exact Telegram Community assignment through Community Manager -> exact Community asset
- Collaboration Inquiry V1
- accepted Inquiry -> explicit Campaign/Activity activation
- Community Campaign Proof from exact Community activity evidence
- public Community Portfolio proof using the same evidence engine as authenticated Community views
- Partner Relationship Memory + Rehire V1
- `Work again` fresh inquiry flow
- NFT public-preview metadata resilience for EVM and Solana NFTs
- Campaign Activity Lifecycle V1

The current relationship/growth loop is:

`Discover -> Inquire -> Accept -> Explicitly activate -> Campaign -> Activity -> exact Partner -> Mark live/completed -> Track -> Outcome -> Proof -> Relationship Memory -> Work again`

## Evidence rules that remain locked

- Inquiry acceptance means open to discussion only.
- Explicit activation assigns a partner to an exact campaign activity, but does not create performance proof.
- Activity completion records that the activity happened, but does not create performance proof.
- Exact Creator / exact Telegram Community provenance remains authoritative.
- Community Manager personal Telegram verification is separate from Community asset verification.
- Community verification is asset-level.
- Manual outcome/value evidence remains visibly Manual and is excluded from strong public performance totals.
- Strong performance outcome/value sources are `linkary_tracked`, `telegram_verified`, and `provider_verified`.
- Cancelled activity does not qualify as `Worked before`.
- No opaque reputation score or fabricated trend.

## Activity lifecycle now live

`campaign_activities.status` can now move through the controlled V1 lifecycle:

- planned -> live
- planned -> completed
- planned -> cancelled
- live -> completed
- live -> cancelled

Completed and cancelled are terminal in V1.

Lifecycle updates do not create/delete tracking links, clicks, outcomes, exact partner assignments, verification or attribution confidence.

## NFT public-preview resilience now live

Public NFT artwork resolution now supports:

- saved EVM chain + contract + token ID even when the original media URL is missing
- refresh of stale Alchemy NFT CDN artwork from canonical metadata
- Alchemy EVM NFT metadata with onchain tokenURI fallback
- Solana mint metadata through Alchemy `getAsset`
- IPFS / Arweave gateway artwork
- direct image fast path

OpenSea marketplace HTML/social previews are not treated as NFT artwork.

## Production migration caution

Normal production deployments must not silently auto-run D1 migrations.

Protected migration verification remains open. In addition to previously listed Beta migrations, current schema history includes:

- `0017_project_partner_shortlists.sql`
- `0018_verified_x_profile_avatars.sql`
- `0019_project_team_invitations.sql`
- `0020_exact_activity_partner_assignment.sql`
- `0021_collaboration_inquiries.sql`
- `0022_collaboration_inquiry_activations.sql`

Runtime-safe guards exist for recent feature schemas where intentionally implemented, but they do not replace the controlled migration ledger.

Do not claim the formal production migration ledger is current unless it is explicitly verified.

## Acceptance gate still open

Issue #42 remains the broad authenticated responsive acceptance gate.

Required widths:

- 320px
- 375px
- 390px
- 430px
- tablet
- desktop

Real-account / real-device acceptance is still required for authentication, onboarding, Project roles, invites, evidence workflows, public profiles and Superadmin operations before broad onboarding.

## Next product build

The next operational gap identified from current `main` is Campaign Lifecycle V1.

Campaigns can be created and reported today, but the Growth workspace needs a controlled lifecycle so a Project can explicitly close/archive campaign records without deleting historical evidence.

Campaign lifecycle must preserve:

- activities
- exact partner assignments
- tracking links
- clicks
- outcomes
- attribution
- relationship history
- reports

Campaign status must never manufacture proof or mutate evidence confidence.

## Deferred until Beta stability

Keep these deferred while P0/P1 acceptance blockers exist:

- Telegram TrackerBot automation
- Alchemy webhook/onchain attribution automation beyond current NFT metadata use
- AI partner recommendations / Linkary Score
- reputation voting/moderation
- billing, payments and payouts
- referral revenue automation
- delegated wallet signing
