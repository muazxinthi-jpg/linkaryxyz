# Linkary Founder Freemium and Manual Tracking Model

This document is a locked product direction for the new Linkary build.

## Core principle

Linkary should allow founders to enter the platform for free and experience the network before paying. Monetization should begin when founders want higher-value actions such as revealing business contact details, managing more projects, accessing longer history, or enabling paid/automated data features.

The entry experience must remain inexpensive for Linkary to operate. Manual campaign tracking and Linkary-owned first-party attribution should be available without requiring paid social APIs.

## Recommended launch pricing

### Free

Target: founders evaluating Linkary and beginning to organize their growth activity.

Includes:
- create a founder account
- create and claim one project/company profile
- browse discoverable creators, communities, promotional platforms, and POCs
- see public reputation summaries and non-sensitive public profile information
- shortlist/save profiles
- up to 3 lifetime contact unlocks after account/project verification
- up to 3 active manually tracked campaigns
- basic manual metrics dashboard
- Linkary first-party tracked links within a conservative usage allowance
- 30-day campaign history

No paid social-data automation is included.

### Founder Starter - $9.99/month

Target: individual founders and small teams that primarily operate campaigns manually.

Includes:
- 1 project seat
- 25 new contact unlock credits each billing month
- previously unlocked contacts remain unlocked for that BillingAccount and do not consume another credit
- unlimited manually entered campaigns, subject to reasonable anti-abuse/fair-use safeguards
- 12-month campaign history
- manual campaign performance dashboard
- save and organize creators, communities, POCs, promotional platforms, publications, and partners
- Linkary first-party tracked links with a higher usage allowance
- CSV export of the founder's own manually entered campaign data
- reputation and verified review access according to product visibility rules

This plan does not include paid social API calls or automated social performance refreshes.

### Growth - suggested $39/month at launch

Target: active teams operating several campaigns and projects.

Suggested allowances:
- 3 project seats
- 100 contact unlock credits/month
- team access
- unlimited manual campaign history
- richer comparison/reporting
- higher first-party tracking limits
- additional exports
- future limited automated-provider credits can be offered separately, not bundled as unlimited usage

### Scale - suggested $99/month at launch

Target: high-volume projects and small agencies.

Suggested allowances:
- 10 project seats
- 300 contact unlock credits/month
- larger team
- much higher Linkary-owned tracking allowance
- API/export access when available
- advanced reporting
- provider/API automation charged through defined included credits or add-ons, never unlimited

Agency/enterprise can remain custom.

## Contact unlock model

Use credits rather than unlimited contact visibility.

One contact unlock should reveal the discoverable business contact record for one creator, POC, manager, community representative, promotional platform contact, or similar entity.

Rules:
- one unlock consumes one contact credit
- once unlocked by a BillingAccount, that same contact remains unlocked for that BillingAccount
- revisiting the same contact does not consume another credit
- credits belong to the BillingAccount, not an individual team member
- do not charge separately for each field within the same contact record
- contact access should be auditable
- do not expose private/personal contact details that were not intentionally made discoverable, supplied for business discovery, or otherwise lawfully available for this purpose
- allow people/platforms to control or remove contact information where applicable

Example unlocked contact record:
- preferred contact name
- business email if available/allowed
- Telegram username or verified Telegram contact route
- X account
- website/contact form
- LinkedIn or other business channel if intentionally provided

## Why $9.99 is an entry tier, not the whole product

The $9.99 Founder Starter plan should optimize for conversion and network growth, not maximize immediate ARPU.

Linkary's higher-value monetization comes later from:
- more project seats
- higher contact-unlock volumes
- teams and agencies
- advanced attribution
- automated provider data
- creator/community intelligence
- comparisons and scoring
- API/export access
- workflow/MCP capabilities

Do not bundle expensive provider calls into the $9.99 plan.

## Manual campaign tracking

Founders must be able to create a campaign and manually enter results even when Linkary has no API connection to the underlying social platform.

Suggested fields:
- project
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
- evidence/attachments later

Linkary can calculate derived metrics without any third-party social API:
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

Manual values must be visibly labeled as founder-entered/manual data and must not be represented as Linkary-verified provider metrics.

## First-party tracking remains available

Manual campaign tracking does not mean Linkary is blind.

Linkary-owned redirects such as `l.linkary.xyz/...` can automatically record first-party signals at low marginal cost:
- clicks
- campaign/source relationship
- creator/platform/POC relationship
- timestamp
- privacy-conscious visitor identifier
- country/device/referrer where appropriate
- downstream Linkary registration/conversion

For Telegram, Linkary can later combine the redirect with dedicated Telegram invite links and Bot API member events to measure joins and retention without relying on paid social-data APIs.

## Data provenance labels

Every metric should carry a provenance state such as:
- `linkary_first_party`
- `telegram_bot_verified`
- `provider_verified`
- `founder_manual`
- `creator_manual`
- `estimated`

The UI must make the source clear.

## Product flywheel

Free access creates network density.

Founder browses Linkary
-> discovers creator/community/POC/platform
-> unlocks contact
-> runs campaign
-> tracks campaign manually and/or through Linkary links
-> records outcome
-> leaves structured reputation feedback
-> Linkary accumulates proprietary campaign history
-> future founders make better decisions
-> valuable contact and intelligence access drives paid conversion

This allows Linkary to serve a large initial user base while keeping variable API costs close to zero for Free and Founder Starter users.
