# Personal Telegram connection

Linkary sign-in uses email verification, Google, and X through CDP. Personal
Telegram is a separate, authenticated profile connection through Telegram OIDC.
It does not create a Linkary user, session, CDP account, wallet, Community
verification, or campaign proof.

## Production setup

Use @LinkaryAuthBot. In BotFather's Login Widget settings, allow:

- `https://app.linkary.xyz`
- `https://app.linkary.xyz/api/auth/telegram/callback`

Keep the default RS256 signing algorithm. Store the Login Widget Client ID and
Client Secret as Cloudflare Worker secrets `TELEGRAM_CLIENT_ID` and
`TELEGRAM_CLIENT_SECRET` on `linkary-xyz`. These are OIDC credentials, not the bot
token. Do not commit them or paste them into logs or task messages.

Remove Telegram from enabled CDP sign-in providers in the CDP portal; the app's
sign-in buttons and CDPReactProvider configuration already omit Telegram. The
owner confirmed there are no users depending on Telegram sign-in.

## Verification

Sign in using email, Google, or X. Open Personal Profile, connect Telegram, and
approve @LinkaryAuthBot. Confirm the connected identity appears and the existing
Linkary profile and wallet remain the same. Refresh to confirm persistence.
Cancel a second attempt and confirm no connection is created. Attempt linking
an already-connected Telegram from another test Linkary account and confirm it
is rejected. Community ownership approval remains a separate process.

The server uses existing oauth_states rows with a ten-minute expiry, PKCE,
session/user binding, and atomic single-use state consumption. It verifies
Telegram JWT signatures, issuer, audience, expiry and issued-at time, and uses
the numeric `id` claim as the Telegram identity key (not username or OIDC sub).
Only profile identifiers and names are persisted; OAuth tokens are discarded.
The identity claim prevents concurrent ownership transfers. No schema migration
is required. Missing credentials return a friendly setup-unavailable response.

Temporary CDP diagnostics are no longer imported by the Personal Telegram UI.
Callback failures log only a fixed outcome, stage, and timestamp.
