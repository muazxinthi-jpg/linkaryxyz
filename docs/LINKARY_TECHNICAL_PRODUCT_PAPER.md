# Linkary Technical Product Paper

Last updated: 2026-09-02

## 1. Product thesis

Linkary is a growth attribution, identity, relationship intelligence and evidence platform for Web3 founders, Projects, creators, communities and distribution partners.

Linkary is not execution-first campaign software.

The primary promise is:

> Run growth anywhere. Track it in Linkary.

A Project may run activity through its internal team, an agency, creators, KOLs, Telegram communities, launchpads, growth platforms, events or other external providers. Linkary creates one durable evidence layer across those activities so founders can understand what happened, who contributed, which sources produced outcomes, and which relationships are worth repeating.

Campaign execution inside Linkary is an optional product layer. A founder may choose to open a tracked campaign as a Linkary opportunity and allow creators or manager portfolios to apply or accept. This does not replace the tracking-first architecture.

## 2. Core ownership model

People manage Projects. Projects own growth records.

A Linkary user can have a personal Creator profile and can separately hold roles in one or more Projects.

Project registration is official-X-only. A person cannot create a Project by typing a name. If a registered Project exists, a person requests access. If it does not exist, the Project must first authenticate using its official X identity and claim the matching Linkary Project identity.

Project roles:

- Owner
- Admin
- Campaign Manager (`marketing_manager` in the current backend schema)
- Analyst
- Viewer

Project-owned records include campaigns, activities, tracking evidence, outcomes, invite budgets, Project network records and reporting intelligence.

## 3. Growth tracking model

The canonical evidence chain is:

`Project -> Campaign -> Activity -> Partner -> Tracking Link -> Click -> Outcome -> Attribution -> Relationship History`

A campaign is a growth record, not proof that Linkary executed the campaign.

Each campaign records:

- name
- objective
- budget when known
- dates when known
- status
- source type
- execution mode

Initial source types:

- External / already running
- Internal team
- Agency
- Creator / KOL
- Community
- Launchpad / growth platform
- Linkary
- Other

Execution modes:

- `tracked_elsewhere`: campaign runs outside Linkary and Linkary tracks evidence
- `run_on_linkary`: Project also uses Linkary's optional execution/opportunity layer

The default is `tracked_elsewhere`.

## 4. Attribution confidence

Linkary must never present uncertain evidence as verified truth.

Reusable confidence states:

- Manual: entered by a user without automated supporting evidence
- Tracked: direct Linkary first-party tracking evidence exists
- Correlated: multiple signals support attribution but do not prove it conclusively
- Verified: strong first-party or externally verified evidence exists

Every report must preserve the distinction between these states.

## 5. Creator and Community relationship intelligence

Projects maintain private Project network records for creators and communities they work with.

A network record can accumulate:

- activities participated in
- tracked clicks
- outcomes
- attributed value
- campaign history
- relationship notes
- verification state
- contribution roles

Contribution roles include:

- Creator
- Community host
- Contributor
- Distribution partner

The long-term value is historical intelligence, not merely a contact list. Linkary should answer questions such as:

- Who has this Project worked with before?
- Which creator repeatedly generated attributable outcomes?
- Which Telegram community produced real users rather than impressions?
- What did this relationship cost previously?
- Which partners are improving or declining across repeated campaigns?

## 6. Partner Directory

Linkary maintains a cross-Project Partner Directory for discoverable points of contact.

Initial manager types:

### 6.1 Community Manager

A Community Manager is a POC who may represent multiple Telegram communities.

A manager listing can include:

- Linkary personal profile
- display name
- headline and bio
- X handle
- Telegram contact
- email
- website
- verification state
- open-to-campaigns status

A Community Manager portfolio contains multiple Telegram communities.

Each community asset can include:

- community name
- Telegram handle / URL
- audience size
- verification state
- notes

Directory-level metrics include:

- number of communities
- raw combined audience
- estimated unique audience, only when supplied or verified
- estimated overlap, only when unique audience evidence exists

### 6.2 KOL Manager

A KOL Manager is a POC who may represent multiple creators or KOLs across X, TikTok, YouTube, Instagram, Farcaster or other channels.

Each creator/KOL asset can include:

- creator name
- platform
- handle / URL
- audience size
- verification state
- notes

