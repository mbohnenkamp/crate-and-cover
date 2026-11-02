// Erzeugt die Wegpunkte einer Karte und schreibt sie in die Kartendatei: Punkte auf allen begehbaren
// Flächen (Boden, Containerdächer, Brücke), dazu Anfang und Ende jeder Treppe. Verbunden wird nur, was die
// echte Laufbewegung in beide Richtungen schafft. Was nicht zum größten Netz gehört, fällt weg.
// Aufruf: node tools/wegpunkte.mjs hafen

import { readFileSync, writeFileSync } from 'node:fs';
import { BODY } from '../src/config.js';
import { createWorld, overlaps } from '../src/game/world.js';
import { walk } from './lauf.mjs';

const SPACING = 4;
const INSET = 0.7;
const MAX_HEIGHT = 5.5; // höher liegen nur Dach, Kran und Mauerkronen
const LINK = 5.8;

const name = process.argv[2];
const file = new URL(`../src/maps/${name}.json`, import.meta.url);
const map = JSON.parse(readFileSync(file));
const world = createWorld(map);

const hw = BODY.halfWidth;
const fits = (x, y, z) => !overlaps(world, x - hw, y + 0.02, z - hw, x + hw, y + BODY.standHeight, z + hw);
const supported = (x, y, z) => overlaps(world, x - 0.05, y - 0.1, z - 0.05, x + 0.05, y - 0.01, z + 0.05);

// Gleichmäßig über eine Strecke verteilt, mindestens ein Punkt in der Mitte
function spread(lo, hi) {
  const len = hi - lo;
  if (len < 0) return [];
  const n = Math.max(1, Math.round(len / SPACING) + 1);
  return n === 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + (len * i) / (n - 1));
}

// Neuer Punkt oder der schon vorhandene in der Nähe; null, wenn dort niemand stehen kann
const nodes = [];
const add = (x, y, z) => {
  x = +x.toFixed(2); y = +y.toFixed(3); z = +z.toFixed(2);
  if (!fits(x, y, z) || !supported(x, y, z)) return null;
  const near = nodes.findIndex(n => Math.hypot(n[0] - x, n[2] - z) < 1.5 && Math.abs(n[1] - y) < 0.5);
  if (near >= 0) return near;
  nodes.push([x, y, z]);
  return nodes.length - 1;
};

// Rasterpunkt; ist er verbaut (Regal, Kiste), wird ein freier Platz bis 1,6 m daneben gesucht
const JITTER = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]];
for (const b of world.boxes) {
  if (b.type === 'treppe' || b.max[1] > MAX_HEIGHT) continue;
  for (const x of spread(b.min[0] + INSET, b.max[0] - INSET)) {
    for (const z of spread(b.min[2] + INSET, b.max[2] - INSET)) {
      for (const [dx, dz] of JITTER) {
        const px = Math.min(b.max[0] - INSET, Math.max(b.min[0] + INSET, x + dx));
        const pz = Math.min(b.max[2] - INSET, Math.max(b.min[2] + INSET, z + dz));
        if (add(px, b.max[1], pz) !== null) break;
      }
    }
  }
}

// Treppen: unten vor der ersten Stufe, oben auf der letzten
const stairEnds = [];
for (const t of map.stairs ?? []) {
  const axis = t.dir[1] === 'x' ? 0 : 2;
  const sign = t.dir[0] === '-' ? -1 : 1;
  const bottom = [...t.start];
  bottom[axis] -= sign * 0.6;
  const top = [...t.start];
  top[axis] += sign * (t.steps - 0.5) * t.depth;
  top[1] += t.steps * t.rise;
  stairEnds.push([add(...bottom), add(...top)].filter(i => i !== null));
}

// Verbinden: nahe Punkte auf gleicher Höhe, Treppenenden untereinander
const links = [];
const tried = new Set();
function tryLink(a, b) {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  if (tried.has(key)) return;
  tried.add(key);
  if (walk(world, nodes[a], nodes[b]) && walk(world, nodes[b], nodes[a])) links.push([Math.min(a, b), Math.max(a, b)]);
}
for (let a = 0; a < nodes.length; a++) {
  for (let b = a + 1; b < nodes.length; b++) {
    const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][2] - nodes[b][2]);
    if (d <= LINK && Math.abs(nodes[a][1] - nodes[b][1]) < 0.5) tryLink(a, b);
  }
}
for (const ends of stairEnds) if (ends.length === 2) tryLink(...ends);
// Treppenenden auch mit Punkten in der Nähe auf ihrer Höhe (Treppe endet auf schmalem Dach)
for (const ends of stairEnds) {
  for (const a of ends) {
    for (let b = 0; b < nodes.length; b++) {
      if (b === a) continue;
      const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][2] - nodes[b][2]);
      if (d <= LINK + 1 && Math.abs(nodes[a][1] - nodes[b][1]) < 0.7) tryLink(a, b);
    }
  }
}

// Größtes zusammenhängendes Netz behalten
const adj = nodes.map(() => []);
for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
const seen = new Array(nodes.length).fill(-1);
let best = -1;
let bestSize = 0;
for (let i = 0; i < nodes.length; i++) {
  if (seen[i] >= 0) continue;
  const queue = [i];
  seen[i] = i;
  let size = 0;
  while (queue.length) {
    const n = queue.shift();
    size++;
    for (const m of adj[n]) if (seen[m] < 0) { seen[m] = i; queue.push(m); }
  }
  if (size > bestSize) { bestSize = size; best = i; }
}
const keep = nodes.map((_, i) => seen[i] === best);
const newId = [];
const kept = [];
nodes.forEach((n, i) => { if (keep[i]) { newId[i] = kept.length; kept.push(n); } });
const keptLinks = links.filter(([a, b]) => keep[a] && keep[b]).map(([a, b]) => [newId[a], newId[b]]);

const dropped = nodes.filter((_, i) => !keep[i]);
map.waypoints = { nodes: kept, links: keptLinks };
writeFileSync(file, JSON.stringify(map, null, 1));
const levels = {};
for (const n of kept) levels[n[1]] = (levels[n[1]] ?? 0) + 1;
console.log(`${name}: ${kept.length} Wegpunkte, ${keptLinks.length} Verbindungen, Höhen ${JSON.stringify(levels)}`);
if (dropped.length) console.log(`nicht erreichbar, entfernt: ${dropped.map(n => `(${n.join(', ')})`).join(' ')}`);
