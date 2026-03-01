# FloridaRAMA Calendar

This is a GitHub hosted page that uses GitHub Actions to sync with FareHarbor to update our Events Calendar 

## Hosting (GitHub Pages)

- Keep `init.html` and `events.json` in the repo root.
- In GitHub: **Settings → Pages**
- Page URL format:
	- `https://<username>.github.io/FloridaRAMA-Calendar/init.html`

## Automation (GitHub Actions)

Workflow file: `.github/workflows/sync.yml`

What it does:

- Runs daily on schedule and via manual trigger.
- Installs dependencies with `npm ci`.
- Runs `node scripts/sync_fareharbor_events.mjs --write`.
- Commits and pushes `events.json` only when changes are detected.