Directory-level metrics include:

- number of represented creators/KOLs
- raw combined audience reach
- estimated unique audience
- estimated portfolio overlap

## 7. Audience overlap rules

Linkary must not manufacture audience overlap.

Raw combined audience is the arithmetic sum of the listed audiences. It is not unique reach.

Example:

- Creator A: 100,000 followers
- Creator B: 80,000 followers
- Combined audience: 180,000

This does not mean 180,000 unique people.

Unique audience and overlap are separate evidence fields.

When an estimated unique audience is available:

`overlap rate = 1 - (estimated unique audience / combined audience)`

The UI must label the methodology/confidence, for example:

- Manual
- Estimated
- Verified

If no defensible unique-audience estimate exists, the UI shows `Not measured` rather than inventing a number.

Future integrations may improve overlap estimation using consented/available platform analytics, first-party click identities, Telegram attribution, wallet/onchain correlation or other privacy-safe signals.

## 8. Partner performance history and reputation

Linkary reputation is evidence-based performance history. It must not be reduced to an unexplained or opaque reputation score.

Community Managers and KOL Managers can accumulate collaboration history containing:

- number of recorded collaborations
- number of Projects worked with
- campaign relationship when available
- recorded spend
- tracked clicks
- outcomes
- attributed value
- return on spend when spend and attributed value both exist
- notes and date
- evidence source

Initial evidence sources for manager collaboration history:

- Manual
- Tracked
- Verified

A normal Project user may enter a historical collaboration manually, but the record must remain visibly labeled `Manual`. Manual evidence can never silently become verified evidence.

Tracked and verified states should only come from stronger evidence workflows or future integrations.

The product should help a founder answer:

- Has this manager worked with Projects before?
- What measurable results have been recorded?
- Is the evidence manual, tracked or verified?
- What was the historical attributed value?
- Does the available evidence justify repeating the relationship?

This performance history should eventually connect directly to campaign activity and conversion evidence so Linkary can reduce reliance on manually entered history over time.

## 9. Optional Linkary campaign execution

Campaign execution is an additional feature built on top of an existing tracked campaign.

A Project may convert a tracked campaign into an open opportunity containing:

- opportunity title
- brief
- deliverables
- compensation / deal structure
- application deadline
- open / closed state

Eligible Linkary creators can apply using their personal Creator identity.

Community Managers and KOL Managers can apply through a manager listing where appropriate.

Project teams can review and accept/reject applications.

The opportunity layer should reuse the same campaign, activity, tracking and outcome records. Linkary must not create a separate attribution silo for campaigns executed through Linkary.

## 10. Founder Growth Intelligence and Growth Report

Project-level reporting aggregates across campaigns and answers:

- total recorded campaign spend
- active and completed campaigns
- tracked clicks
- outcomes
- conversion rate
- attributed value
- return on spend when spend is known
- cost per outcome when spend and outcomes are known
- top channels / sources
- top activities
- top creators
- top communities
- recurring high-performing relationships
- evidence confidence mix
- source and execution mode

The Founder Growth Report is part of the Growth workspace and is designed to summarize real Project evidence without requiring the founder to understand the underlying tracking model.

Current report capabilities include:

- campaign-by-campaign comparison
- source/channel performance comparison
- creator/community partner performance
- tracked spend
- clicks
- outcomes
- attributed value
- conversion rate
- return on spend
- cost per outcome
- copyable summary
- CSV export

The report must not estimate missing financial or outcome data. If spend, clicks or outcomes are unavailable, Linkary leaves the related metric unavailable rather than fabricating a value.

The founder should be able to understand both an individual campaign and the Project's historical growth performance.

## 11. Tracking and outcomes

Linkary first-party tracking URLs are used instead of raw destination URLs when possible.

Tracking links support:

- active
- paused
- archived

No hard delete is required for historical evidence.

Outcome records support:

- activity
- tracking link
- external outcome ID
- event/outcome type
- source
- confidence
- value
- timestamp

External outcome IDs are idempotent so the same conversion is not counted repeatedly.

## 12. Invite and network graph

Linkary remains invite-only.

Initial allocations:

- Creator: 10 invites
- Project: 50 invites

Invites are not automatically unlimited. Future refresh/increase can depend on the quality and behavior of invited users.

