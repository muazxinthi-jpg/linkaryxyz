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

Linkary also maintains a cross-Project Partner Directory for discoverable points of contact.

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

## 8. Optional Linkary campaign execution

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

## 9. Founder Growth Intelligence

Project-level reporting should aggregate across campaigns and answer:

- total campaign spend recorded
- active and completed campaigns
- tracked clicks
- outcomes
- conversion rate
- attributed value
- top activities
- top creators
- top communities
- recurring high-performing relationships
- evidence confidence mix
- source and execution mode

The founder should be able to understand both an individual campaign and the Project's historical growth performance.

## 10. Tracking and outcomes

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

## 11. Invite and reputation graph

Linkary remains invite-only.

Initial allocations:

- Creator: 10 invites
- Project: 50 invites

Invites are not automatically unlimited. Future refresh/increase can depend on the quality and behavior of invited users.

Linkary tracks invite clicks, registrations, use and referral quality through Linkary-owned infrastructure. TwitterAPI.io is not required for the invite/referral onboarding loop.

## 12. Wallet architecture

Coinbase CDP remains Linkary's embedded wallet infrastructure.

It must not be replaced by Alchemy Wallets.

Each Linkary profile can additionally store optional manually entered reward destinations:

- EVM wallet address
- Solana wallet address

These addresses do not need to be connected wallets.

The UI must clearly warn users that future rewards or airdrops may be sent to the saved addresses and that users are responsible for entering an address they control. Blockchain transfers cannot generally be reversed.

## 13. Telegram attribution

Future Telegram attribution should use shared Project-level bot/webhook infrastructure rather than creating duplicate bots per Linkary user.

Signals may include:

- verified joins
- source/invite evidence
- campaign correlation
- community contribution
- outcome correlation

Telegram signals feed the same attribution confidence model.

## 14. Onchain attribution

Alchemy is an attribution/analytics layer, not Linkary's wallet infrastructure.

Initial preferred chain allocation:

1. Base
2. BNB Chain
3. Solana
4. Arbitrum
5. Robinhood Chain

Use shared Project-level subscriptions/webhooks where possible.

Onchain signals should be matched to Project activities, campaigns and outcomes using confidence labels and a review path for ambiguous attribution.

## 15. Infrastructure principles

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

## 16. UI principles

Linkary should remain visually consistent:

- black / white foundation
- restrained Linkary orange accents
- compact information hierarchy
- clear whitespace
- evidence-first metrics
- no infrastructure terminology in customer UI
- no fabricated metrics
- useful empty states
- mobile responsive

Never expose D1, SQL, migrations, Wrangler, API tokens, stack traces, database schema errors or provider implementation details to normal users.

## 17. Beta launch boundary

Before broad onboarding, Linkary should prioritize a complete core loop over more integrations.

Beta-ready core:

1. Invite-only onboarding
2. Creator and Project identities
3. Official-X Project registration and role access
4. Public profiles
5. Founder Growth Tracking
6. Campaign/activity tracking links
7. Outcome Ledger
8. Creator/community relationship history
9. Partner Directory with manager portfolios
10. Shareable/exportable campaign reporting
11. Wallet reward destinations
12. Basic admin/recovery/verification controls

Telegram automation, Alchemy/onchain attribution, advanced audience overlap and richer campaign execution can iterate from real beta-user behavior.
