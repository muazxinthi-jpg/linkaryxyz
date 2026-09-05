# Linkary Controlled Beta Acceptance

Updated: 2026-09-05

This is the evidence ledger for the controlled-Beta release decision. It is not a feature roadmap: do not add new product scope to make this checklist pass. Record the test account aliases, date, environment, result and any issue/PR for every item before opening onboarding beyond the initial cohort.

## Release state

- Production source branch: `main`
- Current repository release: verify the current `main` commit and its completed production workflow before each acceptance run.
- Database: migration `0026_immutable_tracked_link_partner_snapshots.sql` is the last confirmed production migration. Migrations `0027_network_invite_redemption_guard.sql` and `0028_creator_access_single_active_claim.sql` require the protected, explicit production apply workflow and post-apply verification before they can be marked complete here.
- Scope boundary: Creator and Community Manager discovery are in Beta. KOL Manager portfolio discovery, Telegram automation, advanced onchain attribution, AI recommendations, payments/payouts and Linkary Score are deferred.

## Evidence convention

For each row, record a dated result and a link to the issue, PR, screenshot, test export or run log. A failed check is a release blocker when it is P0/P1 or affects security, authentication, authorization, attribution, data integrity or ordinary mobile use.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Production deployment | Current `main` workflow completes successfully; app shell and authenticated API health checks pass. | Pending |
| Production D1 | `0027` and `0028` applied only through the protected workflow; post-check reports no pending migrations. | Pending approval/run |
| `main` release safety | GitHub ruleset requires PR and green CI; direct pushes blocked except deliberate emergency bypass. | Pending |
| No release blockers | No open P0/P1 security, auth, role, attribution, data-integrity or responsive-usability defect. | Pending |

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

## Attribution acceptance

Run each flow with designated test data, never customer proof.

- [ ] Creator flow: Project -> Campaign -> Activity -> Creator A -> tracking link -> real click -> outcome/value -> Growth Intelligence -> reassign activity to Creator B.
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
- [ ] Loading, empty and error states are understandable; customer UI does not expose provider/infrastructure terminology.

## Go / no-go decision

Controlled onboarding may begin only when every required gate is marked pass with evidence, the production D1 state is confirmed, and `main` is protected. Start with a small cohort, monitor real usage, fix friction, then expand gradually.
