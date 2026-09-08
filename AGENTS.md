# Linkary repository instructions for Codex and coding agents

These rules apply to every task in this repository.

## Start from current main

Before changing code, fetch and synchronize with `origin/main`. Do not implement a task from a stale branch snapshot. If a feature branch is behind `main`, rebase or merge current `main` before making product edits.

If a conflict touches a protected product file listed below, keep the current `main` version unless the user's task explicitly requests changing that protected capability.

## Protected product capabilities

The following are already-built, product-owner-approved capabilities and must not disappear, be hidden, be renamed away, or be replaced during unrelated work:

- `/invites` as the Personal Private Network workspace.
- `Invitations` view.
- `My network` view.
- `Network map` view.
- Seven-generation traversal and visualization, Gen 1 through Gen 7.
- Interactive identity-aware referral map.
- Existing invite balances, invitation activity, referral quality, and referral history.
- Project Network remains separate from the Personal referral network.

Protected implementation paths include:

- `frontend/src/InviteExperience.tsx`
- `frontend/src/PersonalNetworkPanel.tsx`
- `frontend/src/PrivateNetworkMapV2Panel.tsx`
- `frontend/src/InteractiveNetworkMapV3.tsx`
- `frontend/src/private-network-tabs.css`
- `frontend/src/AppV3.tsx`
- `frontend/src/ProductWorkspace.tsx`
- `frontend/src/main.tsx`
- `src/trackingEntry.ts`
- `docs/APPROVED_PRODUCT_PRESERVATION.md`
- `tests/approved-product-preservation.test.ts`
- `.github/workflows/deploy-production.yml`

Do not modify protected paths for wallet, NFT, AI, billing, campaign, tracking, profile, or unrelated UI tasks. If a task truly requires a protected product change, call it out explicitly and use the repository's `approved-product-change` process.

## Wallet and private-key work isolation

Wallet export work must stay isolated to the wallet implementation and directly required wallet/auth support files. It must not overwrite or restore older versions of shared product files.

For any private-key export feature:

- Never log, persist, send to analytics, or place a private key in D1, server logs, error reporting, URLs, query strings, or telemetry.
- Require an explicit user action before revealing/exporting the key.
- Keep unrelated product behavior unchanged.

## Production deployment rule

Feature branches are not production releases.

- Never run `wrangler deploy` or `npm run deploy` from a non-`main` branch.
- For branch validation, use `npm run check`, dry runs, or `npm run deploy:preview`.
- Production deployment belongs to the protected `main` workflow only.

Before opening a PR, run the full regression/type/dry-run checks and confirm the Private Network tests still pass.
