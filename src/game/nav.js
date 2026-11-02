// Wegpunkte: Graph aus Knoten und begehbaren Verbindungen, Wegsuche mit A*, Sichtlinien.

import { rayWorld } from './ray.js';

export function createNav(data, world) {
  const nodes = data.nodes.map(([x, y, z], id) => ({ id, x, y, z, links: [] }));
  for (const [a, b] of data.links) {
    nodes[a].links.push(b);
    nodes[b].links.push(a);
  }
  // Erhöhte Plätze (Plattformen, Containerdächer, Brücke), dort gehen Bots gern hin; die höchsten für Scharfschützen
  const high = nodes.filter(n => n.y > 2);
  const topY = Math.max(0, ...high.map(n => n.y));
  return { nodes, world, high, top: high.filter(n => n.y > topY - 0.5) };
}

export function lineOfSight(world, a, b) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (len < 1e-6) return true;
  d.x /= len; d.y /= len; d.z /= len;
  return !rayWorld(world, a, d, len - 0.05);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * 2, a.z - b.z);
}

// Geradeaus begehbar? Drei Strahlen knapp über Stufenhöhe (Mitte und beide Körperseiten) und einer in
// Kopfhöhe. Sehen allein reicht nicht — über Treppenstufen sieht man, laufen kann man dort nicht;
// und unter dem Sturz eines Duck-Durchgangs ist es in Kniehöhe frei, aufrecht kommt man nicht durch.
export function walkable(world, pos, n) {
  if (!lineOfSight(world, { x: pos.x, y: pos.y + 1.7, z: pos.z }, { x: n.x, y: n.y + 1.7, z: n.z })) return false;
  const dx = n.x - pos.x;
  const dz = n.z - pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const side = { x: (-dz / len) * 0.45, z: (dx / len) * 0.45 };
  for (const k of [0, 1, -1]) {
    const a = { x: pos.x + side.x * k, y: pos.y + 0.5, z: pos.z + side.z * k };
    const b = { x: n.x + side.x * k, y: n.y + 0.5, z: n.z + side.z * k };
    if (!lineOfSight(world, a, b)) return false;
  }
  return true;
}

// Nächster Knoten auf ungefähr gleicher Höhe, den man geradeaus erreicht
export function nearestNode(nav, pos) {
  let best = null;
  let bestD = Infinity;
  const sorted = nav.nodes.slice().sort((a, b) => dist(a, pos) - dist(b, pos));
  // Erst unter den nächsten 8 suchen, sonst weiter (z. B. direkt hinter einer Wand neben einer Tür)
  for (const n of sorted.slice(0, 8)) {
    if (Math.abs(n.y - pos.y) > 1.5) continue;
    if (!walkable(nav.world, pos, n)) continue;
    const d = dist(n, pos);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (!best) best = sorted.slice(8, 40).find(n => Math.abs(n.y - pos.y) <= 1.5 && walkable(nav.world, pos, n));
  return best ?? sorted[0];
}

export function findPath(nav, from, to) {
  if (from === to) return [from];
  const open = new Set([from.id]);
  const came = new Map();
  const g = new Map([[from.id, 0]]);
  const f = new Map([[from.id, dist(from, to)]]);
  while (open.size) {
    let cur = null;
    for (const id of open) if (cur === null || f.get(id) < f.get(cur)) cur = id;
    if (cur === to.id) {
      const path = [nav.nodes[cur]];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(nav.nodes[cur]); }
      return path;
    }
    open.delete(cur);
    for (const nb of nav.nodes[cur].links) {
      const tentative = g.get(cur) + dist(nav.nodes[cur], nav.nodes[nb]);
      if (tentative < (g.get(nb) ?? Infinity)) {
        came.set(nb, cur);
        g.set(nb, tentative);
        f.set(nb, tentative + dist(nav.nodes[nb], to));
        open.add(nb);
      }
    }
  }
  return null;
}
