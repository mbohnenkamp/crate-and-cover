// Testspieler: ganze Partien nur mit Bots, ohne Grafik. Misst Abschüsse, Dauer, Waffen, Kopftreffer,
// Festhängen, Pausen ohne Abschuss. Aufruf: node tools/partie.mjs [Seeds]   (npm test nutzt 2 Seeds)

import { readFileSync } from 'node:fs';
import { WEAPONS, MATCH } from '../src/config.js';
import { createGame, stepGame } from '../src/game/game.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));
const seeds = Number(process.argv[2] ?? 2);
let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

function play(options) {
  const g = createGame(map, { humans: 0, killGoal: 50, timeLimit: 10, ...options });
  const weaponKills = {};
  let heads = 0;
  let kills = 0;
  let falls = 0;
  let lastKill = 0;
  let longestGap = 0;
  let bad = null;
  const started = performance.now();
  while (g.state === 'running') {
    for (const e of stepGame(g, null)) {
      if (e.type !== 'kill') continue;
      if (e.killer === null) { falls++; continue; }
      kills++;
      if (e.head) heads++;
      weaponKills[e.weapon] = (weaponKills[e.weapon] ?? 0) + 1;
      longestGap = Math.max(longestGap, g.time - lastKill);
      lastKill = g.time;
    }
    for (const p of g.players) {
      if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.yaw + p.pitch)) bad ??= `${p.name} ungültige Position`;
    }
  }
  longestGap = Math.max(longestGap, g.time - lastKill);
  return {
    g, kills, heads, falls, weaponKills, longestGap, bad,
    stuck: g.players.reduce((s, p) => s + (p.stuckCount ?? 0), 0),
    ms: performance.now() - started,
  };
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

console.log(`Gleich starke Teams, Ziel 50 Abschüsse oder 10 Minuten, ${seeds} Seeds je Stufe:`);
for (const difficulty of ['leicht', 'mittel', 'schwer']) {
  for (let seed = 1; seed <= seeds; seed++) {
    const r = play({ difficulty, seed });
    const wk = Object.entries(r.weaponKills).map(([w, n]) => `${WEAPONS[w].name} ${n}`).join(', ');
    console.log(`  ${difficulty.padEnd(6)} Seed ${seed}: ${r.g.score.A}:${r.g.score.B} nach ${fmt(r.g.time)} · Kopf ${Math.round(100 * r.heads / Math.max(1, r.kills))} % · ${wk} · längste Pause ${r.longestGap.toFixed(0)} s · festgehangen ${r.stuck}× · gefallen ${r.falls} · ${(r.ms / 1000).toFixed(1)} s Rechenzeit`);
    check(`${difficulty} Seed ${seed}: Partie läuft sauber`, !r.bad && r.falls === 0 && r.kills > 0, r.bad ?? '');
    check(`${difficulty} Seed ${seed}: keine Pause über 60 s ohne Abschuss`, r.longestGap < 60, `${r.longestGap.toFixed(0)} s`);
  }
}

console.log('\nUngleiche Teams (A gegen B), sollte A klar gewinnen:');
for (const [a, b] of [['schwer', 'leicht'], ['mittel', 'leicht'], ['schwer', 'mittel']]) {
  let winsA = 0;
  const scores = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const r = play({ difficultyA: a, difficultyB: b, seed });
    scores.push(`${r.g.score.A}:${r.g.score.B}`);
    if (r.g.winner === 'A') winsA++;
  }
  check(`${BOTSNAME(a)} gegen ${BOTSNAME(b)} gewinnt`, winsA === seeds, scores.join(', '));
}

function BOTSNAME(d) { return d[0].toUpperCase() + d.slice(1); }

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
