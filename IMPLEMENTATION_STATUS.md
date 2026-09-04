# Linkary implementation status

Updated: 2026-09-04

This file is a current repository-level status summary for Linkary Beta. When an older handoff conflicts with this file, verify against `main` and the current migrations/tests before rebuilding anything.

## Beta product loop

The working Linkary loop is now:

`Identity -> Discovery -> Relationship -> Inquiry -> Accept -> Explicit activation -> Campaign -> Activity -> Exact Partner -> Track -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again`

The core product is built. Remaining launch work is production migration completion, real-account/end-to-end acceptance, full responsive acceptance, bug fixing and final documentation/launch hardening.

## Production foundation

- [x] GitHub `main` is the production source branch.
- [x] Cloudflare Worker + D1 production deployment.
- [x] `linkary.xyz` public site/public profiles.
- [x] `app.linkary.xyz` authenticated React + TypeScript app.
- [x] Pull requests run regression tests, authenticated-app TypeScript checks and Wrangler dry run.
- [x] `main` deploys to Cloudflare and runs post-deploy app-shell health checks.
- [x] Production deployments perform a read-only D1 migration-state check. They never auto-apply D1 migrations.
- [x] Protected production D1 migration workflow is pinned to `main`, defaults to verify-only, and requires an explicit `apply` selection before writing schema changes.
- [x] Ongoing hourly production health monitoring checks primary app-shell routes and `/api/auth/me` with retries.
- [x] Current regression suite: 207 passing tests, 0 failing, as of 2026-09-04.
- [ ] Production D1 ledger is still missing exactly `0020_exact_activity_partner_assignment.sql`, `0021_collaboration_inquiries.sql`, and `0022_collaboration_inquiry_activations.sql` based on the read-only production check on 2026-09-04.

### Required manual D1 action

Run GitHub Actions -> **Linkary production D1 migrations** from the protected workflow with `mode=apply`.

Afterward, the workflow must report `No migrations to apply!` before the formal production ledger is considered current.

Do not rewrite deployed migrations and do not add automatic migration application to the normal deploy workflow.

## Authentication and access

- [x] Email authentication.
- [x] Google authentication.
- [x] X authentication.
- [x] Telegram authentication.
- [x] Server-side provider-token/identity validation.
- [x] Secure Linkary sessions, CSRF protection, logout and revocation.
- [x] Invite-only registration.
- [x] Creator Earn Access with fixed X-post evidence and manual Superadmin approval.
- [x] Creator first workspace receives 10 network invites.
- [x] Project first workspace receives 50 network invites.
- [ ] Final real-account production QA for Email, Google, X and Telegram.
- [ ] Second real Creator Earn Access acceptance from post through approval/onboarding.
- [ ] Second real official-X Project registration acceptance.

## Creator and Project identity

- [x] Creator profiles.
- [x] Project/company profiles.
- [x] Public `linkary.xyz/{username}` profiles.
- [x] Creator/Project workspace switching.
- [x] Project registration tied to official verified X identity.
- [x] Project Linkary username tied to verified Project X handle.
- [x] Avatar/logo, bio, SEO title/description, publish/unpublish.
- [x] Social links, custom links, featured media and headings.
- [x] Team cards.
- [x] Media Kit and Work With Me CTA.
- [x] Drag-and-drop profile ordering.
- [x] Mobile profile editor/live public-profile preview.
- [x] Creator Campaign Proof.
- [x] Project Growth Proof.
- [x] Public campaign opportunities.
- [x] Community Portfolio.
- [x] NFT collection and NFT avatar support with EVM/Base/Abstract/Solana metadata resilience, IPFS/Arweave and onchain tokenURI fallback.

## Project organization and permissions

- [x] Owner.
- [x] Admin.
- [x] Campaign Manager.
- [x] Analyst.
- [x] Viewer.
- [x] Project access requests and approve/reject flow.
- [x] Direct member add.
- [x] Role changes/removal.
- [x] Ownership transfer.
- [x] Project Team invitations separate from network invite credits.
- [x] Backend permission boundaries remain authoritative.
- [ ] Real multi-account Owner/Admin/Campaign Manager/Analyst/Viewer acceptance QA.

## Community Manager system

- [x] Verified personal Telegram identity for Community Manager eligibility.
- [x] Multiple Telegram Community assets per manager.
- [x] Community verification evidence submission.
- [x] Superadmin Community verification review.
- [x] Community Manager identity remains separate from exact Community identity.
- [x] Community verification remains asset-level.
- [x] Partner Discovery exposes Community Managers and exact represented Communities.
- [x] Community Campaign Proof derives from exact Community activity assignments.
- [ ] Telegram TrackerBot and automated join/leave/retention verification remain deferred until after Beta stability.

## Partner Discovery, Inquiry and Relationship Memory

- [x] Project-scoped Partner Discovery for published Creators and public Community Managers.
- [x] Project private shortlist.
- [x] Project network.
- [x] Collaboration Inquiry V1.
- [x] Inquiry fields for collaboration type, campaign, exact Community, budget, deliverables and message where applicable.
- [x] Inbox Accept / Decline.
- [x] Inquiry acceptance remains discussion-only and creates no proof.
- [x] Explicit accepted Inquiry -> Campaign/Activity activation.
- [x] Exact Creator or exact Telegram Community provenance required for activation.
- [x] Activation does not create clicks, outcomes, attribution or proof.
- [x] Relationship Memory.
- [x] Relationship states such as New, Inquiry pending, In discussion, Active and Worked before.
- [x] Previous campaigns/activities/clicks/outcomes/value/manual evidence/exact Communities are available in relationship history.
- [x] Work Again initiates a fresh inquiry instead of fabricating a new campaign record.

