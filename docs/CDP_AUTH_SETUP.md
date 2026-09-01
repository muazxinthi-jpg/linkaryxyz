# Linkary Coinbase CDP authentication setup

Status: foundation in progress on `build/cdp-auth-foundation`.

## Product boundary

Coinbase CDP is Linkary's primary authentication and embedded-wallet provider.

Linkary D1 remains the product identity and authorization database. A CDP end user is mapped to one Linkary `users` row. X and Telegram remain separate stable platform identities, anchored to provider UID rather than mutable usernames.

The intended flow is:

1. User opens `https://app.linkary.xyz/login` from a valid Linkary access path.
2. CDP authenticates with Email, Google, X, or Telegram.
3. The frontend retrieves the CDP access token.
4. The frontend posts that access token plus the Linkary invite/grant context to `POST /api/auth/cdp/session`.
5. Linkary validates the token server-side using Coinbase CDP.
6. Linkary upserts the D1 user, linked auth methods, X/Telegram stable platform identities, and embedded wallet account records.
7. Linkary creates its existing secure application session cookie and CSRF token.
8. Existing Linkary RBAC and authenticated APIs continue to use the Linkary server session.

Direct X OAuth remains temporarily in the repository only as a migration fallback. New UI must use CDP.

## Current Linkary CDP project

Project ID:

`ec85aa2b-208c-4ec9-a0f2-3da31a8e2218`

The Project ID is application configuration, not a secret.

Configured portal state:

- Project: Linkary
- Branding: Linkary name and logo
- Telegram login bot: `LinkaryAuthBot`
- Telegram bot domain: `app.linkary.xyz`
- MFA on first sign-in: off for launch
- Require MFA on sign-in: off for launch
- Custom Google credentials: off
- Custom X credentials: off
- Custom Apple credentials: off
- Telegram custom credentials: on
- Recommended account auto-linking: on

## Allowed web origin

In CDP Portal:

`Non-custodial Wallet -> Clients -> Web -> Add domain`

Add:

`https://app.linkary.xyz`

Do not add paths such as `/login`.

## Required server credentials

Create a Secret API Key in the Linkary CDP project. Never commit or paste the secret into repository files.

The Worker requires:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

Store them as Cloudflare Worker secrets when we are ready to deploy:

```powershell
npx wrangler secret put CDP_API_KEY_ID
npx wrangler secret put CDP_API_KEY_SECRET
```

Do not use the CDP Wallet Secret for normal login validation. Wallet/delegated-signing secrets are a separate concern and can remain disabled until Linkary needs backend wallet actions.

## Backend SDK dependency

The CDP session exchange uses Coinbase's official server SDK:

```powershell
npm install @coinbase/cdp-sdk@1.55.0
```

Commit both `package.json` and the generated lockfile after installation. The branch must not be merged or deployed until this dependency is present and the TypeScript build succeeds.

## Frontend packages for the next slice

The planned custom Linkary React login UI will use Coinbase's React/hooks packages rather than a custom OAuth implementation.

Target configuration:

- `projectId`: Linkary Project ID
- `ethereum.createOnLogin`: `eoa` for V1
- authentication methods: Email, Google, X, Telegram

After CDP sign-in, retrieve the user's CDP access token and send it to `/api/auth/cdp/session`. Never trust a client-provided CDP user ID or social UID without server-side access-token validation.

## Access gating

New Linkary accounts still require a valid Linkary access path.

Normal invitation:

`l.linkary.xyz/i/{code}` -> `app.linkary.xyz/login?invite={code}` -> CDP -> Linkary session -> onboarding

Earn Access:

X post URL submission -> temporary grant -> `app.linkary.xyz/login?grant={grant}&method=x` -> CDP X sign-in -> compare authenticated X username with the username in the submitted X post URL -> Linkary session -> Creator onboarding

TwitterAPI.io is not used for this access or ownership-verification flow.

Returning Linkary users can sign in through CDP without consuming another invitation.

## Identity rules

- `auth_identities.provider = coinbase_cdp` stores the CDP end-user ID.
- Email/Google/X/Telegram auth methods may also be linked to the same Linkary user.
- X platform history attaches to stable X `sub`/provider UID, never the mutable handle.
- Telegram platform history attaches to stable Telegram user ID, never the mutable username.
- Handle changes append to `platform_handle_history`.
- Embedded wallet addresses live in `user_wallet_accounts` from migration `0002_cdp_auth.sql`.

## Deployment checklist

Before enabling production auth:

1. `linkary.xyz` Cloudflare zone is Active.
2. `app.linkary.xyz` is attached to the Linkary application Worker/site.
3. `https://app.linkary.xyz` is in CDP Clients.
4. `@coinbase/cdp-sdk` is installed and locked.
5. `migrations/0002_cdp_auth.sql` is applied to remote D1.
6. CDP Secret API Key values are stored with `wrangler secret put`.
7. Frontend CDP login UI is deployed.
8. Test Email, Google, X, and Telegram sign-in.
9. Test invite redemption and Earn Access separately.
10. Confirm stable X/Telegram IDs and wallet account rows in D1.
11. Bootstrap the first Linkary Superadmin only after the owner's real CDP login exists in D1.
