/* ================================================================
   DUNGEON DASHBOARDS — one Render service, two dashboards
   Host-based routing:
     magico.*  →  public/magico  (Orlando Magic HQ)
     anything else → public/cupio (World Cup 26 — default, so the
                     existing cupio.enterdungeon.cc and the
                     *.onrender.com URL keep working unchanged)

   API routes are global (no collisions):
     CUPIO   /api/matches   /api/health     (needs FOOTBALL_DATA_TOKEN, optional)
     MAGICO  /api/magic     /healthz        (keyless — ESPN public API)

   Local testing:
     curl -H "Host: magico.localhost" localhost:3000/
     or open http://magico.localhost:3000 (browsers resolve *.localhost)
================================================================ */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---- APIs (each module keeps its own cache + TTL logic) ---- */
app.use(require('./apps/cupio'));
app.use(require('./apps/magico'));

/* ---- host-routed static ---- */
const cupioStatic = express.static(path.join(__dirname, 'public', 'cupio'));
const magicoStatic = express.static(path.join(__dirname, 'public', 'magico'));

function isMagicoHost(req) {
  const h = (req.hostname || '').toLowerCase();
  return h.startsWith('magico');
}

app.use((req, res, next) =>
  (isMagicoHost(req) ? magicoStatic : cupioStatic)(req, res, next)
);

/* path escape hatches — reach either app from any hostname */
app.use('/magico', magicoStatic);
app.use('/cupio', cupioStatic);

app.listen(PORT, () =>
  console.log(`Dungeon dashboards on :${PORT} — cupio (default host) + magico (magico.*)`)
);
