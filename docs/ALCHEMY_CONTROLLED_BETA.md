# Linkary Alchemy Controlled Beta Architecture

Last updated: 2026-09-06

This document is the current production addendum for Alchemy usage during Linkary Controlled Beta. It supersedes older chain-allocation language in Section 15 of `LINKARY_TECHNICAL_PRODUCT_PAPER.md` wherever there is a conflict.

## Production Alchemy app

The active Linkary production Alchemy app is configured for these five networks:

1. Ethereum
2. Base
3. BNB Chain
4. Solana
5. Robinhood Chain

Arbitrum is not an active Controlled Beta Alchemy network and must not be called by current automatic NFT discovery.

## Wallet infrastructure boundary

Coinbase CDP remains Linkary's embedded wallet infrastructure and must not be replaced by Alchemy Wallets.

Alchemy is used as an onchain data, NFT discovery, verification and future attribution provider. Manually saved additional EVM and Solana addresses remain non-signing reward/display destinations unless a separate verification workflow proves ownership.

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

Token, transfer, price and webhook services can remain prepared for later Beta work, but they are not automatically invoked simply because the Alchemy app has them enabled.

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

For campaigns, Linkary tracking/UTM links remain the primary low-cost attribution signal. Future onchain attribution should be activated only for the relevant Project, campaign, activity or wallet scope. Webhooks, Transfers API, Token API and Prices API should be introduced only where they materially improve a real Beta workflow.

The platform must not scan every Linkary wallet, user or campaign on a timer. Database growth should not make normal requests proportionally more expensive.
