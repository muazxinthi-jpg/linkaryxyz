# Linkary Alchemy Controlled Beta Architecture

Last updated: 2026-09-12

This document is the current production addendum for Alchemy usage during Linkary Controlled Beta. It supersedes older chain-allocation language in Section 15 of `LINKARY_TECHNICAL_PRODUCT_PAPER.md` wherever there is a conflict.

## Production Alchemy app

The active Linkary production Alchemy app is configured for these five networks:

1. Ethereum
2. Base
3. BNB Chain
4. Solana
5. Robinhood Chain

Arbitrum and Polygon are not active Controlled Beta attribution networks. Polygon may exist only in historical attribution rows created before the five-network correction; new Polygon watch targets and events are rejected.

## Wallet infrastructure boundary

Coinbase CDP remains Linkary's embedded wallet infrastructure and must not be replaced by Alchemy Wallets.

Alchemy is used as an onchain data, NFT discovery, verification and attribution provider. Manually saved additional EVM and Solana addresses remain non-signing reward/display destinations unless a separate verification workflow proves ownership.

## Enable broadly, consume narrowly

Alchemy services may be enabled on the production app so Linkary can test them during Controlled Beta. Enabling a provider service does not authorize Linkary to poll it continuously.

Runtime rules:

- provider calls are server-side only
- calls occur only for a relevant product action or scoped attribution workflow
- normal personal-profile use never starts continuous wallet monitoring
- specific-chain requests query only the selected chain
- `All` NFT browsing uses bounded first-page requests only
- result sets use pagination/cursors rather than unbounded downloads
- provider failures do not take down identity, invites, first-party tracking or profile rendering
- shared Project/campaign webhooks or targeted reads are preferred over broad polling when automated attribution is introduced

## Chain capability registry

The backend keeps one central Controlled Beta chain registry instead of scattering network assumptions across routes.

Current NFT discovery states:

| Network | RPC | Automatic NFT discovery | Controlled Beta behavior |
| --- | --- | --- | --- |
| Ethereum | Active | Active | Alchemy NFT API v3 |
| Base | Active | Active | Alchemy NFT API v3 |
| BNB Chain | Active | Capability probe | Attempt only when requested, return a safe unavailable state if provider NFT indexing is unsupported |
| Solana | Active | Active | Alchemy Solana asset discovery |
| Robinhood Chain | Active | Unavailable for current NFT picker | Keep available for future RPC/onchain use, do not fake NFT indexing |

Token, transfer and price services can remain prepared for later Beta work, but they are not automatically invoked simply because the Alchemy app has them enabled.

## Campaign attribution chain set

The active onchain attribution contract is exactly Ethereum, Base, BNB Chain, Solana and Robinhood Chain. This list is explicit in the attribution route so a future expansion of the general chain registry cannot silently expand webhook acceptance.

- Ethereum, Base, BNB Chain and Robinhood Chain use canonical `0x` EVM addresses and store them lowercase.
- Solana uses validated 32-byte base58 public keys and preserves their case.
- Each network fails closed unless its own webhook ID and signing key are configured.
- Base keeps its existing webhook and secret bindings. Additional provider webhooks are not created by repository code or by this corrective change.
- Raw webhook bodies are authenticated before parsing. Provider events remain idempotent evidence and become `provider_verified` conversions only after explicit review approval.
- Reorg notifications retain the evidence row and revoke only the corresponding provider-verified conversion.
- Polygon is storage-compatible for historical rows only and cannot receive new watch targets or events.

## NFT picker

Both NFT-avatar selection and NFT Showcase selection use the same chain-aware wallet gallery.

User-facing chain selector:

`All | Ethereum | Base | BNB Chain | Solana | Robinhood`

Behavior:

- default is `All`
- the last selected network is remembered per Linkary profile in local browser storage
- selecting a specific network sends that network to the backend, so Linkary does not fetch every chain and filter only in the browser
- EVM discovery uses pages of up to 100 assets and preserves Alchemy `pageKey`
- Solana discovery is paginated
- `Load more` is available for a selected network when another page exists
- the old global 120-NFT browsing truncation is removed
- one network failure does not hide successful results from another network
- unsupported provider capability is labelled unavailable rather than shown as an empty wallet
- no D1 migration is required for the chain preference or pagination state

## Economic and attribution policy

Linkary remains first-party and event-driven wherever possible.

For campaigns, Linkary tracking/UTM links remain the primary low-cost attribution signal. Onchain attribution is activated only for the relevant Project, campaign, activity or wallet scope. Webhooks and any future Transfers API, Token API or Prices API use should be introduced only where they materially improve a real Beta workflow.

The platform must not scan every Linkary wallet, user or campaign on a timer. Database growth should not make normal requests proportionally more expensive.

## Campaign workspace

Project teams use On-chain Attribution inside the existing campaign evidence workspace. They can add or disable watched wallets, retry provider synchronization, filter evidence, and explicitly confirm or ignore events without accessing Alchemy or Cloudflare directly. Owner, Admin and Marketing Manager roles may mutate attribution state; Analyst and Viewer roles are read-only. Confirmed evidence enters the existing Outcome Ledger as `provider_verified` with `verified` confidence. Reorged evidence remains auditable and cannot be confirmed.
