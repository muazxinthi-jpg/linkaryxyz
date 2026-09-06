# Linkary Controlled Beta Acceptance

Updated: 2026-09-06

This is the evidence ledger for the controlled-Beta release decision. It is not a feature roadmap: do not add new product scope to make this checklist pass. Record the test account aliases, date, environment, result and any issue/PR for every item before opening onboarding beyond the initial cohort.

The canonical product and architecture source of truth is `docs/LINKARY_TECHNICAL_PRODUCT_PAPER.md`. This acceptance ledger records release evidence only and must not override that paper.

## Release state

- Production source branch: `main`.
- Current production release: use the latest completed `main` workflow as the authoritative release record before each acceptance run.
- Latest verified production deployment on 2026-09-06 completed regression, Worker TypeScript, authenticated-app TypeScript, Wrangler dry run, Cloudflare deployment and live health checks successfully.
- Production D1 is current through `0034_project_growth_baselines.sql`.
- The latest production migration-state check returned `No migrations to apply!`.
- Production readiness was observed at 34/34 required tables, 5/5 required automation checks and 9/9 production configuration checks after the Alchemy production secret was configured.
- `main` is protected and requires the normal PR checks `verify-and-deploy` and `Workers Builds: linkary-xyz`. A merge was observed blocked while a required Worker build check was still pending, then allowed after the checks passed.
- Scope boundary: Creator and Community Manager discovery are in Beta. KOL Manager portfolio discovery, Telegram automation, advanced onchain attribution, AI recommendations, payments/payouts and Linkary Score remain deferred unless the canonical technical paper is deliberately updated.

## Evidence convention

For each row, record a dated result and a link to the issue, PR, screenshot, test export or run log. A failed check is a release blocker when it is P0/P1 or affects security, authentication, authorization, attribution, data integrity, commercial entitlement integrity or ordinary mobile use.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Production deployment | Current `main` workflow completes successfully; app shell and authenticated API health checks pass. | Pass, 2026-09-06 |
| Production readiness | Required tables, automation and production configuration are complete. | Pass, observed 34/34, 5/5, 9/9 |
| Production D1 | Protected workflow/read-only check reports no pending migrations through `0034_project_growth_baselines.sql`. | Pass, 2026-09-06 |
| `main` release safety | PR + required green checks enforced; deliberate emergency bypass behavior and direct-push rejection should still be acceptance-tested explicitly. | In progress |
| No release blockers | No open P0/P1 security, auth, role, attribution, data-integrity, entitlement or responsive-usability defect. | Pending |

## Known Beta acceptance findings

- Issue #168: a Free Personal account can currently access paid NFT-aware profile functionality. The canonical commercial boundary requires server-side Personal Pro / Collector entitlement enforcement for wallet NFT discovery, NFT avatar, NFT Showcase, collection presentation and NFT-labelled profile items. This must be fixed without changing the billing architecture or adding a D1 migration unless a separately reviewed blocker proves that unavoidable.
- Issue #169: the public landing page still uses execution-first campaign positioning that conflicts with the canonical tracking-first product position. This is a UI/content QA issue, not new product scope.
- NFT chain-aware pagination is deployed. Live acceptance must still confirm the complete real-wallet experience across the supported Beta chain set and public-profile persistence.

## Real-account acceptance

### Authentication and identity

- [ ] Email OTP: new and existing account, logout, reload and invite redirect.
- [ ] Google: new and existing account, logout, reload and invite redirect.
- [ ] X: new and existing account, logout, reload and invite redirect.
- [ ] Invite lifecycle: active, expired, revoked and consumed invite behavior.
- [ ] Telegram profile link: success, cancel/error, reconnect and duplicate identity rejection.
- [ ] Telegram remains separate from Linkary sign-in, account creation, session creation and wallet creation.

### Creator and Project onboarding

- [ ] A second Creator completes invite, Earn Access, unique LKY claim, official-X proof submission, manual review and onboarding.
- [ ] A separate Project completes official-X registration, organization/Owner creation, profile creation and publish flow.
- [ ] Invite credits, claim retry/rejection and invalid/duplicate proof behavior are correct.

### Roles and invites

