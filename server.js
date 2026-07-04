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
app.use(require('./apps/csio'));

/* ---- host-routed static ---- */
const cupioStatic = express.static(path.join(__dirname, 'public', 'cupio'));
const magicoStatic = express.static(path.join(__dirname, 'public', 'magico'));
const csioStatic = express.static(path.join(__dirname, 'public', 'csio'));

function pickStatic(req) {
  const h = (req.hostname || '').toLowerCase();
  if (h.startsWith('magico')) return magicoStatic;
  if (h.startsWith('csio')) return csioStatic;
  return cupioStatic; // default keeps cupio.enterdungeon.cc + onrender.com unchanged
}

app.use((req, res, next) => pickStatic(req)(req, res, next));

/* path escape hatches — reach any app from any hostname */
app.use('/magico', magicoStatic);
app.use('/cupio', cupioStatic);
app.use('/csio', csioStatic);

app.listen(PORT, () =>
  console.log(`Dungeon dashboards on :${PORT} — cupio (default) + magico (magico.*) + csio (csio.*)`)
);
