// Wegpunkte einer Karte: Punkte auf allen begehbaren Flächen (Boden, Dächer, Brücken), dazu Anfang und Ende
// jeder Treppe. Verbunden wird nur, was die echte Laufbewegung in beide Richtungen schafft. Was nicht zum
// größten Netz gehört, fällt weg. Läuft in Node (tools/wegpunkte.mjs) und im Browser (Kartenbauer).

import { BODY, TICK_RATE } from '../config.js';
import { createWorld, overlaps, zoneAt } from './world.js';
import { createPlayer, stepPlayer, emptyCommand } from './player.js';

const SPACING = 4;
const INSET = 1.0;
const MAX_HEIGHT = 10; // höher liegen nur Dächer, Kran und Turmspitze
const LINK = 5.8;

// Läuft mit der echten Bewegung geradeaus von einem Punkt zum anderen
const dt = 1 / TICK_RATE;

export function walk(world, from, to) {
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

// Liefert { nodes, links, dropped }; nodes und links im Format von map.waypoints
export function buildWaypoints(map) {
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

  // Neuer Punkt oder der schon vorhandene in der Nähe; null, wenn dort niemand stehen kann.
  // Treppenenden (exact) bekommen immer einen eigenen Punkt genau in der Treppenachse.
  const nodes = [];
  const add = (x, y, z, exact = false) => {
    x = +x.toFixed(2); y = +y.toFixed(3); z = +z.toFixed(2);
    if (!fits(x, y, z) || !supported(x, y, z) || zoneAt(world, x, y, z)) return null;
    const near = nodes.findIndex(n => Math.hypot(n[0] - x, n[2] - z) < (exact ? 0.1 : 1.5) && Math.abs(n[1] - y) < 0.5);
    if (near >= 0) return near;
    nodes.push([x, y, z]);
    return nodes.length - 1;
  };

  // Vorgaben der Karte zuerst (z. B. vor und hinter Türen)
  for (const h of map.navHints ?? []) add(...h);

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
    stairEnds.push([add(...bottom, true), add(...top, true)].filter(i => i !== null));
  }

  // Verbinden: nahe Punkte auf gleicher Höhe, Treppenenden untereinander
  const links = [];
  const tried = new Set();
  // Bots schneiden Kurven: der Weg braucht rundum mehr Platz als der Körper (20 cm, an Treppen 5 cm) und
  // durchgehend Boden unter den Füßen, sonst fällt ein Bot in eine Lücke neben dem Weg.
  function roomy(p, q, margin) {
    const clear = BODY.halfWidth + margin;
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
    const y = Math.max(p[1], q[1]) + 0.5;
    const low = Math.min(p[1], q[1]) - 0.6;
    const n = Math.max(1, Math.ceil(len / 0.1));
    for (let i = 0; i <= n; i++) {
      const x = p[0] + ((q[0] - p[0]) * i) / n;
      const z = p[2] + ((q[2] - p[2]) * i) / n;
      if (overlaps(world, x - clear, y, z - clear, x + clear, y + 1.2, z + clear)) return false;
      if (!overlaps(world, x - 0.15, low, z - 0.15, x + 0.15, y - 0.45, z + 0.15)) return false;
      // Nicht durch Wasser oder Absturzzonen (mit Körperbreite Abstand)
      for (const [ox, oz] of [[0, 0], [clear, 0], [-clear, 0], [0, clear], [0, -clear]]) {
        if (zoneAt(world, x + ox, Math.min(p[1], q[1]), z + oz)) return false;
      }
    }
    return true;
  }
  // stair: 'pair' = unten und oben an derselben Treppe, 'near' = Treppenende mit Punkt daneben
  function tryLink(a, b, stair = null) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (tried.has(key) || (stair !== 'pair' && !roomy(nodes[a], nodes[b], stair ? 0.05 : 0.2))) return;
    tried.add(key);
    if (walk(world, nodes[a], nodes[b]) && walk(world, nodes[b], nodes[a])) links.push([Math.min(a, b), Math.max(a, b)]);
  }
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][2] - nodes[b][2]);
      if (d <= LINK && Math.abs(nodes[a][1] - nodes[b][1]) < 0.5) tryLink(a, b);
    }
  }
  for (const ends of stairEnds) if (ends.length === 2) tryLink(...ends, 'pair');
  // Treppenenden auch mit Punkten in der Nähe auf ihrer Höhe (Treppe endet auf schmalem Dach)
  for (const ends of stairEnds) {
    for (const a of ends) {
      for (let b = 0; b < nodes.length; b++) {
        if (b === a) continue;
        const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][2] - nodes[b][2]);
        if (d <= LINK + 1 && Math.abs(nodes[a][1] - nodes[b][1]) < 0.7) tryLink(a, b, 'near');
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

  return { nodes: kept, links: keptLinks, dropped: nodes.filter((_, i) => !keep[i]) };
}
