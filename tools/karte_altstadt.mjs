// Baut src/maps/altstadt.json: Altstadt mit Kirchturm, spiegelgleich für beide Teams (Blau im Westen, Orange im
// Osten). Danach Wegpunkte erzeugen: node tools/wegpunkte.mjs altstadt
// Aufbau: Stadtmauer rundum, je Seite drei zweistöckige Häuser mit Innentreppe, Gassen dazwischen, in der Mitte
// der Marktplatz mit Brunnen und Ständen, im Norden die Kirche mit Turm (Glockenstube in 7,8 m, drei Treppen
// innen), daneben Kirchgärten mit Hecken und Bäumen, im Süden das Gasthaus mit Dachterrasse.

import { writeFileSync } from 'node:fs';

const T = 0.3; // Wandstärke der Häuser
const boxes = [];
const stairs = [];
const hints = []; // Wegpunkte vor und hinter jeder Tür, damit die Bots hindurchfinden

function box(type, min, max, color) {
  const b = { type, min: min.map((v, i) => +Math.min(v, max[i]).toFixed(3)), max: max.map((v, i) => +Math.max(v, min[i]).toFixed(3)) };
  if (color) b.color = color;
  boxes.push(b);
}

function both(build) {
  for (const s of [-1, 1]) build(a => s * a, s);
}

function stair(start, dir, height, width) {
  stairs.push({ start: start.map(v => +v.toFixed(3)), dir, steps: 9, rise: +(height / 9).toFixed(4), depth: 0.5, width });
}

// Wand entlang x (axis 'x', Dicke von f0 bis f1 in z) oder entlang z, von a0 bis a1, Höhe y0 bis y1.
// Öffnungen: [von, bis, unten, oben] entlang der Wand; darüber und darunter bleibt Wand stehen.
function wall(axis, f0, f1, a0, a1, y0, y1, holes, color, type = 'wand') {
  const cuts = [...new Set([a0, a1, ...holes.flatMap(h => [h[0], h[1]])])].filter(c => c >= a0 && c <= a1).sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const [p, q] = [cuts[i], cuts[i + 1]];
    if (q - p < 1e-6) continue;
    const hole = holes.find(h => h[0] <= p + 1e-6 && h[1] >= q - 1e-6);
    if (hole && hole[2] === y0 && q === hole[1]) {
      const c = (hole[0] + hole[1]) / 2;
      for (const f of [f0 - 1, f1 + 1]) hints.push(axis === 'x' ? [c, y0, f] : [f, y0, c]);
    }
    const spans = hole ? [[y0, hole[2]], [hole[3], y1]] : [[y0, y1]];
    for (const [lo, hi] of spans) {
      if (hi - lo < 1e-6) continue;
      if (axis === 'x') box(type, [p, lo, f0], [q, hi, f1], color);
      else box(type, [f0, lo, p], [f1, hi, q], color);
    }
  }
}

const DOOR = [2.4, 1.8]; // Höhe, Breite
const holeAt = (c, w, lo, hi) => [c - w / 2, c + w / 2, lo, hi];

// Zweistöckiges Haus: Türen je Seite (Lage entlang der Wand), Fenster unten mittig und oben zwei je Seite,
// Treppe innen an der Wand 'stair' (W oder E), Flachdach mit gestuftem First
function house({ x0, x1, z0, z1, doors = {}, stair: side, color, roof }) {
  const H = 6;
  const near = (list, c) => (list ?? []).some(d => Math.abs(d - c) < 1.8);
  const holes = (key, lo, hi) => {
    const list = [];
    for (const d of doors[key] ?? []) list.push(holeAt(d, DOOR[1], 0, DOOR[0]));
    const mid = (lo + hi) / 2;
    if (key !== side && !near(doors[key], mid)) list.push(holeAt(mid, 1.2, 1.0, 2.2));
    for (const k of [1 / 3, 2 / 3]) list.push(holeAt(lo + (hi - lo) * k, 1.2, 4.0, 5.2));
    return list;
  };
  wall('x', z0, z0 + T, x0, x1, 0, H, holes('N', x0, x1), color);
  wall('x', z1 - T, z1, x0, x1, 0, H, holes('S', x0, x1), color);
  wall('z', x0, x0 + T, z0 + T, z1 - T, 0, H, holes('W', z0, z1), color);
  wall('z', x1 - T, x1, z0 + T, z1 - T, 0, H, holes('E', z0, z1), color);

  // Treppe an der Seitenwand nach Süden hinauf, Decke mit Treppenloch
  const [sx0, sx1] = side === 'W' ? [x0 + T, x0 + T + 1.2] : [x1 - T - 1.2, x1 - T];
  const top = z0 + T + 5.9;
  stair([(sx0 + sx1) / 2, 0, z0 + T + 1.4], '+z', 3.2, 1.2);
  if (side === 'W') box('decke', [sx1, 3, z0 + T], [x1 - T, 3.2, z1 - T], '#9b7a55');
  else box('decke', [x0 + T, 3, z0 + T], [sx0, 3.2, z1 - T], '#9b7a55');
  box('decke', [sx0, 3, top], [sx1, 3.2, z1 - T], '#9b7a55');

  box('dach', [x0 - 0.2, H, z0 - 0.2], [x1 + 0.2, H + 0.3, z1 + 0.2], roof);
  const cx = (x0 + x1) / 2;
  box('dach', [cx - 2, H + 0.3, z0], [cx + 2, H + 1.2, z1], roof);
  box('dach', [cx - 0.8, H + 1.2, z0], [cx + 0.8, H + 1.8, z1], roof);
}

