# Linkary approved product preservation contract

This file records product capabilities that are already built, approved, and expected to remain present unless the product owner explicitly approves a change.

## Change rule

Do not remove, hide, rename away, replace, or materially weaken any protected capability below as part of unrelated cleanup, redesign, refactor, optimization, AI work, or Beta hardening.

If a protected capability genuinely needs to change:

1. Raise the proposed product change explicitly before implementation.
2. Obtain product-owner approval.
3. Add the `approved-product-change` label to the pull request.
4. Update this contract and its regression test in the same approved pull request.
5. Preserve migration, attribution, privacy, permission, and historical-data boundaries unless separately approved.

The `approved-product-change` label is an acknowledgement of explicit approval. It is not a substitute for approval.

## Protected capabilities

### Personal / Creator product

- Invite-only onboarding.
- Creator Earn Access with X-post evidence and Superadmin approval.
- Personal Profiles with selectable professional identities.
- Public profile editor and public profile.
- Social links, featured work, media, SEO/share metadata.
- NFT showcase, NFT collections and NFT avatar capabilities.
- Profile Optimization / Personal Profile Copilot with explicit review before applying suggestions.
- Wallet and reward-destination functionality already present.

### Private Network under Invites

- `/invites` remains the Personal referral-network workspace.
- Invitations remains available.
- My network remains available.
- Network map remains available.
- Seven-generation relationship traversal and visualization, Gen 1 through Gen 7, remains the network-depth rule.
- The interactive map remains fluid and identity-aware, including real safe profile identity, search, zoom/pan and branch interaction.
- Personal referral-network depth does not redefine commercial reward depth.
- Private Network data remains privacy-safe and bounded for D1 performance.

### Project product

- Verified Project Profiles and official-X Project claiming.
- Project ownership, roles, members, team invitations and access controls.
- Project Network remains separate from the Personal referral network.
- Campaigns and activities.
- Creator and Community assignment.
- Partner / relationship functionality already shipped.
- Opportunities, inquiries, activation and relationship memory already shipped.

### Tracking, evidence and attribution

- First-party Linkary tracking links.
- `l.linkary.xyz/r/{code}` tracking route.
- Click, outcome and attribution reporting.
- Exact-partner / immutable tracking-link provenance already shipped.
- Manual evidence must not be presented as verified evidence.
- Missing denominators or unavailable metrics must not be invented.

### Commercial and administration

- Base USDC subscription foundation.
- Usage Credits and current commercial controls.
- Dedicated Superadmin surface and its protected authorization boundary.
- Existing coupon and comped-access behavior already approved, including the current 100% coupon rule.

### AI governance

- AI remains suggestion / assistance oriented for normal product surfaces unless a separately approved feature says otherwise.
- Profile Copilot keeps explicit review before applying suggestions.
- AI must not invent verification, campaign performance, partnerships, customers, funding, revenue, wallet facts or other unsupported claims.

### Public-site deployment topology

- `linkary.xyz/*` remains owned by the dedicated source-controlled `linkary-public-overlay` Worker.
- `linkary-xyz` remains the application Worker for `app.linkary.xyz/*` plus the dedicated Superadmin custom domain.
- Do not add `linkary.xyz/*` to the application Worker while the dedicated public overlay owns that route.
- The public overlay reuses the approved Linkary public rendering and tracking-first homepage transformation from this repository rather than an unrelated out-of-band implementation.
- Production release must dry-run and deploy both Worker configurations and then verify the live public homepage before the release is considered healthy.
- The live public homepage must keep the approved tracking-first positioning, including “Run growth anywhere. Track it in Linkary.” and explicit support for external campaigns.

### Release and stability controls

- Pull requests must pass the existing required verification path before merge.
- Production D1 migrations remain protected and are not silently auto-applied by normal deploys.
- Production app, `/invites`, public homepage, Superadmin and protected frontend checks remain release guards.
- Approved capabilities should gain regression coverage when a production incident reveals they can silently disappear.

## Current preservation checkpoint

Established after the September 8, 2026 Private Network restoration and tracking-first public positioning work. The public-root deployment topology was subsequently stabilized by source-controlling the existing `linkary-public-overlay` Worker separately from the application Worker.
