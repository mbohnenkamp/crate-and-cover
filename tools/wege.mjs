// Prüft die Wegpunkte der Testkarte: Graph zusammenhängend, jede Verbindung in beide Richtungen
// mit der echten Bewegung begehbar. Aufruf: npm test

import { readFileSync } from 'node:fs';
import { TICK_RATE } from '../src/config.js';
import { createWorld } from '../src/game/world.js';
import { createPlayer, stepPlayer, emptyCommand } from '../src/game/player.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));
const world = createWorld(map);
const { nodes, links } = map.waypoints;
const dt = 1 / TICK_RATE;
let failed = 0;

const adj = nodes.map(() => []);
for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
const seen = new Set([0]);
const queue = [0];
while (queue.length) for (const n of adj[queue.shift()]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
console.log(`${seen.size === nodes.length ? 'ok  ' : 'FEHL'} alle ${nodes.length} Wegpunkte verbunden${seen.size < nodes.length ? ` — nur ${seen.size}` : ''}`);
if (seen.size < nodes.length) failed++;

function walk(from, to) {
  const p = createPlayer({ pos: from });
  for (let i = 0; i < 20; i++) stepPlayer(p, emptyCommand(), world, dt);
  const limit = (Math.hypot(to[0] - from[0], to[2] - from[2]) / 5 + 2) * TICK_RATE;
  for (let i = 0; i < limit; i++) {
    const dx = to[0] - p.pos.x;
    const dz = to[2] - p.pos.z;
    if (Math.hypot(dx, dz) < 0.6 && Math.abs(to[1] - p.pos.y) < 1.5) return true;
    stepPlayer(p, { ...emptyCommand(), forward: 1, yaw: Math.atan2(-dx, -dz) }, world, dt);
  }
  return false;
}

let bad = 0;
for (const [a, b] of links) {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!walk(nodes[x], nodes[y])) {
      bad++;
      console.log(`FEHL Weg ${x} ${JSON.stringify(nodes[x])} → ${y} ${JSON.stringify(nodes[y])} nicht begehbar`);
    }
  }
}
console.log(`${bad ? 'FEHL' : 'ok  '} ${links.length * 2 - bad} von ${links.length * 2} Wegen begehbar`);
failed += bad ? 1 : 0;

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
