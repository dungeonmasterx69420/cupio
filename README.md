# Dungeon Dashboards — CUPIO + MAGICO + CSIO on one Render service

Three dashboards, one process, one Render slot. Host-based routing decides which frontend is served; both APIs are always mounted.

| Hostname | App |
|---|---|
| `magico.enterdungeon.cc` (anything starting with `magico`) | **MAGICO** — Orlando Magic HQ |
| `csio.enterdungeon.cc` (anything starting with `csio`) | **CSIO** — Counter-Strike Tier 1 |
| everything else (incl. `cupio.enterdungeon.cc` and the `*.onrender.com` URL) | **CUPIO** — World Cup 26 (default, so nothing about the current deployment changes) |

Path escape hatches also exist from any hostname: `/magico/`, `/cupio/` and `/csio/`.

## Routes

| Route | App | Notes |
|---|---|---|
| `/api/matches` | CUPIO | football-data.org (optional `FOOTBALL_DATA_TOKEN`) → FIFA fallback |
| `/api/health` | CUPIO | cache age |
| `/api/magic` | MAGICO | ESPN public NBA API — **keyless** |
| `/healthz` | MAGICO | liveness |
| `/api/cs` | CSIO | PandaScore (free key → `PANDASCORE_TOKEN`) — tier S/A matches + **all BC.Game matches** (the s1mple tracker) |
| `/api/cs/health` | CSIO | provider + cache status |

Each API module keeps its own independent cache (60s live / 5 min idle / stale-serve on failure). CUPIO's code is extracted unchanged from wc26-dashboard v2.3.1; MAGICO's from magico-dashboard v1.0.0.

## CSIO notes

- HLTV has no public API, so live data comes from **PandaScore** — grab a free key at pandascore.co and set `PANDASCORE_TOKEN` on the Render service. Without it, CSIO runs on its built-in snapshot (seeded July 4, 2026: Cologne Major results, tier-1 calendar through the Singapore Major, s1mple/BC.Game roster state).
- Tier filter: matches from S/A-tier series pass; **BC.Game matches always pass regardless of tier** so the s1mple tracker keeps working while they grind qualifiers. Tune with `CS_TIERS` (default `s,a`) and `CS_TEAM_REGEX` (default `bc[\.\s]?game`) — if s1mple transfers, one env var change repoints the tracker, no redeploy of code.
- The GOAT WATCH card shows his next match with a countdown and a stream link the moment one is scheduled; watch buttons on the match board come from each match's stream list (usually Twitch).

## Deploying over the existing cupio service

1. **Replace the repo contents** with this package (same conventions: `server.js`, `apps/`, `public/`). Render redeploys on push. Build `npm install`, start `npm start` — unchanged.
2. `FOOTBALL_DATA_TOKEN` already set on the service carries over. MAGICO needs no env vars.
3. **Render → the service → Settings → Custom Domains → Add** `magico.enterdungeon.cc` and `csio.enterdungeon.cc`.
4. **Cloudflare DNS**: add `CNAME`s for `magico` and `csio` pointing to the service's `*.onrender.com` hostname (same target as the existing `cupio` record). Proxied is fine.
5. Hit `magico.enterdungeon.cc` and `csio.enterdungeon.cc` — `cupio.enterdungeon.cc` stays untouched.

## Local test

```bash
npm install && npm start
# cupio:   http://localhost:3000
# magico:  http://magico.localhost:3000   (browsers resolve *.localhost to 127.0.0.1)
```

## Adding a third dashboard later

Drop a router in `apps/`, a frontend in `public/<name>/`, add one line in `server.js`'s host check + a `require`. Same slot, no new service.

Unofficial fan dashboards — not affiliated with FIFA, the NBA, the Orlando Magic, Valve, or any tournament organizer.