- [ ] Owner, Admin, Campaign Manager, Analyst and Viewer permissions match both API and UI.
- [ ] Admin cannot approve another Admin; Owner can; protected Owner membership is safe.
- [ ] Team invitations do not consume network-invite credits; ownership transfer works.
- [ ] Invite click, signup, registration attribution, credit consumption and unused-invite revocation work end to end.

## NFT acceptance

Use a real test wallet that owns known assets. Do not treat provider capability gaps as empty-wallet proof.

- [x] Alchemy production configuration is recognized by Beta readiness.
- [x] A real Ethereum wallet returned NFT artwork in the live profile editor.
- [ ] Hard-refresh production and confirm the shared NFT picker exposes `All`, `Ethereum`, `Base`, `BNB Chain`, `Solana`, `Robinhood`.
- [ ] Ethereum first-page loading can expose more than the old 20-item limit and uses bounded pagination.
- [ ] A wallet with more than one page exposes `Load more` and preserves provider cursor state correctly.
- [ ] Selecting one chain queries/browses that chain without unnecessarily loading every supported chain.
- [ ] Solana wallet NFT/asset browsing works with pagination.
- [ ] BNB Chain unsupported/provider-capability behavior is explicit and is not shown as an empty wallet when the provider cannot index NFTs.
- [ ] Robinhood Chain unsupported NFT-indexing behavior is explicit when unavailable.
- [ ] NFT avatar selection saves, survives reload and renders correctly on the public profile for an entitled account.
- [ ] NFT Showcase selection saves, survives reload and renders correctly on the public profile for an entitled account.
- [ ] Free Personal account is blocked from wallet NFT discovery and NFT-aware publishing according to Issue #168, while normal image upload and reward-wallet destinations remain available.

## Attribution acceptance

Run each flow with designated test data, never customer proof.

- [ ] Creator flow: Project -> Campaign -> Activity -> Creator A -> tracking link -> real click -> outcome/value -> Growth Intelligence -> reassign activity to Creator B.
- [ ] New links use the canonical `https://l.linkary.xyz/r/{code}` route and resolve correctly in a real browser.
- [ ] Destination UTM parameters are preserved correctly and Linkary attribution identifiers remain authoritative.
- [ ] After reassignment, activity current partner is B while the pre-existing link, click, outcome and value remain historically attributed to A.
- [ ] Link snapshot provenance is `link_creation`; legacy rows are visibly `legacy/backfilled` and never presented as creation-time proof.
- [ ] Manual values remain Manual; verified-looking public proof uses only valid strong evidence sources.
- [ ] Actual spend, ROI and ROAS use the actual-spend ledger, not budget or planned activity cost.
- [ ] Repeat the reassignment and historical-integrity test through a Community Manager and exact Telegram Community asset.

## Product-loop acceptance

- [ ] Creator: Discovery -> Inquiry -> accept -> explicit activation -> Campaign/Activity -> tracking -> outcome -> attribution -> proof -> completed activity -> Relationship Memory -> Work Again.
- [ ] Community: the same loop through an exact Telegram Community; personal Telegram and Community ownership verification remain separate.
- [ ] Opportunity: Project publishes -> public Project profile -> Creator applies -> Inbox decision -> correct relationship/proof result.
- [ ] Public Creator and Project profiles: media, socials, cards, publish/unpublish, share/canonical metadata, proof and open opportunities.

## Responsive and UX acceptance (Issue #42)

Test authenticated flows at 320px, 375px, 390px, 430px, tablet and desktop.

- [ ] Dashboard, Inbox, Campaigns/Growth, Evidence/Tracking, Partners, Communities, Profile, Projects/Team, Invites, Wallets, Project Network and relevant Superadmin surfaces.
- [ ] No horizontal overflow, clipped content or inaccessible sticky controls.
- [ ] Forms, filters, tabs, modals/sheets and 40-44px touch targets work on mobile.
- [ ] NFT network picker, NFT gallery and `Load more` remain usable on narrow phones.
- [ ] Loading, empty and error states are understandable; customer UI does not expose provider/infrastructure terminology.
- [ ] Manual, estimated or uncertain evidence is not visually presented as Verified.

## Go / no-go decision

Controlled onboarding may begin only when every required gate is marked pass with evidence, production D1 remains current, `main` release controls are accepted, and no launch-blocking issue remains open. Start with a small cohort, monitor real usage, fix friction, then expand gradually.
