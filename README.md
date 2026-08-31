# Linkary Signal System

A working multi-view product preview for Linkary's creator campaign intelligence and social growth attribution platform.

Open `index.html` directly or serve the folder with a static HTTP server. The preview has no build step or JavaScript package dependencies.

## Cloudflare deployment

This project is configured for Cloudflare Workers Static Assets. Wrangler uploads the site directly from the repository root while `.assetsignore` keeps project-only files out of the deployment.

```powershell
wrangler dev
wrangler deploy --dry-run
wrangler deploy
```

The Worker name is `linkary-xyz`. Add the `linkary.xyz` zone to the same Cloudflare account before attaching the production custom domain.

- `index.html` — homepage, login/create-account, dashboard, and UI-library views
- `styles.css` — Linkary Signal tokens, components, application layouts, and responsive rules
- `script.js` — preview routing, authentication simulation, modal, notifications, tabs, and toast interactions
- `uilib.md` — canonical design-system and implementation reference
- `assets/brand/` — supplied Linkary identity assets

Use the bottom preview switcher to move between the four views.
