// Prüft die Wegpunkte einer Karte: Graph zusammenhängend, jede Verbindung in beide Richtungen
// mit der echten Bewegung begehbar. Aufruf: node tools/wege.mjs [Karte]   (Standard: Testkarte)

import { readFileSync } from 'node:fs';
import { TICK_RATE } from '../src/config.js';
import { createWorld } from '../src/game/world.js';
import { walk as walkLine } from './lauf.mjs';
import { createNav, nearestNode } from '../src/game/nav.js';

const mapName = process.argv[2] ?? 'testkarte';
const map = JSON.parse(readFileSync(new URL(`../src/maps/${mapName}.json`, import.meta.url)));
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

const walk = (from, to) => walkLine(world, from, to);

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

// Vor den Duck-Durchgängen der Testkarte: der nächste Wegpunkt darf nicht hinter der Mauer liegen (aufrecht kommt man nicht durch)
const nav = createNav(map.waypoints, world);
for (const [z, side] of mapName === 'testkarte' ? [[-8.2, -1], [8.2, 1]] : []) {
  const n = nearestNode(nav, { x: 0, y: 0, z });
  const ok = Math.sign(n.z - 7.25 * side) === side || Math.abs(n.z) > 7.5;
  console.log(`${ok ? 'ok  ' : 'FEHL'} vor dem Duck-Durchgang bei z ${z}: nächster Wegpunkt auf derselben Seite — (${n.x}, ${n.z})`);
  if (!ok) failed++;
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
