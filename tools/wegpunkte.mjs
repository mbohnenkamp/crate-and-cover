// Erzeugt die Wegpunkte einer Karte und schreibt sie in die Kartendatei (Logik in src/game/wegpunkte.js).
// Aufruf: node tools/wegpunkte.mjs hafen

import { readFileSync, writeFileSync } from 'node:fs';
import { buildWaypoints } from '../src/game/wegpunkte.js';

const name = process.argv[2];
const file = new URL(`../src/maps/${name}.json`, import.meta.url);
const map = JSON.parse(readFileSync(file));
const { nodes, links, dropped } = buildWaypoints(map);
map.waypoints = { nodes, links };
writeFileSync(file, JSON.stringify(map, null, 1));
const levels = {};
for (const n of nodes) levels[n[1]] = (levels[n[1]] ?? 0) + 1;
console.log(`${name}: ${nodes.length} Wegpunkte, ${links.length} Verbindungen, Höhen ${JSON.stringify(levels)}`);
if (dropped.length) console.log(`nicht erreichbar, entfernt: ${dropped.map(n => `(${n.join(', ')})`).join(' ')}`);
