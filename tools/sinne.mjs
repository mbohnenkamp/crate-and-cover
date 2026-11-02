// Prüft Schritte und Hören: Laufen ist hörbar, Schleichen und Ducken nicht; Bots drehen sich zu hörbaren
// Schritten hinter ihnen um, zu schleichenden nicht. Aufruf: npm test

import { readFileSync } from 'node:fs';
import { TICK_RATE } from '../src/config.js';
import { createGame, stepGame } from '../src/game/game.js';
import { emptyCommand } from '../src/game/player.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));
let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

function steps(cmd) {
  const g = createGame(map, { mode: 'schiessstand', seed: 1 });
  const p = g.player;
  p.pos = { x: -15, y: 0, z: 12 };
  let n = 0;
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    n += stepGame(g, { ...emptyCommand(), yaw: -Math.PI / 2, forward: 1, ...cmd }).filter(e => e.type === 'step').length;
  }
  return n;
}

const run = steps({});
check('Laufen macht Schritte', run >= 3, `${run} in 2 s`);
check('Schleichen ist leise', steps({ walk: true }) === 0);
check('geduckt ist leise', steps({ crouch: true }) === 0);

{
  const g = createGame(map, { mode: 'schiessstand', seed: 1 });
  let lands = 0;
  for (let i = 0; i < 90; i++) lands += stepGame(g, { ...emptyCommand(), yaw: 0, jump: i < 2 }).filter(e => e.type === 'land').length;
  check('Landung nach Sprung ist hörbar', lands === 1, `${lands}`);
}

// Ein Bot aus Team B steht mit dem Rücken zum Spieler; der Spieler läuft bzw. schleicht seitlich 8–9 m hinter ihm
function botNotices(cmd) {
  const g = createGame(map, { difficulty: 'mittel', seed: 3 });
  const me = g.player;
  const bot = g.players.find(p => p.team === 'B');
  for (const p of g.players) if (p !== me && p !== bot) { p.alive = false; p.deadTime = -1e9; }
  bot.pos = { x: 0, y: 0, z: 2 };
  bot.yaw = 0; // schaut nach −Z, der Spieler kommt von +Z
  bot.brain.reset = false;
  bot.brain.yaw = 0;
  bot.brain.path = [{ x: 0, y: 0, z: 2 }];
  me.pos = { x: 0, y: 0, z: 10.5 };
  me.pos = { x: -5, y: 0, z: 10.5 };
  let noticed = false;
  let stepCount = 0;
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    stepCount += stepGame(g, { ...emptyCommand(), yaw: 0, right: 1, ...cmd }).filter(e => e.type === 'step' && e.player === me.id).length;
    if (bot.brain.lastSeen && g.time - bot.brain.lastSeenAt < 0.5) noticed = true;
  }
  return { noticed, stepCount };
}

const loud = botNotices({});
const quiet = botNotices({ walk: true });
check('Bot hört laufenden Spieler hinter sich', loud.noticed, `${loud.stepCount} Schritte`);
check('Bot hört schleichenden Spieler nicht', !quiet.noticed, `${quiet.stepCount} Schritte`);

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
