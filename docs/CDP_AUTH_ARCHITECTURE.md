# Linkary CDP authentication architecture

Status: locked for V1 implementation.

## Purpose

Coinbase CDP is Linkary's primary authentication and embedded-wallet provider. Linkary keeps product identity, profiles, organizations, permissions, campaign history, reputation, and attribution in Cloudflare D1.

CDP authentication identity must not replace Linkary's external platform identity model.

## Production project

- Product: Linkary
- CDP project: Linkary
- Production application origin: `https://app.linkary.xyz`
- Public website: `https://linkary.xyz`
- Tracking origin: `https://l.linkary.xyz`

The CDP Project ID is a client-side configuration value and should be supplied through environment configuration. Secret API keys, wallet secrets, Telegram bot tokens, and other private credentials must never be committed to this repository.

## V1 sign-in methods

Expose these sign-in methods in the Linkary app:

1. Email
2. Google
3. X
4. Telegram

Apple may be enabled later.

Coinbase-managed OAuth credentials should be used for Google and X initially. Linkary's Telegram login uses the dedicated Linkary authentication bot configured in CDP Portal.

MFA is not mandatory at first sign-in for V1. It can be required later for sensitive wallet or account actions.

## Identity separation

Three identity layers must remain distinct.

### 1. CDP authentication identity

CDP provides the stable `cdp_user_id` for the authenticated wallet user.

D1 stores the association in `cdp_user_links`:

`CDP user -> Linkary user`

The same Linkary user can link more authentication methods over time without creating a second Linkary account.

### 2. Linkary product identity

The `users` table is the canonical Linkary human account. Profiles and organizations are separate objects.

A human may own a creator profile and also own or manage multiple organizations.

### 3. External platform identity

X and Telegram identities continue to use `platform_identities` with immutable provider UIDs.

Examples:

- X numeric/provider UID remains canonical even when the X handle changes.
- Telegram user ID remains canonical even when the Telegram username changes.
- Telegram chat/channel ID remains canonical even when the community username/title changes.

Never use mutable handles as the reputation or campaign-history primary key.

## Server-side authentication boundary

The browser signs in using the CDP Frontend SDK and obtains a CDP end-user access token.

For any Linkary backend operation that creates or changes authenticated product data, the Worker must validate the CDP access token server-side before trusting the user identity.

Canonical flow:

1. User authenticates with CDP in `app.linkary.xyz`.
2. Browser obtains the current CDP end-user access token.
3. Browser sends that token to a Linkary authenticated API endpoint.
4. Linkary Worker validates the token with Coinbase CDP's end-user token validation endpoint using server-side CDP API credentials.
5. Worker reads the returned stable CDP user ID and authentication methods.
6. Worker resolves or creates the Linkary `users` row.
7. Worker resolves or creates `cdp_user_links`.
8. Relevant verified provider identities can be connected to `auth_identities` / `platform_identities` without collapsing the identity layers.
9. Wallet addresses returned by CDP are stored in `wallet_accounts` when needed for Linkary features.

Client assertions about user IDs, Telegram IDs, X IDs, wallet addresses, or authentication state must never be trusted without server-side validation.

## Wallet policy for V1

CDP Embedded Wallets are the only Linkary wallet path in V1.

Do not add MetaMask, Rabby, WalletConnect, or arbitrary external wallets to the V1 onboarding flow.

A wallet is a capability attached to a Linkary user. It is not the user's profile identity and must not become the key for reputation or project ownership.

## Telegram login bot vs Tracker bot

These are separate responsibilities.

### Linkary authentication bot

Purpose:

- Telegram login through CDP
- identify/link the Telegram user authentication method

It is not the campaign attribution bot.

### Linkary Tracker Bot

Purpose:

- installed in the founder/project's own destination Telegram groups/channels
- identify stable Telegram chat/channel IDs
- create or observe campaign-specific invite paths where supported
- verify joins/leaves and retention

Large third-party promotional communities do not need to install the Linkary Tracker Bot. They only publish the founder's Linkary campaign tracking URL.

Traffic model:

`Promotional community -> l.linkary.xyz campaign URL -> founder's Telegram destination -> Linkary Tracker Bot verifies destination growth`

This distinction is mandatory in the V1 product model.

## TwitterAPI.io boundary

TwitterAPI.io is not part of authentication, invite acquisition, referral attribution, or launch-access validation.

It may be added later for paid/revenue-gated X analytics and enrichment such as profile metrics, post performance, follower graph analysis, discovery, and audience intelligence.

## Required environment configuration

Public/non-secret configuration:

- `CDP_PROJECT_ID`
- `PUBLIC_SITE_URL`
- `APP_BASE_URL`
- `TRACKING_BASE_URL`
- `API_BASE_URL`
- `MCP_BASE_URL`

Server secrets, when backend token validation is implemented:

- CDP API key identifier/name
- CDP API key secret/private material

Use Cloudflare secrets for secret values. Do not place them in `wrangler.jsonc`, `.dev.vars.example`, source files, screenshots, issues, or documentation.

## Migration rule

Production D1 has already applied `0001_initial.sql`. Do not rewrite `0001` for CDP.

CDP persistence begins in `0002_cdp_auth_and_wallets.sql`.
