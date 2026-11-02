// Baut src/maps/baustelle.json: Baustelle, spiegelgleich für beide Teams (Blau im Westen, Orange im Osten).
// Danach Wegpunkte erzeugen: node tools/wegpunkte.mjs baustelle
// Aufbau: Rohbau in der Mitte (Ebenen 3,2 / 6,4 / halbes Dach 9,6 m, Treppenhäuser, Loch in der Decke), Gerüste
// an den Seiten zu den Spawns mit Gerüsttreppen, Baukran am Rohbau (Plattform vom Dach aus erreichbar),
// Baugrube im Süden mit Treppen und Bagger, Baucontainer, Material, Bretterzaun rundum.

import { writeFileSync } from 'node:fs';

const boxes = [];
const stairs = [];

function box(type, min, max, color) {
  const b = { type, min: min.map((v, i) => +Math.min(v, max[i]).toFixed(3)), max: max.map((v, i) => +Math.max(v, min[i]).toFixed(3)) };
  if (color) b.color = color;
  boxes.push(b);
}

function both(build) {
  for (const s of [-1, 1]) build(a => s * a, s);
}

const xr = (X, a0, a1) => [Math.min(X(a0), X(a1)), Math.max(X(a0), X(a1))];

function stair(start, dir, height, width) {
  stairs.push({ start: start.map(v => +v.toFixed(3)), dir, steps: 9, rise: +(height / 9).toFixed(4), depth: 0.5, width });
}

// Treppenrichtung wie im Osten angegeben, im Westen gespiegelt
const flip = (dir, s) => (dir[1] === 'x' && s < 0 ? (dir[0] === '-' ? '+x' : '-x') : dir);

// Rechteckige Platte von y0 bis y1 mit rechteckigen Aussparungen [x0, x1, z0, z1]
function slab(type, x0, x1, z0, z1, y0, y1, holes, color) {
  const xs = [...new Set([x0, x1, ...holes.flatMap(h => [h[0], h[1]])])].filter(v => v >= x0 && v <= x1).sort((p, q) => p - q);
  const zs = [...new Set([z0, z1, ...holes.flatMap(h => [h[2], h[3]])])].filter(v => v >= z0 && v <= z1).sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    // Zellen einer Spalte zusammenfassen, solange keine Aussparung dazwischen liegt
    let start = null;
    for (let j = 0; j <= zs.length - 1; j++) {
      const inHole = j < zs.length - 1 && holes.some(h => h[0] <= xs[i] && h[1] >= xs[i + 1] && h[2] <= zs[j] && h[3] >= zs[j + 1]);
      const end = j === zs.length - 1 || inHole;
      if (!end && start === null) start = zs[j];
      if (end && start !== null) {
        box(type, [xs[i], y0, start], [xs[i + 1], y1, zs[j]], color);
        start = null;
      }
    }
  }
}

const C = { len: 6, h: 2.6, w: 2.4 };
function container(x, z, level, color) {
  box('container', [x - C.len / 2, level * C.h, z - C.w / 2], [x + C.len / 2, (level + 1) * C.h, z + C.w / 2], color);
}

const BETON = '#b8b4ad';
const HOLZ = '#a07a4a';
const ERDE = '#9c8a6e';

// Boden mit Baugrube (x −9…9, z 12…21, 2,6 m tief, Erdreich bis zur Grubensohle), Bretterzaun rundum
box('boden', [-32, -3.6, -26], [32, 0, 12], ERDE);
box('boden', [-32, -3.6, 21], [32, 0, 26], ERDE);
box('boden', [-32, -3.6, 12], [-9, 0, 21], ERDE);
box('boden', [9, -3.6, 12], [32, 0, 21], ERDE);
box('boden', [-9, -3.6, 12], [9, -2.6, 21], '#7d6b55');
box('spundwand', [-9, -2.6, 12], [9, 0, 12.1], '#5d6670');
box('spundwand', [-9, -2.6, 20.9], [9, 0, 21], '#5d6670');
box('bretterwand', [-33, 0, -27], [-32, 3, 27], HOLZ);
box('bretterwand', [32, 0, -27], [33, 3, 27], HOLZ);
box('bretterwand', [-32, 0, -27], [32, 3, -26], HOLZ);
box('bretterwand', [-32, 0, 26], [32, 3, 27], HOLZ);

