# Cloudflare setup for the new Linkary foundation

The repository is D1-ready, but the production D1 database must be created inside the Linkary Cloudflare account before the active `wrangler.jsonc` receives a database ID.

## Create and bind D1

Run `npx wrangler d1 create linkary-db`, then add the returned real database ID to `wrangler.jsonc` as a `d1_databases` binding named `DB`. Do not invent or commit a fake ID.

Apply `migrations/0001_initial.sql` only after the database is created, then verify the schema remotely.

## X OAuth

Configure real `X_CLIENT_ID`, `X_CLIENT_SECRET` when using a confidential Web App, and `X_REDIRECT_URI`. The callback must exactly match the X Developer Console.

Linkary uses X OAuth only to prove account control and obtain the stable provider user ID. TwitterAPI.io is not used anywhere in V1 access, invites, referral attribution, or onboarding.

## URL configuration

Production domains are not hard-coded. When ready, set:

- `PUBLIC_SITE_URL=https://linkary.xyz`
- `APP_BASE_URL=https://app.linkary.xyz`
- `TRACKING_BASE_URL=https://l.linkary.xyz`
- `API_BASE_URL=https://api.linkary.xyz`
- `MCP_BASE_URL=https://mcp.linkary.xyz`

Until then, URL generation falls back to the current Worker request origin.

## Superadmin bootstrap

There is no public make-me-admin endpoint. After the real owner user authenticates and has a `users.id`, bootstrap the first Superadmin with a controlled SQL operation into `admin_grants`. Superadmin authorization is separate from organization RBAC.
