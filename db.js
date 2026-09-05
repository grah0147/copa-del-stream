// db.js — SQLite database layer (schema + seed data)
// Uses better-sqlite3: a real on-disk SQL database, file lives at data/copa.db
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const db = new Database(path.join(DATA_DIR, 'copa.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pitch_image TEXT NOT NULL DEFAULT 'forlineup.png',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 70,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK (status IN ('upcoming','result')),
  date_label TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS standings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  p INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 0,
  d INTEGER NOT NULL DEFAULT 0,
  l INTEGER NOT NULL DEFAULT 0,
  pts INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  team_name TEXT NOT NULL,
  mp INTEGER NOT NULL DEFAULT 0,
  g INTEGER NOT NULL DEFAULT 0,
  a INTEGER NOT NULL DEFAULT 0,
  cs INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---- seed only if empty, so re-starting the server never wipes admin edits ----
const teamCount = db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
if (teamCount === 0) {
  const insertTeam = db.prepare('INSERT INTO teams (slug,name,pitch_image,sort_order) VALUES (?,?,?,?)');
  const teams = [
    ['pluto', 'Pluto FC', 'forlineup.png', 1],
    ['brazzers', 'Brazzers', 'field.png', 2],
    ['youngboys', 'Young Boys', 'field1.jpg', 3],
    ['reapers', 'Reapers', 'forlineup.png', 4],
  ];
  const teamIds = {};
  for (const [slug, name, pitch, order] of teams) {
    const info = insertTeam.run(slug, name, pitch, order);
    teamIds[slug] = info.lastInsertRowid;
  }

  const insertPlayer = db.prepare('INSERT INTO players (team_id,name,position,rating,sort_order) VALUES (?,?,?,?,?)');
  const roster = {
    pluto: [
      ['Pluto ST1', 'ST', 92], ['Pluto ST2', 'ST', 88],
      ['Pluto LM', 'LM', 85], ['Pluto CM', 'CM', 90], ['Pluto RM', 'RM', 84],
      ['Pluto LB', 'LB', 86], ['Pluto CB', 'CB', 89], ['Pluto RB', 'RB', 86],
      ['Oblak Jr', 'GK', 91],
    ],
    brazzers: [
      ['Bz Striker 1', 'ST', 88], ['Bz Striker 2', 'ST', 87],
      ['Bz Mid 1', 'LM', 84], ['Bz Playmaker', 'CAM', 86], ['Bz Mid 2', 'RM', 85],
      ['Bz Def 1', 'LB', 83], ['Bz Def 2', 'CB', 85], ['Bz Def 3', 'RB', 84],
      ['Clone GK', 'GK', 89],
    ],
    youngboys: [
      ['YB Forward 1', 'ST', 89], ['YB Forward 2', 'ST', 86],
      ['YB Winger L', 'LM', 86], ['YB Engine', 'CM', 85], ['YB Winger R', 'RM', 87],
      ['YB Wingback', 'LB', 84], ['YB Wall', 'CB', 86], ['YB Guard', 'RB', 83],
      ['YB Keeper', 'GK', 88],
    ],
    reapers: [
      ['Grim Reaper', 'ST', 91], ['Soul Taker', 'ST', 85],
      ['Shadow LM', 'LM', 83], ['Phantom CM', 'CM', 88], ['Ghost RM', 'RM', 84],
      ['Reap Def 1', 'LB', 85], ['Reap Def 2', 'CB', 87], ['Reap Def 3', 'RB', 85],
      ['The Gate', 'GK', 90],
    ],
  };
  for (const slug of Object.keys(roster)) {
    roster[slug].forEach(([name, position, rating], i) => {
      insertPlayer.run(teamIds[slug], name, position, rating, i);
    });
  }

  const insertFixture = db.prepare('INSERT INTO fixtures (status,date_label,home_team,away_team,home_score,away_score,sort_order) VALUES (?,?,?,?,?,?,?)');
  insertFixture.run('upcoming', 'Saturday · April 25', 'Young Boys', 'Pluto', null, null, 1);
  insertFixture.run('upcoming', 'Saturday · April 25', 'Reapers', 'Brazzers', null, null, 2);
  insertFixture.run('result', 'Wednesday · April 22', 'Pluto', 'Reapers', 3, 1, 1);
  insertFixture.run('result', 'Wednesday · April 22', 'Brazzers', 'Young Boys', 0, 2, 2);

  const insertStanding = db.prepare('INSERT INTO standings (team_name,p,w,d,l,pts,sort_order) VALUES (?,?,?,?,?,?,?)');
  insertStanding.run('Pluto', 2, 2, 0, 0, 6, 1);
  insertStanding.run('Reapers', 2, 1, 0, 1, 3, 2);
  insertStanding.run('Young Boys', 2, 1, 0, 1, 3, 3);
  insertStanding.run('Brazzers', 2, 0, 0, 2, 0, 4);

  const insertStat = db.prepare('INSERT INTO stats (player_name,team_name,mp,g,a,cs,sort_order) VALUES (?,?,?,?,?,?,?)');
  insertStat.run('Player Name', 'Pluto', 12, 8, 4, 0, 1);
  insertStat.run('Jan Oblak Clone', 'Brazzers', 12, 0, 0, 5, 2);
  insertStat.run('Striker Elite', 'Young Boys', 11, 5, 2, 0, 3);
  insertStat.run('Midfield Maestro', 'Reapers', 12, 2, 6, 1, 4);

  const insertContent = db.prepare('INSERT INTO content (key,value) VALUES (?,?)');
  insertContent.run('home_eyebrow', 'S4 Only · Qatar');
  insertContent.run('home_title', 'King Of Da Stream');
  insertContent.run('home_intro', "Copa DeL Stream is a league among S4 students (and only) taking place in the wonderful stadium QATAR.");
  insertContent.run('home_body', "This is where Pluto, Brazzers, Young Boys, and Reapers battle for the crown of King Of Da Stream.");
  insertContent.run('home_totw', "Pluto's front two carried matchday 3 — catch the full lineup breakdown under Lineups.");
}

module.exports = db;
