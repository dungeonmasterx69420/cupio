# Dungeon Dashboards — CUPIO + MAGICO on one Render service

Two dashboards, one process, one Render slot. Host-based routing decides which frontend is served; both APIs are always mounted.

| Hostname | App |
|---|---|
| `magico.enterdungeon.cc` (anything starting with `magico`) | **MAGICO** — Orlando Magic HQ |
| everything else (incl. `cupio.enterdungeon.cc` and the `*.onrender.com` URL) | **CUPIO** — World Cup 26 (default, so nothing about the current deployment changes) |

Path escape hatches also exist from any hostname: `/magico/` and `/cupio/`.

## Routes

| Route | App | Notes |
|---|---|---|
| `/api/matches` | CUPIO | football-data.org (optional `FOOTBALL_DATA_TOKEN`) → FIFA fallback |
| `/api/health` | CUPIO | cache age |
| `/api/magic` | MAGICO | ESPN public NBA API — **keyless** |
| `/healthz` | MAGICO | liveness |

Each API module keeps its own independent cache (60s live / 5 min idle / stale-serve on failure). CUPIO's code is extracted unchanged from wc26-dashboard v2.3.1; MAGICO's from magico-dashboard v1.0.0.

## Deploying over the existing cupio service

1. **Replace the repo contents** with this package (same conventions: `server.js`, `apps/`, `public/`). Render redeploys on push. Build `npm install`, start `npm start` — unchanged.
2. `FOOTBALL_DATA_TOKEN` already set on the service carries over. MAGICO needs no env vars.
3. **Render → the service → Settings → Custom Domains → Add** `magico.enterdungeon.cc`.
4. **Cloudflare DNS**: add a `CNAME` for `magico` pointing to the service's `*.onrender.com` hostname (same target as the existing `cupio` record). Proxied is fine.
5. Hit `magico.enterdungeon.cc` — Magic dashboard. `cupio.enterdungeon.cc` — untouched.

## Local test

```bash
npm install && npm start
# cupio:   http://localhost:3000
# magico:  http://magico.localhost:3000   (browsers resolve *.localhost to 127.0.0.1)
```

## Adding a third dashboard later

Drop a router in `apps/`, a frontend in `public/<name>/`, add one line in `server.js`'s host check + a `require`. Same slot, no new service.

Unofficial fan dashboards — not affiliated with FIFA, the NBA, or the Orlando Magic.
