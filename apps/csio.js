/* ================================================================
   CSIO api module — Counter-Strike 2, tier 1
   Provider: PandaScore (free key → PANDASCORE_TOKEN)
     /csgo/matches/running | upcoming | past
   Filtering:
     - keep matches whose serie/tournament tier is S or A  (CS_TIERS)
     - ALWAYS keep BC.Game matches regardless of tier      (CS_TEAM_REGEX)
       — that's the s1mple tracker, and BCG live in qualifier land
   If the provider fails or no token is set, returns { source:'none' }
   and the client falls back to its built-in snapshot.
================================================================ */
const express = require('express');
const router = express.Router();

const PS_TOKEN = process.env.PANDASCORE_TOKEN || '';
const TIERS = (process.env.CS_TIERS || 's,a').toLowerCase().split(',').map(s => s.trim());
const TEAM_RE = new RegExp(process.env.CS_TEAM_REGEX || 'bc[\\.\\s]?game', 'i');

const TTL_LIVE = 60 * 1000;
const TTL_IDLE = 5 * 60 * 1000;
const TTL_ERROR = 45 * 1000;
const cache = { at: 0, ttl: TTL_IDLE, payload: null };

async function ps(pathq) {
  const r = await fetch('https://api.pandascore.co' + pathq, {
    headers: { Authorization: 'Bearer ' + PS_TOKEN, Accept: 'application/json' }
  });
  if (!r.ok) throw new Error('pandascore ' + pathq.split('?')[0] + ' HTTP ' + r.status);
  return r.json();
}

function normMatch(m) {
  const teams = (m.opponents || []).map(o => {
    const t = o.opponent || {};
    const res = (m.results || []).find(r => r.team_id === t.id);
    return {
      name: t.name || 'TBD',
      acronym: t.acronym || '',
      logo: t.image_url || null,
      score: res ? res.score : null
    };
  });
  while (teams.length < 2) teams.push({ name: 'TBD', acronym: '', logo: null, score: null });

  const streams = m.streams_list || [];
  const main = streams.find(s => s.main && s.language === 'en')
            || streams.find(s => s.language === 'en')
            || streams.find(s => s.main)
            || streams[0];

  const tier = ((m.serie && m.serie.tier) || (m.tournament && m.tournament.tier) || '').toLowerCase();
  const league = (m.league && m.league.name) || '';
  const serie = (m.serie && (m.serie.full_name || m.serie.name)) || '';
  const stage = (m.tournament && m.tournament.name) || '';

  return {
    id: m.id,
    begin_at: m.begin_at || m.scheduled_at,
    status: m.status === 'running' ? 'LIVE' : m.status === 'finished' ? 'FINISHED' : 'SCHEDULED',
    bo: m.number_of_games || null,
    event: [league, serie].filter(Boolean).join(' ').trim() || league || serie || 'CS2',
    stage,
    tier,
    teams,
    stream: main ? main.raw_url : null
  };
}

const isBcg = m => m.teams.some(t => TEAM_RE.test(t.name) || TEAM_RE.test(t.acronym));
const keep = m => isBcg(m) || TIERS.includes(m.tier);

async function build() {
  if (!PS_TOKEN) throw new Error('no PANDASCORE_TOKEN set');
  const [running, upcoming, past] = await Promise.all([
    ps('/csgo/matches/running?per_page=50'),
    ps('/csgo/matches/upcoming?per_page=100&sort=begin_at'),
    ps('/csgo/matches/past?per_page=50&sort=-end_at')
  ]);

  const live = running.map(normMatch).filter(keep);
  const next = upcoming.map(normMatch).filter(keep).slice(0, 40);
  const results = past.map(normMatch).filter(keep).slice(0, 20);

  // s1mple / BC.Game tracker — searched across ALL fetched matches (pre tier filter)
  const all = [...running, ...upcoming, ...past].map(normMatch);
  const bcg = all.filter(isBcg);
  const s1mple = {
    live: bcg.find(m => m.status === 'LIVE') || null,
    next: bcg.filter(m => m.status === 'SCHEDULED')
             .sort((a, b) => new Date(a.begin_at) - new Date(b.begin_at))[0] || null,
    recent: bcg.filter(m => m.status === 'FINISHED')
               .sort((a, b) => new Date(b.begin_at) - new Date(a.begin_at)).slice(0, 3)
  };

  return { source: 'pandascore', fetchedAt: new Date().toISOString(), live, upcoming: next, results, s1mple };
}

router.get('/api/cs', async (req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < cache.ttl) {
    res.set('X-Cache', 'HIT');
    return res.json(cache.payload);
  }
  try {
    const payload = await build();
    cache.payload = payload;
    cache.at = now;
    cache.ttl = payload.live.length || payload.s1mple.live ? TTL_LIVE : TTL_IDLE;
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.error('[csio] provider error:', err.message);
    cache.ttl = TTL_ERROR;
    cache.at = now;
    if (cache.payload) return res.json({ ...cache.payload, stale: true });
    res.json({ source: 'none' });
  }
});

router.get('/api/cs/health', (req, res) =>
  res.json({ ok: true, provider: PS_TOKEN ? 'pandascore' : 'none (set PANDASCORE_TOKEN)', cacheAgeMs: cache.payload ? Date.now() - cache.at : null })
);

module.exports = router;
