# FloridaRAMA Calendar

Static calendar for embedding in Wix, hosted on GitHub Pages.

## Local update test

Run from repo root:

`npm run sync`

One-time setup (new computer):

`npm install`

`npx playwright install chromium`

## Hosting (GitHub Pages)

- Keep `init.html` and `events.json` in the repo root.
- In GitHub: **Settings → Pages**
	- Source: **Deploy from a branch**
	- Branch: **main**
	- Folder: **/** (root)
- Page URL format:
	- `https://<username>.github.io/FloridaRAMA-Calendar/init.html`

## Automation (GitHub Actions)

Workflow file: `.github/workflows/sync.yml`

What it does:

- Runs daily on schedule and via manual trigger.
- Installs dependencies with `npm ci`.
- Runs `node scripts/sync_fareharbor_events.mjs --write`.
- Commits and pushes `events.json` only when changes are detected.

If FareHarbor API credentials are added later, store them in repo **Settings → Secrets and variables → Actions** and reference them in the workflow.