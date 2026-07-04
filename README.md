# WC26 — Knockout Control Room

Self-hosted, auto-updating FIFA World Cup 2026 dashboard. Dark mode, flags, venues,
team dossiers, live scores, and a bracket that fills itself in as teams advance.

## Run it

```bash
npm install
FOOTBALL_DATA_TOKEN=your_key node server.js
# → http://localhost:3000
```

## Deploy on Render

- New Web Service → build: `npm install` → start: `npm start`
- Add env var `FOOTBALL_DATA_TOKEN` (free key: https://www.football-data.org/client/register — the World Cup is in the free tier)
- Done. No database, no disk.

## How updates work

- The browser polls `/api/matches` every 60 seconds.
- The server fetches from **football-data.org** (if a token is set), falling back to
  **FIFA's public API** (keyless, season auto-discovered), and caches results in memory
  (60s during live matches, 5 min otherwise) so you never hit rate limits.
- Live scores, FT results, penalty shootouts, the COL/GHA-style "winner TBD" slots, and
  quarterfinal → semifinal → final bracket slots all resolve automatically.
- If every provider is down, the page silently falls back to the built-in July 3 snapshot —
  it never breaks.

## Editorial content

Storylines, star players, records, and venue notes are curated in the `DATA` object at the
top of the script in `public/index.html`. Live data overlays scores on top of it; edit the
copy there whenever you want to freshen up the narratives (e.g. after each round).

## Endpoints

- `/` — the dashboard
- `/api/matches` — normalized live match feed (JSON)
- `/api/health` — cache age / liveness
