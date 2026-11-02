// Prüft den Fallschaden: aus 3,2 m (ein Stockwerk) nichts, aus 6,4 m etwa 35, aus 9,6 m etwa 73, aus 15 m tot.
// Aufruf: npm test

import { readFileSync } from 'node:fs';
import { createGame, stepGame } from '../src/game/game.js';
import { emptyCommand } from '../src/game/player.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));
let failed = 0;

function drop(height) {
  const g = createGame(map, { mode: 'schiessstand', seed: 1 });
  const p = g.player;
  let cause = null;
  for (let i = 0; i < 30; i++) stepGame(g, emptyCommand());
  p.pos.x = 0; p.pos.z = 12; p.pos.y = height;
  p.vel.y = 0; p.onGround = false;
  for (let i = 0; i < 300 && p.alive && !(p.onGround && i > 5); i++) {
    for (const e of stepGame(g, emptyCommand())) if (e.type === 'kill') cause = e.cause;
  }
  return { health: p.health, alive: p.alive, cause };
}

for (const [height, lo, hi] of [[1.2, 100, 100], [3.2, 100, 100], [6.4, 60, 70], [9.6, 22, 32]]) {
  const r = drop(height);
  const ok = r.alive && r.health >= lo && r.health <= hi;
  console.log(`${ok ? 'ok  ' : 'FEHL'} Sturz aus ${height} m: ${r.health} Leben übrig (erwartet ${lo}–${hi})`);
  if (!ok) failed++;
}
const r = drop(15);
const ok = !r.alive && r.cause === 'fall';
console.log(`${ok ? 'ok  ' : 'FEHL'} Sturz aus 15 m ist tödlich, Ursache „abgestürzt“`);
if (!ok) failed++;

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