// Boden (Pflaster) und Stadtmauer
box('boden', [-31, -1, -25], [31, 0, 25], '#8f877b');
const MAUER = '#a39c90';
box('wand', [-31, 0, -25], [-30, 5, 25], MAUER);
box('wand', [30, 0, -25], [31, 5, 25], MAUER);
box('wand', [-30, 0, -25], [30, 5, -24], MAUER);
box('wand', [-30, 0, 24], [30, 5, 25], MAUER);

const PUTZ = ['#d9cbb0', '#c9b48f', '#e0d6c4'];
const ZIEGEL = ['#8e4a3a', '#7a4234', '#94573f'];

both((X, s) => {
  const inSide = s < 0 ? 'E' : 'W';
  const outSide = s < 0 ? 'W' : 'E';
  const xr = (a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];

  // Drei Häuser zwischen Spawn und Markt, Gassen dazwischen
  let [x0, x1] = xr(15, 23);
  house({ x0, x1, z0: -19, z1: -11, doors: { S: [X(19)], [inSide]: [-15] }, stair: outSide, color: PUTZ[0], roof: ZIEGEL[0] });
  house({ x0, x1, z0: -7, z1: 1, doors: { N: [X(17.5)], [inSide]: [-3] }, stair: outSide, color: PUTZ[1], roof: ZIEGEL[1] });
  house({ x0, x1, z0: 5, z1: 13, doors: { N: [X(19)], S: [X(17)], [inSide]: [9] }, stair: outSide, color: PUTZ[2], roof: ZIEGEL[2] });

  // Marktstände: Tisch, vier Pfosten, Stoffdach
  for (const [c, cloth] of [[-0.5, '#b33a3a'], [9, '#d8c690']]) {
    [x0, x1] = xr(4.7, 7.3);
    box('kiste', [x0, 0, c - 0.5], [x1, 1, c + 0.5]);
    for (const a of [4.75, 7.25]) for (const z of [c - 0.45, c + 0.45]) box('pfosten', [X(a) - 0.05, 0, z - 0.05], [X(a) + 0.05, 2.3, z + 0.05]);
    [x0, x1] = xr(4.5, 7.5);
    box('stoff', [x0, 2.3, c - 1.2], [x1, 2.4, c + 1.2], cloth);
  }
  // Fässer und Kisten am Markt, ein Karren
  box('kiste', [X(9.5) - 0.5, 0, 3], [X(9.5) + 0.5, 1, 4]);
  [x0, x1] = xr(9, 11);
  box('kiste', [x0, 0, 5.2], [x1, 1.2, 6.4], '#7a5532');
  [x0, x1] = xr(12.5, 13.7);
  box('kiste', [x0, 0, -9.5], [x1, 1.2, -8.3]);

  // Kirchgarten neben der Kirche: Hecken und zwei Bäume
  [x0, x1] = xr(8, 14);
  box('hecke', [x0, 0, -15], [x1, 1.2, -14.2], '#3f6b38');
  [x0, x1] = xr(8, 9);
  box('hecke', [x0, 0, -21], [x1, 1.2, -17.5], '#3f6b38');
  for (const [a, z] of [[11, -19], [12.5, -6]]) {
    box('stamm', [X(a) - 0.25, 0, z - 0.25], [X(a) + 0.25, 3, z + 0.25], '#6b4a2f');
    box('laub', [X(a) - 1.5, 2.6, z - 1.5], [X(a) + 1.5, 5, z + 1.5], '#4f7d3f');
  }

  // Gasthaus: Außentreppe aufs Dach
  stair([X(9), 0, 14.4], s < 0 ? '+x' : '-x', 3.4, 1.2);
  [x0, x1] = xr(4.5, 6);
  box('wand', [x0, 3.6, 21.7], [x1, 4.4, 22], PUTZ[1]);
});

// Kirche: Schiff mit Seitentüren und hohen Fenstern, Bänke, Altar
const STEIN = '#b3aa9b';
const high = [[-3, -2, 4, 6], [2, 3, 4, 6]];
wall('x', -22, -21.5, -6, 6, 0, 8, high, STEIN);
wall('x', -11.5, -11, -6, 6, 0, 8, [], STEIN);
for (const [f0, f1] of [[-6, -5.5], [5.5, 6]]) {
  wall('z', f0, f1, -21.5, -11.5, 0, 8, [[-18.2, -16.4, 0, 3], [-14.5, -13.5, 4, 6], [-20.5, -19.5, 4, 6]], STEIN);
}
box('dach', [-6.3, 8, -22.3], [6.3, 8.4, -10.8], '#5b5f66');
box('dach', [-3, 8.4, -22.3], [3, 9.6, -10.8], '#5b5f66');
box('dach', [-1.2, 9.6, -22.3], [1.2, 10.4, -10.8], '#5b5f66');
for (const z of [-20, -18, -16, -14]) {
  box('bank', [-4.5, 0, z], [-1, 0.5, z + 0.5], '#7a5532');
  box('bank', [1, 0, z], [4.5, 0.5, z + 0.5], '#7a5532');
}
box('kiste', [-1.5, 0, -21.3], [1.5, 1.1, -20.5], '#e2dccf');

