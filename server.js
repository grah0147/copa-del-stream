// server.js — Copa DeL Stream backend
// Express API + static file server for both frontends (public site + admin editor).
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { tierForRating, TIER_IMAGE } = require('./tiers');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'firststreamprom';
const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE || 'letmoiin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ---------------------------------------------------------------------------
// Auth: simple bearer-token sessions kept in memory (fine for a small hobby
// site with one admin). Restarting the server logs everyone out.
// ---------------------------------------------------------------------------
const sessions = new Map(); // token -> expiresAt

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const expiresAt = token && sessions.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/api/auth/login', (req, res) => {
  const { password, passphrase } = req.body || {};
  if (password === ADMIN_PASSWORD && passphrase === ADMIN_PASSPHRASE) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return res.json({ token, expiresIn: SESSION_TTL_MS / 1000 });
  }
  res.status(401).json({ error: 'Incorrect password or passphrase' });
});

app.post('/api/auth/logout', requireAdmin, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Teams + Players (the grading system lives here)
// ---------------------------------------------------------------------------
function serializePlayer(p) {
  const tier = tierForRating(p.rating);
  return { ...p, tier, tierImage: TIER_IMAGE[tier] };
}

app.get('/api/teams', (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY sort_order, id').all();
  const playersStmt = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY sort_order, id');
  const withPlayers = teams.map(t => ({ ...t, players: playersStmt.all(t.id).map(serializePlayer) }));
  res.json(withPlayers);
});

app.post('/api/teams', requireAdmin, (req, res) => {
  const { slug, name, pitch_image = 'forlineup.png', sort_order = 0 } = req.body || {};
  if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
  try {
    const info = db.prepare('INSERT INTO teams (slug,name,pitch_image,sort_order) VALUES (?,?,?,?)')
      .run(slug, name, pitch_image, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/teams/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Team not found' });
  const { name, pitch_image, sort_order } = req.body || {};
  db.prepare('UPDATE teams SET name=?, pitch_image=?, sort_order=? WHERE id=?').run(
    name ?? existing.name, pitch_image ?? existing.pitch_image, sort_order ?? existing.sort_order, req.params.id
  );
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
});

app.delete('/api/teams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Players -- this is the grading system: rating in, tier out.
app.get('/api/players', (req, res) => {
  const { team } = req.query;
  let rows;
  if (team) {
    const t = db.prepare('SELECT id FROM teams WHERE slug = ?').get(team);
    if (!t) return res.status(404).json({ error: 'Unknown team' });
    rows = db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY sort_order, id').all(t.id);
  } else {
    rows = db.prepare('SELECT * FROM players ORDER BY team_id, sort_order, id').all();
  }
  res.json(rows.map(serializePlayer));
});

app.post('/api/players', requireAdmin, (req, res) => {
  const { team_id, name, position, rating, sort_order = 0 } = req.body || {};
  if (!team_id || !name || !position || rating === undefined) {
    return res.status(400).json({ error: 'team_id, name, position and rating are required' });
  }
  const info = db.prepare('INSERT INTO players (team_id,name,position,rating,sort_order) VALUES (?,?,?,?,?)')
    .run(team_id, name, position, rating, sort_order);
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializePlayer(player));
});

app.put('/api/players/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  const { name, position, rating, sort_order, team_id } = req.body || {};
  db.prepare('UPDATE players SET name=?, position=?, rating=?, sort_order=?, team_id=? WHERE id=?').run(
    name ?? existing.name,
    position ?? existing.position,
    rating ?? existing.rating,
    sort_order ?? existing.sort_order,
    team_id ?? existing.team_id,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json(serializePlayer(updated));
});

app.delete('/api/players/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
app.get('/api/fixtures', (req, res) => {
  const rows = db.prepare('SELECT * FROM fixtures ORDER BY sort_order, id').all();
  res.json({
    upcoming: rows.filter(r => r.status === 'upcoming'),
    results: rows.filter(r => r.status === 'result'),
  });
});
app.post('/api/fixtures', requireAdmin, (req, res) => {
  const { status, date_label, home_team, away_team, home_score = null, away_score = null, sort_order = 0 } = req.body || {};
  if (!status || !date_label || !home_team || !away_team) return res.status(400).json({ error: 'Missing fields' });
  const info = db.prepare('INSERT INTO fixtures (status,date_label,home_team,away_team,home_score,away_score,sort_order) VALUES (?,?,?,?,?,?,?)')
    .run(status, date_label, home_team, away_team, home_score, away_score, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM fixtures WHERE id = ?').get(info.lastInsertRowid));
});
app.put('/api/fixtures/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM fixtures WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const merged = { ...existing, ...req.body };
  db.prepare('UPDATE fixtures SET status=?,date_label=?,home_team=?,away_team=?,home_score=?,away_score=?,sort_order=? WHERE id=?')
    .run(merged.status, merged.date_label, merged.home_team, merged.away_team, merged.home_score, merged.away_score, merged.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM fixtures WHERE id = ?').get(req.params.id));
});
app.delete('/api/fixtures/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM fixtures WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------
app.get('/api/standings', (req, res) => {
  res.json(db.prepare('SELECT * FROM standings ORDER BY sort_order, id').all());
});
app.post('/api/standings', requireAdmin, (req, res) => {
  const { team_name, p = 0, w = 0, d = 0, l = 0, pts = 0, sort_order = 0 } = req.body || {};
  if (!team_name) return res.status(400).json({ error: 'team_name required' });
  const info = db.prepare('INSERT INTO standings (team_name,p,w,d,l,pts,sort_order) VALUES (?,?,?,?,?,?,?)')
    .run(team_name, p, w, d, l, pts, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM standings WHERE id = ?').get(info.lastInsertRowid));
});
app.put('/api/standings/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM standings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const m = { ...existing, ...req.body };
  db.prepare('UPDATE standings SET team_name=?,p=?,w=?,d=?,l=?,pts=?,sort_order=? WHERE id=?')
    .run(m.team_name, m.p, m.w, m.d, m.l, m.pts, m.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM standings WHERE id = ?').get(req.params.id));
});
app.delete('/api/standings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM standings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stats (top scorers table)
// ---------------------------------------------------------------------------
app.get('/api/stats', (req, res) => {
  res.json(db.prepare('SELECT * FROM stats ORDER BY sort_order, id').all());
});
app.post('/api/stats', requireAdmin, (req, res) => {
  const { player_name, team_name, mp = 0, g = 0, a = 0, cs = 0, sort_order = 0 } = req.body || {};
  if (!player_name || !team_name) return res.status(400).json({ error: 'player_name and team_name required' });
  const info = db.prepare('INSERT INTO stats (player_name,team_name,mp,g,a,cs,sort_order) VALUES (?,?,?,?,?,?,?)')
    .run(player_name, team_name, mp, g, a, cs, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM stats WHERE id = ?').get(info.lastInsertRowid));
});
app.put('/api/stats/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM stats WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const m = { ...existing, ...req.body };
  db.prepare('UPDATE stats SET player_name=?,team_name=?,mp=?,g=?,a=?,cs=?,sort_order=? WHERE id=?')
    .run(m.player_name, m.team_name, m.mp, m.g, m.a, m.cs, m.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM stats WHERE id = ?').get(req.params.id));
});
app.delete('/api/stats/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM stats WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Home page text content (key/value)
// ---------------------------------------------------------------------------
app.get('/api/content', (req, res) => {
  const rows = db.prepare('SELECT * FROM content').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});
app.put('/api/content/:key', requireAdmin, (req, res) => {
  const { value } = req.body || {};
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  db.prepare('INSERT INTO content (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(req.params.key, value);
  res.json({ key: req.params.key, value });
});

// ---------------------------------------------------------------------------
// Static frontends
// ---------------------------------------------------------------------------
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.listen(PORT, () => {
  console.log(`Copa DeL Stream backend running at http://localhost:${PORT}`);
});