## Campaigns, activities and attribution

- [x] Campaign creation/listing.
- [x] Campaign activities/deliverables.
- [x] Exact Creator assignment.
- [x] Exact Community assignment through Community Manager -> exact Telegram Community asset.
- [x] Exact assignment provenance through the existing attribution participant chain.
- [x] Tracking links and redirects.
- [x] Click attribution.
- [x] Outcome/conversion recording.
- [x] Evidence source/confidence handling.
- [x] Attributed value.
- [x] Growth reports and CSV export.
- [x] Source performance.
- [x] Campaign opportunities and Creator applications.

### Activity Lifecycle V1

- [x] Planned -> Live.
- [x] Planned -> Completed.
- [x] Planned -> Cancelled.
- [x] Live -> Completed.
- [x] Live -> Cancelled.
- [x] Completed and Cancelled are terminal in V1.
- [x] Activity lifecycle does not manufacture or delete tracking/evidence.

### Campaign Lifecycle V1

- [x] Draft -> Active / Archived.
- [x] Active -> Paused / Completed / Archived.
- [x] Paused -> Active / Completed / Archived.
- [x] Completed -> Archived.
- [x] Archived is terminal.
- [x] Owner/Admin/Campaign Manager can mutate campaign lifecycle; Analyst/Viewer remain read-only.
- [x] Campaign lifecycle is auth + CSRF protected and Project permissioned.
- [x] Campaign lifecycle changes only campaign status/updated timestamp.
- [x] Completing/archiving a campaign does not complete activities or create/delete proof, clicks, outcomes, assignments, reports, inquiries or Relationship Memory.

## Evidence rules that are locked

- Inquiry acceptance is not campaign proof.
- Explicit activation is not campaign proof.
- Activity completion is not performance proof.
- Campaign completion is not performance proof.
- Exact Creator / exact Telegram Community provenance is authoritative.
- Personal Telegram verification is separate from Community verification.
- Community verification is asset-level.
- Manual evidence remains visibly manual.
- Strong public outcome/value sources remain `linkary_tracked`, `telegram_verified`, and `provider_verified`.
- Cancelled activity does not qualify as Worked before.
- No editable fake proof metrics.
- No opaque Linkary Score until enough defensible data exists.

## Wallets

- [x] Coinbase CDP remains Linkary wallet infrastructure.
- [x] Base wallet foundation.
- [x] Optional manual EVM reward destination.
- [x] Optional manual Solana reward destination.
- [x] Clear warning that additional wallets do not need to be connected and may receive eligible rewards/airdrops directly.
- [ ] Advanced Alchemy webhook/onchain attribution remains deferred.
- [ ] Payments, subscriptions, payouts and delegated signing remain deferred.

## Inbox and Superadmin

- [x] Inbox is an action center, not generic chat.
- [x] Project access requests/decisions.
- [x] Campaign opportunity applications/decisions.
- [x] Collaboration inquiries and Accept/Decline.
- [x] Explicit campaign activation from accepted inquiry.
- [x] Creator access review.
- [x] Community verification review.
- [x] User suspension/restoration foundation.
- [x] Invite-credit adjustment foundation.
- [ ] Persistent read/unread notification infrastructure remains intentionally deferred.

## Responsive and production acceptance

Issue #42 remains open as the broad authenticated visual acceptance gate.

Already protected by targeted regression work:

- [x] Phone bottom navigation.
- [x] Partner Discovery responsive protections.
- [x] Exact Partner Evidence mobile protections.
- [x] Collaboration Inquiry mobile protections.
- [x] Inquiry activation modal protections.
- [x] Relationship Memory mobile protections.
- [x] Community Proof/NFT-specific protections.
- [x] Campaign Lifecycle 320/430/640px controls and 44px mobile targets.
- [x] Hourly production app-shell/API monitoring.

Still required:

- [ ] Full authenticated visual acceptance at 320, 375, 390, 430px, tablet and desktop.
- [ ] Real-device QA for all primary surfaces.
- [ ] Fix every P0/P1 found during that acceptance pass.

## Launch-critical work remaining

1. **Apply production D1 migrations `0020`-`0022` through the protected manual workflow.**
2. Run full Creator onboarding/Earn Access acceptance.
3. Run full official-X Project onboarding acceptance.
4. Test Email / Google / X / Telegram authentication with real accounts.
5. Test Project role permission matrix with separate accounts.
6. Run the full Creator evidence loop:
   `Project -> Campaign -> Activity -> Creator -> Tracking Link -> Click -> Outcome -> Attribution -> Proof -> Completed Activity -> Relationship Memory -> Work Again`.
7. Run the same evidence loop with `Community Manager -> exact Telegram Community`.
8. Test Invite -> signup -> registration attribution.
9. Test Opportunity -> application -> acceptance.
10. Complete issue #42 responsive acceptance and fix all P0/P1 findings.
11. Final documentation/launch copy check.
12. Open controlled Beta onboarding only after the above passes.

## Controlled Beta definition

Do not call broad Beta onboarding ready until:

- production D1 ledger is current through `0022`
- issue #42 is clean
- real auth/onboarding/role/invite/evidence loops pass
- no open P0 security, authentication, permission, attribution, data-integrity or mobile-usability blocker remains

After that, onboard a small controlled cohort first, observe real use, fix friction, then expand.

## Deferred until Beta stability

Do not delay Beta for:

- Telegram TrackerBot automation
- automatic Telegram join/leave verification
- advanced Alchemy webhook attribution
- AI recommendations
- Linkary Score
- public voting/reputation system
- reviews/disputes
- automated payouts
- subscription billing
- delegated wallet signing
- referral revenue sharing
- advanced audience-overlap intelligence
