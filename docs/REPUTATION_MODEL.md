# Linkary Reputation Model

This document is a locked product requirement for the new Linkary build.

## Principle

Linkary must keep reputation for the **person/manager/POC** separate from reputation for the **promotional platform/community/account/site** they represent or manage.

A manager can represent multiple Telegram groups, X accounts, websites, media outlets, newsletters, communities, or other promotional channels. The quality of the manager and the quality of each platform must be scored independently.

## Stable identity rule

For platforms that expose an immutable provider identifier, Linkary must anchor identity to that provider UID rather than to a mutable username.

This is especially important for:
- X users/accounts, using the stable X user ID
- Telegram users, groups, supergroups and channels, using the stable Telegram ID available to Linkary

A handle or username is display metadata only.

If the same X or Telegram UID changes from one username to another, Linkary must preserve the same underlying identity, reputation, POC history, campaign history and review history.

If a previously used username is later acquired by a different UID, the new UID must be treated as a separate identity. Historical reputation must never be transferred based on the username alone.

## Core entities

### Person / Manager / POC

Represents the human or business contact a founder dealt with.

Examples:
- Telegram manager
- Community owner
- Sales representative
- Agency contact
- X account manager
- Media sales contact

Store stable Linkary identity plus external platform UIDs and handle history when available.

### Promotional Platform

A separately identifiable channel or outlet where promotion is delivered.

Examples:
- Telegram group or channel
- X account
- Website
- News publication
- Newsletter
- YouTube channel
- TikTok account
- Discord community
- Podcast
- Agency distribution network

A single POC may be linked to many promotional platforms, and a platform may have several POCs over time.

### POC to Platform Relationship

Relationship history must be time-aware.

Suggested fields:
- `poc_id`
- `platform_id`
- `relationship_role` such as owner, admin, manager, sales, reseller, agency_rep
- `verification_level`
- `started_at`
- `ended_at`
- `verified_at`
- `source`

Do not call someone the owner unless ownership is actually verified.

## Founder voting and reviews

Founders should be able to give positive or negative feedback to both:

1. the manager / POC they dealt with
2. the promotional platform where the campaign ran

The UI may present this as Upvote / Downvote, but the backend must preserve structured campaign-linked evidence.

### 180-character short review

Linkary will also support a concise written review attached to a vote.

Locked rule:
- maximum review length: **180 characters**
- review is optional, the Upvote / Downvote may exist without text
- review must be attached to the specific reviewed entity, either the POC/manager or promotional platform
- a founder reviewing both a POC and a platform may leave a separate 180-character review for each
- character count must be enforced on both client and server
- preserve the original submitted review in the audit trail when edited or moderated
- reviews should display their verification state, such as verified campaign, verified deal, or unverified feedback

The 180-character limit is intentional. Linkary reviews should be fast to read and useful for decision-making rather than becoming long complaint threads.

### Preferred eligibility

A vote or review should carry strongest weight when it is attached to a real Linkary campaign, activity, deal, or verified interaction.

Recommended states:
- `verified_campaign_review`
- `verified_deal_review`
- `unverified_feedback`

Verified feedback should have substantially more reputation weight than unverified feedback.

### Structured review dimensions

For Manager / POC:
- communication
- professionalism
- pricing transparency
- adherence to agreed terms
- responsiveness
- dispute handling
- delivery coordination
- overall positive / negative vote

For Promotional Platform:
- promised vs delivered
- audience quality
- views / reach
- joins / conversions
- retention
- value for money
- delivery reliability
- suspicious or bot traffic indicators
- overall positive / negative vote

## Reputation must not collapse into one score

Linkary should expose separate signals such as:

### POC Reputation
- positive founder votes
- negative founder votes
- verified reviews
- campaigns handled
- dispute rate
- delivery coordination score
- verified owner/admin/manager status

### Platform Reputation
- positive founder votes
- negative founder votes
- campaigns tracked
- delivery reliability
- conversion quality
- D7 / D30 retention where applicable
- cost efficiency
- audience quality
- complaint/dispute rate

A highly professional manager can manage a weak platform. A strong platform can also have a bad manager. Linkary must preserve that distinction.

## Historical identity and scam-resistance

Reputation must follow stable identities whenever possible, not mutable usernames.

Examples:
- X account reputation follows X provider UID and handle history.
- Telegram person/group/channel reputation follows its stable Telegram identifier when Linkary has access to it.
- Linkary stores historical handles and relationship periods.

Changing a username must not automatically reset reputation.

If a previously used username is later acquired by a different provider UID, Linkary must treat the new UID as a separate identity rather than transferring the old reputation blindly.

## Anti-abuse

Do not implement unlimited anonymous voting.

Minimum safeguards:
- authenticated founder/account required
- one active vote per founder organization per reviewed entity per qualifying campaign/deal
- campaign-linked reviews weighted higher
- changed votes and review text retain audit history
- server-side 180-character review limit
- abuse / brigading detection
- Superadmin moderation and dispute workflow
- no public accusation labels based only on a single unverified complaint

## Suggested future tables

- `people`
- `promotional_platforms`
- `poc_platform_relationships`
- `reputation_reviews`
- `reputation_votes`
- `review_evidence`
- `review_disputes`
- `reputation_score_snapshots`

Suggested `reputation_reviews` fields should include:
- `id`
- `reviewer_organization_id`
- `target_type` (`poc` or `platform`)
- `target_id`
- `vote` (`up` or `down`)
- `review_text` nullable, max 180 characters
- `verification_state`
- `campaign_id` or `deal_id` when applicable
- `created_at`
- `updated_at`
- moderation/audit state

The exact schema can be introduced when campaign/activity foundations are added, but current architecture must not make it difficult to add these entities later.

## UI direction

On a manager / POC page:
- reputation summary
- Upvote / Downvote counts
- verified review count
- short founder reviews, maximum 180 characters each
- platforms currently represented
- historical platform relationships when appropriate
- campaign history where disclosure is allowed

On a promotional platform page:
- platform identity and verified channels
- current verified POCs
- previous POCs where useful
- founder vote summary
- short founder reviews, maximum 180 characters each
- delivery and performance history
- verified reviews
- warning / dispute state only when supported by appropriate evidence and moderation

## Product value

This reputation graph is a core Linkary differentiator. It allows founders to answer two separate questions before spending money:

1. Is this promotional platform actually effective?
2. Is the person I am dealing with trustworthy and professional?

Those questions must remain separate throughout the data model, scoring model, and UI.