// Kirchturm: außen 7,7 × 7,7 m, innen drei Treppen bis zur Glockenstube in 7,8 m, Fenster rundum in 8,4–9,8 m
const TX = -3.45;
const TZ = -10.6;
const tw = [-2.4, 2.4, 8.4, 9.8];
wall('x', -11, -10.6, -3.85, 3.85, 0, 9.8, [tw], STEIN);
wall('x', -3.7, -3.3, -3.85, 3.85, 0, 9.8, [[-1, 1, 0, 2.6], tw], STEIN);
wall('z', -3.85, -3.45, -10.6, -3.7, 0, 9.8, [[-9.2, -5.1, 8.4, 9.8]], STEIN);
wall('z', 3.45, 3.85, -10.6, -3.7, 0, 9.8, [[-9.2, -5.1, 8.4, 9.8]], STEIN);
stair([TX + 1.2, 0, TZ + 0.6], '+x', 2.6, 1.2);
box('wand', [TX + 5.7, 0, TZ], [TX + 6.9, 2.6, TZ + 1.2], STEIN);
stair([TX + 6.3, 2.6, TZ + 1.2], '+z', 2.6, 1.2);
box('wand', [TX + 5.7, 0, TZ + 5.7], [TX + 6.9, 5.2, TZ + 6.9], STEIN);
stair([TX + 5.7, 5.2, TZ + 6.3], '-x', 2.6, 1.2);
box('decke', [TX, 7.6, TZ], [TX + 6.9, 7.8, TZ + 5.7], '#7a6a55');
box('decke', [TX, 7.6, TZ + 5.7], [TX + 1.2, 7.8, TZ + 6.9], '#7a6a55');
box('dach', [-3.85, 9.8, -11], [3.85, 10.2, -3.3], '#4f5a63');
for (const [h0, h1, r] of [[10.2, 11.2, 3], [11.2, 12.7, 2], [12.7, 14.7, 1], [14.7, 16.7, 0.25]]) {
  box('dach', [-r, h0, -7.15 - r], [r, h1, -7.15 + r], '#4f5a63');
}

// Marktplatz: Brunnen mit Säule und kleinem Dach
box('brunnen', [-1.5, 0, 3], [1.5, 0.9, 6], '#9a958c');
box('brunnen', [-0.25, 0.9, 4.25], [0.25, 2.6, 4.75], '#9a958c');
box('dach', [-0.9, 2.6, 3.6], [0.9, 2.8, 5.4], ZIEGEL[0]);

// Gasthaus mit begehbarem Dach und Brüstung, Lücken an den Treppen
const G = PUTZ[1];
wall('x', 15, 15.3, -6, 6, 0, 3.4, [[-1, 1, 0, 2.4], [-4.6, -3.4, 1, 2.2], [3.4, 4.6, 1, 2.2]], G);
wall('x', 21.7, 22, -6, 6, 0, 3.4, [[-2.6, -1.4, 1, 2.2], [1.4, 2.6, 1, 2.2]], G);
wall('z', -6, -5.7, 15.3, 21.7, 0, 3.4, [[18, 19.4, 0, 2.4]], G);
wall('z', 5.7, 6, 15.3, 21.7, 0, 3.4, [[18, 19.4, 0, 2.4]], G);
box('dach', [-6, 3.4, 15], [6, 3.6, 22], '#8a7d6a');
box('wand', [-3.5, 3.6, 15], [3.5, 4.4, 15.3], G);
box('wand', [-4.5, 3.6, 21.7], [4.5, 4.4, 22], G);
box('wand', [-6, 3.6, 15.3], [-5.7, 4.4, 21.7], G);
box('wand', [5.7, 3.6, 15.3], [6, 4.4, 21.7], G);
for (const [x, z] of [[-3, 18.5], [3, 18.5], [0, 20.3]]) box('kiste', [x - 0.6, 0, z - 0.6], [x + 0.6, 0.8, z + 0.6], '#7a5532');

const spawns = [];
for (const [team, s, yaw] of [['A', -1, -Math.PI / 2], ['B', 1, Math.PI / 2]]) {
  for (const z of [-9, -3, 3, 9]) spawns.push({ team, pos: [s * 27, 0, z], yaw: +yaw.toFixed(5) });
}

const map = { name: 'Altstadt', killY: -20, boxes, stairs, spawns, navHints: hints.map(h => h.map(v => +v.toFixed(2))) };
writeFileSync(new URL('../src/maps/altstadt.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(`Altstadt: ${boxes.length} Blöcke, ${stairs.length} Treppen`);
