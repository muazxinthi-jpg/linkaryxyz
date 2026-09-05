# Linkary Pricing and Manual Tracking Model

This document is a locked product direction for the Linkary Controlled Beta and launch pricing.

## Core principle

Linkary should keep network participation and basic Personal Profile utility free while monetizing premium personal-profile presentation and higher-value Project workflows.

Manual campaign tracking and Linkary-owned first-party attribution should remain inexpensive to operate and must not depend on paid social APIs.

Variable-cost features such as automated provider data and AI must use explicit limits, credits, fair-use controls or add-ons. Linkary must not promise unlimited paid-provider usage inside a low-cost flat plan.

## Locked launch pricing

### Free - $0

Target: normal Personal Profiles, Creators, Community Managers and users entering the Linkary network.

Includes:

- Personal Profile and public profile
- selectable public identity
- social and normal featured profile content
- discovery participation
- Creator/Community campaign proof when legitimately earned
- Community portfolio where applicable
- Linkary invite allocation according to product rules
- wallet basics and optional reward destinations
- participation in Project campaigns/opportunities according to product permissions

Not included:

- NFT Wallet Discovery
- NFT Showcase
- NFT Avatar
- NFT Collection / collection showcase premium presentation

### Personal Pro / Collector - $4.99/month

Target: users who want a premium Web3 personal-profile presentation.

Includes the Free Personal Profile capabilities plus:

- NFT Wallet Discovery
- NFT Showcase
- NFT Avatar
- NFT Collection / collection showcase support

Alchemy powers the wallet/NFT discovery layer server-side. The feature should be on demand rather than continuously polling user wallets.

Personal Pro / Collector is a Personal Profile subscription. It does not replace Project subscriptions.

### Project Manual - $9.99/month

Target: individual founders and small Projects that primarily operate campaigns manually and through Linkary first-party tracking.

Includes:

- one Project subscription scope
- manual campaign tracking
- Linkary first-party tracking links within the plan allowance
- campaign history and entry paid reporting
- Project partner/discovery workflows according to product permissions
- contact unlock allowance according to the current commercial configuration
- CSV/export capabilities available to this tier

This plan does not include unlimited paid social-data automation or unlimited external-provider calls.

### Project Automate - $33.99/month

Target: active Projects that need more automation, provider-assisted data and recurring campaign operations.

Includes the Project Manual foundation plus:

- higher campaign/tracking allowances
- larger team/workflow capacity
- controlled automated-provider features
- controlled AI usage
- richer recurring reporting and operational automation

Provider/API usage must be bounded by plan credits, usage caps, fair-use controls or explicit add-ons.

### Project Growth - $99.99/month

Target: higher-volume Projects and growth teams.

Includes the Project Automate foundation plus:

- substantially higher campaign/tracking limits
- higher team/contact/provider/AI allowances
- deeper Founder Growth Intelligence
- advanced reporting and comparisons
- larger export/API allowances as those capabilities become available

### Scale / Agency / Enterprise

Custom or higher-volume pricing can be introduced for agencies, multi-Project operators and enterprise requirements.

The commercial design should preserve explicit provider and AI allowances rather than hide unlimited variable-cost usage inside a flat subscription.

## Configurable entitlements

The headline prices above are locked for launch.

The following values remain configurable from real Controlled-Beta usage:

- contact unlock counts
- first-party tracking allowances
- Project/team limits beyond the headline scope
- AI request/model allowances
- automated-provider credits
- export/API allowances
- fair-use thresholds

Changing a quota does not require changing the locked headline plan prices.

## Contact unlock model

Use credits rather than unlimited contact visibility where contact-unlock monetization is enabled.

One contact unlock should reveal the discoverable business contact record for one creator, POC, manager, community representative, promotional platform contact or similar entity.

Rules:

- one unlock consumes one contact credit
- once unlocked by a BillingAccount, that same contact remains unlocked for that BillingAccount
- revisiting the same contact does not consume another credit
- credits belong to the BillingAccount, not an individual team member
- do not charge separately for each field within the same contact record
- contact access should be auditable
- do not expose private/personal contact details that were not intentionally made discoverable, supplied for business discovery or otherwise lawfully available for this purpose
- allow people/platforms to control or remove contact information where applicable

Example unlocked contact record:

- preferred contact name
- business email if available/allowed
- Telegram username or verified Telegram contact route
- X account
- website/contact form
- LinkedIn or another intentionally supplied business channel

## Manual campaign tracking

Projects must be able to create a campaign and manually enter results even when Linkary has no API connection to the underlying social platform.

Suggested fields:

- Project
- campaign name
- campaign objective
- promotional platform/channel
- creator/community/publication
- POC/manager
- spend
- currency
- start/end dates
- promised deliverables
- delivered status
- content/post URL
- Linkary tracked URL
- impressions/views
- likes/reactions
- comments
- reposts/shares
- clicks
- Telegram joins
- retained users where known
- signups
- wallet connections where known
- conversions
- revenue attributed manually where known
- founder notes
- evidence/attachments

Linkary can calculate derived metrics without a paid third-party social API when the required source values exist:

- CPM
- CPC
- cost per Telegram join
- cost per retained member
- cost per signup
- CPA
- conversion rate
- retention rate
- ROAS when revenue is entered
- promised-vs-delivered variance

Manual values must remain visibly labeled as manual/founder-entered data and must not be represented as provider-verified metrics.

## First-party tracking remains available

Manual campaign tracking does not mean Linkary is blind.

Linkary-owned redirects can automatically record low-marginal-cost first-party signals such as:

- clicks
- campaign/source relationship
- creator/platform/POC relationship
- timestamp
- privacy-conscious visitor identifier
- country/device/referrer where appropriate
- downstream Linkary registration/conversion

For Telegram, Linkary can later combine redirects with dedicated invite links and Bot API member events to measure joins and retention without relying on paid social-data APIs.

## Data provenance labels

Every metric should preserve an explicit provenance/evidence state, for example:

- Linkary first-party / Tracked
- Telegram verified
- provider verified
- founder manual
- creator manual
- estimated/correlated

The UI must make the source and confidence clear.

## AI and provider cost rule

AI and external provider usage must be controlled centrally.

During Controlled Beta:

- paid AI models default to disabled
- free/approved inference is preferred
- provider calls should be scoped and on demand where possible
- usage should be logged and capped
- failure or quota exhaustion must degrade gracefully rather than break identity, profiles, invites or first-party tracking

The $4.99 Personal Pro / Collector tier may use Alchemy for NFT discovery without exposing provider terminology in the normal user experience.

## Product flywheel

Free access creates network density.

User joins Linkary
-> builds a Personal Profile
-> creator/community becomes discoverable
-> Project discovers a partner
-> Project runs and tracks a campaign
-> outcomes and evidence accumulate
-> Relationship Memory improves
-> Growth Intelligence becomes more valuable
-> premium personal presentation and higher-value Project workflows drive paid conversion

This allows Linkary to grow the network while keeping Free participation inexpensive and monetizing the features that create additional presentation, automation and intelligence value.
