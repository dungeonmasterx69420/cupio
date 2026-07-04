/* CUPIO api module — FIFA World Cup 26 (extracted unchanged from wc26-dashboard v2.3.1) */
const express = require('express');

const router = express.Router();
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';

const TTL_LIVE = 60 * 1000;       // refresh every 60s while a match is live
const TTL_IDLE = 5 * 60 * 1000;   // every 5 min otherwise
const TTL_ERROR = 45 * 1000;      // brief backoff after provider errors

const cache = { at: 0, ttl: TTL_IDLE, payload: null };

/* ---------------- provider: football-data.org ---------------- */
async function fromFootballData() {
  if (!FD_TOKEN) throw new Error('no FOOTBALL_DATA_TOKEN set');
  const r = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
    headers: { 'X-Auth-Token': FD_TOKEN }
  });
  if (!r.ok) throw new Error('football-data HTTP ' + r.status);
  const j = await r.json();
  const matches = (j.matches || []).map(m => ({
    date: m.utcDate,
    stage: m.stage || '',
    status:
      m.status === 'IN_PLAY' || m.status === 'PAUSED' ? 'LIVE'
      : m.status === 'FINISHED' ? 'FINISHED'
      : 'SCHEDULED',
    minute: m.minute != null ? String(m.minute) : null,
    home: {
      name: (m.homeTeam && m.homeTeam.name) || '',
      score: m.score && m.score.fullTime ? m.score.fullTime.home : null,
      pens: m.score && m.score.penalties ? m.score.penalties.home : null
    },
    away: {
      name: (m.awayTeam && m.awayTeam.name) || '',
      score: m.score && m.score.fullTime ? m.score.fullTime.away : null,
      pens: m.score && m.score.penalties ? m.score.penalties.away : null
    },
    venue: m.venue || '',
    duration: (m.score && m.score.duration) || 'REGULAR'
  }));
  return { source: 'football-data.org', matches };
}

/* ---------------- provider: FIFA public API ---------------- */
let fifaSeasonId = null; // discovered once, reused

async function fifaSeason() {
  if (fifaSeasonId) return fifaSeasonId;
  const r = await fetch('https://api.fifa.com/api/v3/seasons?idCompetition=17&language=en');
  if (!r.ok) throw new Error('fifa seasons HTTP ' + r.status);
  const j = await r.json();
  const seasons = (j.Results || []).sort(
    (a, b) => new Date(b.StartDate || 0) - new Date(a.StartDate || 0)
  );
  if (!seasons.length) throw new Error('fifa: no seasons returned');
  fifaSeasonId = seasons[0].IdSeason;
  return fifaSeasonId;
}

function fifaText(x) {
  // FIFA wraps strings as [{Locale, Description}]
  if (Array.isArray(x) && x.length) return x[0].Description || '';
  return typeof x === 'string' ? x : '';
}

async function fromFifa() {
  const season = await fifaSeason();
  const r = await fetch(
    `https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=${season}&count=500&language=en`
  );
  if (!r.ok) throw new Error('fifa matches HTTP ' + r.status);
  const j = await r.json();
  const matches = (j.Results || [])
    .filter(m => m.Home && m.Away)
    .map(m => ({
      date: m.Date,
      stage: fifaText(m.StageName),
      // FIFA MatchStatus: 0 = finished, 3 = live, everything else = upcoming
      status: m.MatchStatus === 3 ? 'LIVE' : m.MatchStatus === 0 ? 'FINISHED' : 'SCHEDULED',
      minute: m.MatchTime || null,
      home: {
        name: fifaText(m.Home.TeamName) || m.Home.ShortClubName || '',
        score: m.Home.Score ?? null,
        pens: m.HomeTeamPenaltyScore ?? null
      },
      away: {
        name: fifaText(m.Away.TeamName) || m.Away.ShortClubName || '',
        score: m.Away.Score ?? null,
        pens: m.AwayTeamPenaltyScore ?? null
      },
      venue: m.Stadium ? fifaText(m.Stadium.Name) : '',
      duration: 'REGULAR'
    }));
  if (!matches.length) throw new Error('fifa: empty match list');
  return { source: 'api.fifa.com', matches };
}

/* ---------------- cached fetch ---------------- */
async function getMatches() {
  const now = Date.now();
  if (cache.payload && now - cache.at < cache.ttl) return cache.payload;

  const errors = [];
  for (const provider of [fromFootballData, fromFifa]) {
    try {
      const data = await provider();
      const anyLive = data.matches.some(m => m.status === 'LIVE');
      cache.payload = { ...data, fetchedAt: new Date().toISOString() };
      cache.at = now;
      cache.ttl = anyLive ? TTL_LIVE : TTL_IDLE;
      return cache.payload;
    } catch (e) {
      errors.push(e.message);
    }
  }

  // both providers failed — serve stale data if we have it
  if (cache.payload) {
    cache.at = now;
    cache.ttl = TTL_ERROR;
    return { ...cache.payload, stale: true, errors };
  }
  cache.at = now;
  cache.ttl = TTL_ERROR;
  return { source: 'none', matches: [], errors, fetchedAt: new Date().toISOString() };
}

/* ---------------- routes ---------------- */
router.get('/api/matches', async (_req, res) => {
  try {
    res.json(await getMatches());
  } catch (e) {
    res.json({ source: 'none', matches: [], errors: [e.message] });
  }
});

router.get('/api/health', (_req, res) =>
  res.json({ ok: true, cacheAgeMs: cache.payload ? Date.now() - cache.at : null })
);


module.exports = router;
