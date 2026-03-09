# FloridaRAMA Events Calendar

Live events calendar for FloridaRAMA, hosted on GitHub Pages and auto-updated with GitHub Actions.

This project keeps the site fast, simple, and low-maintenance:

- Static front-end (`init.html`) for clean embedding in Wix.
- Automated FareHarbor sync into `events.json`.
- Optional manual events in `manual-events.json` for non-bookable dates.

## Why this is cool

- **Hands-off updates:** events refresh automatically on a schedule.
- **No backend to babysit:** static hosting + automation pipeline.
- **Easy to embed:** drop the hosted URL into a Wix HTML iframe.
- **Clean architecture:** display layer (`init.html`) and data layer (`events.json`) are separated.

## Live Page

- `https://<username>.github.io/FloridaRAMA-events-calendar/init.html`

## Hosting (GitHub Pages)

- Keep `init.html` and `events.json` in the repo root.
- In GitHub: **Settings → Pages**
	- Source: **Deploy from a branch**
	- Branch: **main**
	- Folder: **/** (root)

## Automation (GitHub Actions)

Workflow: `.github/workflows/sync.yml`

What it does:

- Runs daily on schedule and via manual trigger.
- Installs dependencies with `npm ci`.
- Runs `node scripts/sync_fareharbor_events.mjs --write`.
- Commits and pushes `events.json` only when changes are detected.

## Manual Non-Bookable Events

You can add extra non-bookable events directly in `manual-events.json`.

- `init.html` loads both `events.json` and `manual-events.json` and merges them.
- If `manual-events.json` is missing, the calendar still loads FareHarbor events normally.
- Manual events are ideal for open days, special hours, and internal/promotional dates that should not exist in FareHarbor.

Example event object:

```json
{
	"id": "open-day-2026-03-20",
	"title": "Open Day",
	"start": "2026-03-20T10:00:00",
	"end": "2026-03-20T20:00:00",
	"url": "https://floridarama.com/visit",
	"thumbnail": "https://example.com/open-day.jpg"
}
```

Notes:

- Required fields: `title`, `start`
- Recommended: `id` (prevents accidental duplicates)
- Optional: `end`, `url`, `thumbnail`

## Local Run (Optional)

If you want to test sync locally:

- `npm install`
- `npx playwright install chromium`
- `npm run sync`
