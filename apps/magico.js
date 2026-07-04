/* MAGICO api module — Orlando Magic via ESPN public API (keyless) */
const express = require('express');

const router = express.Router();

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const TEAM = 'orl';

const TTL_LIVE = 60 * 1000;       // refresh every 60s while the Magic are playing
const TTL_IDLE = 5 * 60 * 1000;   // every 5 min otherwise
const TTL_ERROR = 45 * 1000;      // brief backoff after provider errors

const cache = { at: 0, ttl: TTL_IDLE, payload: null };

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'magico-dashboard/1.0' } });
  if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
  return r.json();
}

/* ---------------- normalizers ---------------- */

function normTeam(j) {
  const t = j.team || {};
  const rec = ((t.record || {}).items || []).find(x => x.type === 'total') || {};
  const stats = {};
  (rec.stats || []).forEach(s => { stats[s.name] = s.value; });
  return {
    name: t.displayName || 'Orlando Magic',
    abbrev: t.abbreviation || 'ORL',
    record: rec.summary || null,                 // e.g. "45-37"
    standing: t.standingSummary || null,          // e.g. "8th in Eastern Conference"
    wins: stats.wins != null ? stats.wins : null,
    losses: stats.losses != null ? stats.losses : null,
    logo: (t.logos && t.logos[0] && t.logos[0].href) || null,
    nextEvent: (j.team && j.team.nextEvent && j.team.nextEvent[0])
      ? normEvent(j.team.nextEvent[0]) : null
  };
}

function normEvent(e) {
  const comp = (e.competitions && e.competitions[0]) || {};
  const cs = comp.competitors || [];
  const home = cs.find(c => c.homeAway === 'home') || {};
  const away = cs.find(c => c.homeAway === 'away') || {};
  const st = (comp.status && comp.status.type) || (e.status && e.status.type) || {};
  const side = c => ({
    name: (c.team && (c.team.shortDisplayName || c.team.displayName)) || '',
    abbrev: (c.team && c.team.abbreviation) || '',
    logo: (c.team && (c.team.logo || (c.team.logos && c.team.logos[0] && c.team.logos[0].href))) || null,
    score: c.score != null ? Number(c.score.value != null ? c.score.value : c.score) : null,
    winner: c.winner === true,
    record: Array.isArray(c.records) && c.records[0] ? c.records[0].summary : null
  });
  return {
    id: e.id,
    date: e.date,
    name: e.shortName || e.name || '',
    seasonType: (e.seasonType && e.seasonType.type) || (e.season && e.season.type) || null,
    status: st.state === 'in' ? 'LIVE' : st.state === 'post' ? 'FINISHED' : 'SCHEDULED',
    detail: st.shortDetail || st.detail || '',
    period: (comp.status && comp.status.period) || null,
    clock: (comp.status && comp.status.displayClock) || null,
    home: side(home),
    away: side(away),
    venue: (comp.venue && comp.venue.fullName) || '',
    broadcast: (comp.broadcasts && comp.broadcasts[0] && (comp.broadcasts[0].names || []).join('/')) || ''
  };
}

function normRoster(j) {
  const groups = j.athletes || [];
  const flat = [];
  groups.forEach(g => {
    (g.items || []).forEach(a => {
      flat.push({
        name: a.fullName || a.displayName,
        jersey: a.jersey || null,
        pos: (a.position && a.position.abbreviation) || '',
        height: a.displayHeight || '',
        weight: a.displayWeight || '',
        age: a.age || null,
        exp: a.experience && a.experience.years != null ? a.experience.years : null,
        college: (a.college && a.college.name) || '',
        injured: !!(a.injuries && a.injuries.length),
        headshot: (a.headshot && a.headshot.href) || null
      });
    });
  });
  return flat;
}

function normSchedule(j) {
  return (j.events || []).map(normEvent);
}

/* ---------------- assemble payload ---------------- */

async function build() {
  const [teamJ, rosterJ, schedJ, boardJ] = await Promise.all([
    getJson(`${BASE}/teams/${TEAM}`),
    getJson(`${BASE}/teams/${TEAM}/roster`).catch(() => null),
    getJson(`${BASE}/teams/${TEAM}/schedule`).catch(() => null),
    getJson(`${BASE}/scoreboard`).catch(() => null)
  ]);

  const team = normTeam(teamJ);
  const roster = rosterJ ? normRoster(rosterJ) : [];
  const schedule = schedJ ? normSchedule(schedJ) : [];

  // live detection: is ORL in any in-progress scoreboard game?
  let live = null;
  if (boardJ && Array.isArray(boardJ.events)) {
    for (const e of boardJ.events) {
      const ev = normEvent(e);
      const isOrl = ev.home.abbrev === 'ORL' || ev.away.abbrev === 'ORL';
      if (isOrl && ev.status === 'LIVE') { live = ev; break; }
      if (isOrl && !live) live = ev; // today's ORL game even if not tipped yet
    }
  }

  return { source: 'espn', fetchedAt: new Date().toISOString(), team, roster, schedule, live };
}

router.get('/api/magic', async (req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < cache.ttl) {
    res.set('X-Cache', 'HIT');
    return res.json(cache.payload);
  }
  try {
    const payload = await build();
    cache.payload = payload;
    cache.at = now;
    cache.ttl = payload.live && payload.live.status === 'LIVE' ? TTL_LIVE : TTL_IDLE;
    res.set('X-Cache', 'MISS');
    res.json(payload);
  } catch (err) {
    console.error('[magico] provider error:', err.message);
    cache.ttl = TTL_ERROR;
    if (cache.payload) return res.json(cache.payload); // serve stale
    res.json({ source: 'none' }); // client uses built-in snapshot
  }
});


router.get('/healthz', (req, res) => res.json({ ok: true }));

module.exports = router;