Linkary tracks invite clicks, registrations, use and referral quality through Linkary-owned infrastructure. TwitterAPI.io is not required for the invite/referral onboarding loop.

## 13. Wallet architecture

Coinbase CDP remains Linkary's embedded wallet infrastructure.

It must not be replaced by Alchemy Wallets.

Each Linkary profile can additionally store optional manually entered reward destinations:

- EVM wallet address
- Solana wallet address

These addresses do not need to be connected wallets.

The UI must clearly warn users that future rewards or airdrops may be sent to the saved addresses and that users are responsible for entering an address they control. Blockchain transfers cannot generally be reversed.

Customer-facing wallet UI should use simple product language such as `Your Linkary wallet`, `Additional EVM wallet` and `Additional Solana wallet`. Provider or infrastructure details are not necessary in normal user flows.

## 14. Telegram attribution

Future Telegram attribution should use shared Project-level bot/webhook infrastructure rather than creating duplicate bots per Linkary user.

Signals may include:

- verified joins
- source/invite evidence
- campaign correlation
- community contribution
- outcome correlation

Telegram signals feed the same attribution confidence model.

## 15. Onchain attribution

Alchemy is an attribution/analytics layer, not Linkary's wallet infrastructure.

Initial preferred chain allocation:

1. Base
2. Ethereum
3. Solana
4. Arbitrum
5. Robinhood Chain

Use shared Project-level subscriptions/webhooks where possible.

Onchain signals should be matched to Project activities, campaigns and outcomes using confidence labels and a review path for ambiguous attribution.

## 16. Infrastructure principles

Current delivery stack includes:

- GitHub source control and CI
- Cloudflare Worker
- Cloudflare D1
- Linkary public profile domain
- Linkary app subdomain
- Linkary-owned tracking infrastructure
- Coinbase CDP authentication/wallet infrastructure

Production D1 migrations are manual and versioned. They must not automatically run on every Worker deployment.

Secrets such as tracking salts and database deployment credentials stay server-side and must never reach browser code.

## 17. UI and UX principles

Linkary should remain visually consistent:

- black / white foundation
- restrained Linkary orange accents
- clear information hierarchy
- generous enough whitespace for scanning
- evidence-first metrics
- no infrastructure terminology in customer UI
- no fabricated metrics
- useful empty states
- mobile, tablet and desktop responsive

Readability is a product requirement, not cosmetic polish.

Typography rules for authenticated product screens:

- primary readable text should not use tiny 8px, 9px or 10px production sizes
- normal body and helper text should generally render around 13px to 15px
- labels should generally render around 12px to 13px
- navigation should generally render around 13px to 14px
- form controls should generally render around 13px to 14px
- headings should use responsive sizing rather than fixed desktop-only sizes
- responsive font sizing may use `clamp()` or equivalent techniques
- text must remain readable at tablet and mobile widths

Interaction rules:

- important buttons and controls should have comfortable click/tap targets
- form controls should generally have at least about 40px height, with mobile interactions targeting about 44px where practical
- focus states must be visible for keyboard users
- forms should stack cleanly on narrow screens
- modal interactions should remain usable on mobile
- navigation must remain usable without shrinking text to fit

Customer-facing UI must never expose infrastructure details such as:

- D1
- SQL
- migrations
- Wrangler
- API tokens or secrets
- database schema errors
- stack traces
- internal webhook secrets
- provider configuration identifiers

Backend terminology may exist in technical documentation and admin/developer tooling, but normal creators, founders and Project users should see product language only.

## 18. Beta launch boundary

Before broad onboarding, Linkary should prioritize a complete core loop over more integrations.

Beta-ready core:

1. Invite-only onboarding
2. Creator and Project identities
3. Official-X Project registration and role access
4. Public profiles
5. Founder Growth Tracking
6. Campaign/activity tracking links
7. Outcome Ledger
8. Founder Growth Report
9. Creator/community relationship history
10. Partner Directory with manager portfolios
11. Partner performance history with evidence labels
12. Shareable/exportable campaign reporting
13. Wallet reward destinations
14. Basic admin/recovery/verification controls
15. Responsive readable UX across desktop, tablet and mobile

Telegram automation, Alchemy/onchain attribution, advanced audience overlap and richer campaign execution can iterate from real beta-user behavior.