// Rohbau: Decken mit Treppenlöchern, Stützen, halbes Dach im Norden
const L = [0, 3.2, 6.4, 9.6];
const flight1 = s => [...(s < 0 ? [-8.9, -7.5] : [7.5, 8.9]), -6.5, -2];
const flight2 = s => [...(s < 0 ? [-10.5, -9.1] : [9.1, 10.5]), -6.5, -2];
slab('beton', -11, 11, -8, 8, 2.9, 3.2, [flight1(-1), flight1(1), [-1, 1, 2, 4]], BETON);
slab('beton', -11, 11, -8, 8, 6.1, 6.4, [flight2(-1), flight2(1)], BETON);
slab('beton', -11, 11, -8, 0, 9.3, 9.6, [flight1(-1), flight1(1)], BETON);
for (let lvl = 0; lvl < 3; lvl++) {
  for (const x of [-10.75, -5.5, 0, 5.5, 10.75]) {
    for (const z of [-7.75, 0, 7.75]) {
      if (lvl === 2 && z > 0) continue;
      if (Math.abs(x) === 5.5 && z === 0) continue; // Treppenhaus und Mitte frei lassen
      box('beton', [x - 0.25, L[lvl], z - 0.25], [x + 0.25, L[lvl] + 2.9, z + 0.25], BETON);
    }
  }
}
// Oben auf dem Dach: Stützenstummel mit Bewehrung
for (const x of [-5.5, 5.5]) box('stahl', [x - 0.25, 9.6, -7.75 - 0.25], [x + 0.25, 10.4, -7.75 + 0.25], '#6f5a4a');

both((X, s) => {
  // Treppenhaus im Rohbau: drei Läufe im Zickzack
  stair([X(8.2), 0, -6.5], '+z', 3.2, 1.4);
  stair([X(9.8), 3.2, -2], '-z', 3.2, 1.4);
  stair([X(8.2), 6.4, -6.5], '+z', 3.2, 1.4);

  // Halbfertige Ziegelmauern im Erdgeschoss und im 1. Stock
  let [x0, x1] = xr(X, 2, 9);
  // Mauern 3 cm hinter der Säulenvorderseite, sonst flimmern die gemeinsamen Flächen
  box('ziegel', [x0, 0, -7.97], [x1, 2.9, -7.77], '#9a4e3a');
  [x0, x1] = xr(X, 3, 9);
  box('ziegel', [x0, 0, 7.77], [x1, 1.2, 7.97], '#9a4e3a');
  [x0, x1] = xr(X, 1.5, 4.5);
  box('ziegel', [x0, 3.2, -0.5], [x1, 4.4, -0.25], '#9a4e3a');
  [x0, x1] = xr(X, 6.5, 9);
  box('ziegel', [x0, 3.2, 7.77], [x1, 6.1, 7.97], '#9a4e3a');

  // Gerüst an der Außenseite: Bohlen in 3,2 und 6,4 m, Treppe von außen in einem Zug bis oben
  [x0, x1] = xr(X, 11, 12.6);
  box('geruest', [x0, 3.1, -8], [x1, 3.2, 8], HOLZ);
  box('geruest', [x0, 6.3, -8], [x1, 6.4, 8], HOLZ);
  [x0, x1] = xr(X, 12.6, 14);
  box('geruest', [x0, 3.1, -6], [x1, 3.2, 1.5], HOLZ);
  stair([X(13.3), 0, 6], '-z', 3.2, 1.2);
  stair([X(13.3), 3.2, 1], '-z', 3.2, 1.2);
  for (const z of [-8, 8]) box('rohr', [X(12.55) - 0.04, 0, z - 0.04], [X(12.55) + 0.04, 7.4, z + 0.04], '#8a9198');

  // Baucontainer: zwei übereinander, davor einer, Treppen bis aufs obere Dach
  container(X(27), -19.2, 0, '#c9b23a');
  container(X(27), -19.2, 1, '#d8d4c8');
  container(X(27), -16.8, 0, '#d8d4c8');
  stair([X(25), 0, -11.1], '-z', C.h, 1.4);
  stair([X(25), C.h, -17.2], flip('+x', s), C.h, 1.6);
  for (const z of [-14, -12.6]) box('klo', [X(22.2) - 0.6, 0, z - 0.6], [X(22.2) + 0.6, 2.3, z + 0.6], '#3f7a4a');

  // Lkw im Norden
  [x0, x1] = xr(X, 13, 15);
  box('lkw', [x0, 0, -21], [x1, 3, -18.6], '#c9c4b8');
  [x0, x1] = xr(X, 15, 20);
  box('lkw', [x0, 0, -21], [x1, 1.4, -18.6], '#5d6670');
  box('lkw', [x0, 1.4, -21], [x1, 2.2, -20.8], '#5d6670');
  box('lkw', [x0, 1.4, -18.8], [x1, 2.2, -18.6], '#5d6670');

  // Material: Ziegelpaletten, Sandhaufen, Betonmischer, Rohrstapel
  for (const [a, z, h] of [[5.6, -13.4, 1], [6.9, -13.4, 1], [6.2, -13.4, 2]]) {
    box('ziegel', [X(a) - 0.6, h - 1, z - 0.6], [X(a) + 0.6, h, z + 0.6], '#9a4e3a');
  }
  for (const [r, h] of [[1.5, 0.5], [1, 1], [0.5, 1.5]]) box('sand', [X(19) - r, h - 0.5, -2 - r], [X(19) + r, h, -2 + r], '#c8b27e');
  box('mischer', [X(16.7) - 0.7, 0, 7], [X(16.7) + 0.7, 1.6, 8.4], '#d9a92e');
  [x0, x1] = xr(X, 18, 24);
  box('rohr', [x0, 0, 19.6], [x1, 0.6, 20.2], '#8a9198');
  box('rohr', [x0, 0, 20.2], [x1, 0.6, 20.8], '#8a9198');
  box('rohr', [x0, 0.6, 19.9], [x1, 1.2, 20.5], '#8a9198');

  // Bagger am Grubenrand, Schaufel hängt in die Grube
  [x0, x1] = xr(X, 11.5, 15.5);
  box('bagger', [x0, 0, 12.8], [x1, 0.7, 13.4], '#2b2d30');
  box('bagger', [x0, 0, 15.1], [x1, 0.7, 15.7], '#2b2d30');
  [x0, x1] = xr(X, 12, 15);
  box('bagger', [x0, 0.7, 13], [x1, 2.3, 15.5], '#d9b02e');
  [x0, x1] = xr(X, 12.2, 13.6);
  box('bagger', [x0, 2.3, 13.2], [x1, 3.6, 14.6], '#d9b02e');
  [x0, x1] = xr(X, 9.6, 12);
  box('bagger', [x0, 2.6, 14], [x1, 3.2, 14.6], '#d9b02e');
  [x0, x1] = xr(X, 9.1, 9.8);
  box('bagger', [x0, 1.2, 13.9], [x1, 2.6, 14.7], '#2b2d30');

  // Baugrube: Treppe hinaus, Bewehrung und Kisten unten
  stair([X(4.5), -2.6, 18.5], flip('+x', s), 2.6, 1.4);
  [x0, x1] = xr(X, 2, 6);
  box('stahl', [x0, -2.6, 14.5], [x1, -2.1, 15.5], '#6f5a4a');
  box('kiste', [X(1.5) - 0.6, -2.6, 19.4], [X(1.5) + 0.6, -1.6, 20.6]);
});

// Baukran am Nordrand des Rohbaus: Plattform in 9,6 m vom Dach aus, Mast, Führerhaus, Ausleger mit Last
slab('steg', -2, 2, -12, -8, 9.4, 9.6, [[-1, 1, -11, -9]], '#5d6670');
box('kran', [-1, 0, -11], [1, 14, -9], '#d9a92e');
box('kran', [1, 12, -11], [2.6, 13.5, -9], '#d9a92e');
box('kran', [-22, 14, -10.5], [20, 14.8, -9.5], '#d9a92e');
box('kran', [-0.4, 14.8, -10.4], [0.4, 17, -9.6], '#d9a92e');
box('kran', [-21, 12.5, -10.8], [-17, 14, -9.2], '#5d6670');
box('balken', [14.95, 9, -10.05], [15.05, 14, -9.95]);
box('ziegel', [14.4, 8, -10.6], [15.6, 9, -9.4], '#9a4e3a');

const spawns = [];
for (const [team, s, yaw] of [['A', -1, -Math.PI / 2], ['B', 1, Math.PI / 2]]) {
  for (const z of [-3, 0, 3, 6]) spawns.push({ team, pos: [s * 28, 0, z], yaw: +yaw.toFixed(5) });
}

const map = { name: 'Baustelle', killY: -20, boxes, stairs, spawns };
writeFileSync(new URL('../src/maps/baustelle.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(`Baustelle: ${boxes.length} Blöcke, ${stairs.length} Treppen`);
