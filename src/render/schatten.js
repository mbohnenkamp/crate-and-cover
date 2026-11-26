// Vorberechnete Verschattung (Umgebungsverdeckung): Wie viel Himmel sieht jede Stelle einer Blockfläche?
// In Ecken, am Fuß von Wänden und unter Vorsprüngen wenig, dort wird es dunkler. Je Fläche ein Rechteck in einem
// gemeinsamen Bild (4 Bildpunkte je Meter), berechnet beim Laden der Karte mit kurzen Strahlen gegen die Blöcke.
// Schmuckblöcke bekommen keinen eigenen Platz, sondern den weißen Bildpunkt oben links (keine Verschattung).

import * as THREE from 'three';

// three.js dunkelt mit der Verdeckung nur das Umgebungslicht ab; das ist seit V4.33 schwach, man sah fast nichts.
// Wie bei vorberechneten Schatten klassischer Shooter auch das direkte Sonnenlicht zum Teil abdunkeln.
// Gilt nur für Materialien mit aoMap, und die hat nur die Karte.
const DIRECT = 0.65;
THREE.ShaderChunk.aomap_fragment = THREE.ShaderChunk.aomap_fragment.replace(
  'reflectedLight.indirectDiffuse *= ambientOcclusion;',
  `reflectedLight.indirectDiffuse *= ambientOcclusion;\n\treflectedLight.directDiffuse *= mix( 1.0, ambientOcclusion, ${DIRECT.toFixed(2)} );`,
);

const RES = 4; // Bildpunkte je Meter
const REACH = 2.5; // Strahllänge in Metern: so weit wirkt eine Wand auf den Boden
const CELL = 3; // Raster für die Blocksuche, größer als REACH
const STRENGTH = 0.9;

// 12 Richtungen auf der Halbkugel, zum Pol hin dichter (Kosinus-gewichtet), feste Reihenfolge
const DIRS = [];
for (let i = 0; i < 12; i++) {
  const r = Math.sqrt((i + 0.5) / 12);
  const a = i * 2.39996; // goldener Winkel
  DIRS.push([r * Math.cos(a), Math.sqrt(1 - r * r), r * Math.sin(a)]);
}

// Liefert { texture, size, rects } — rects.get(box)[face] = [u0, v0, u1, v1] im Bild (0..1), face wie BoxGeometry
export function bakeShadows(boxes, deko) {
  const solid = boxes.filter(b => !b.deko);
  const grid = buildGrid(solid);
  // Flächen sammeln: Eckpunkt, Achsen, Normale, Größe in Bildpunkten
  const faces = [];
  // Verdecken tun alle Blöcke (auch die unsichtbaren unter Modellen), ein Bild bekommen nur die gezeichneten
  for (const b of solid.filter(b => !b.hidden)) {
    for (let f = 0; f < 6; f++) {
      const face = faceOf(b, f);
      face.w = Math.max(1, Math.ceil(face.lenU * RES));
      face.h = Math.max(1, Math.ceil(face.lenV * RES));
      faces.push(face);
    }
  }
  // Regalpacken: nach Höhe sortiert, Zeile für Zeile, 1 Bildpunkt Rand um jedes Rechteck
  const order = faces.slice().sort((a, b) => b.h - a.h);
  const area = faces.reduce((s, f) => s + (f.w + 2) * (f.h + 2), 0);
  let size = 256;
  while (size * size < area * 1.25) size *= 2;
  let x = 2, y = 0, rowH = 0; // Bildpunkt (0,0) bleibt weiß für Schmuck
  for (const f of order) {
    if (x + f.w + 2 > size) { x = 0; y += rowH; rowH = 0; }
    f.px = x + 1;
    f.py = y + 1;
    x += f.w + 2;
    rowH = Math.max(rowH, f.h + 2);
  }
  const height = y + rowH;
  while (size < height) size *= 2;

  const data = new Uint8Array(size * size * 4).fill(255);
  const p = [0, 0, 0];
  for (const f of faces) {
    for (let j = -1; j <= f.h; j++) {
      for (let i = -1; i <= f.w; i++) {
        // Randbildpunkte bekommen den Wert der Kante (kein Durchscheinen der Nachbarn beim Filtern)
        const u = (Math.min(Math.max(i, 0), f.w - 1) + 0.5) / f.w;
        const v = (Math.min(Math.max(j, 0), f.h - 1) + 0.5) / f.h;
        for (let k = 0; k < 3; k++) p[k] = f.o[k] + f.U[k] * u + f.V[k] * v + f.n[k] * 0.02;
        const ao = occlusion(grid, p, f);
        const idx = ((f.py + j) * size + (f.px + i)) * 4;
        const val = Math.round(255 * (1 - ao * STRENGTH));
        data[idx] = data[idx + 1] = data[idx + 2] = val;
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData.own = true;
  texture.channel = 1; // zweite Texturkoordinate (uv1), die erste ist die Weltlage für die Oberflächenbilder

  const rects = new Map();
  faces.forEach(f => {
    if (!rects.has(f.box)) rects.set(f.box, []);
    rects.get(f.box)[f.index] = [f.px / size, f.py / size, (f.px + f.w) / size, (f.py + f.h) / size];
  });
  const white = [0.5 / size, 0.5 / size, 0.5 / size, 0.5 / size];
  for (const d of deko) rects.set(d, Array(6).fill(white));
  return { texture, rects };
}

// Fläche f eines Blocks genau wie in BoxGeometry: o = Ecke mit Texturkoordinate (0, 0), U und V die Kanten bis
// (1, 0) bzw. (0, 1). Aus einem echten BoxGeometry gelesen, damit Bild und Fläche sicher zusammenpassen.
const _geo = new THREE.BoxGeometry(1, 1, 1);
function faceOf(b, index) {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const pos = _geo.attributes.position;
  const uv = _geo.attributes.uv;
  const nrm = _geo.attributes.normal;
  const at = i => [0, 1, 2].map(k => center[k] + pos.getComponent(i, k) * size[k]);
  let o, pu, pv;
  for (let i = index * 4; i < index * 4 + 4; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (u === 0 && v === 0) o = at(i);
    if (u === 1 && v === 0) pu = at(i);
    if (u === 0 && v === 1) pv = at(i);
  }
  const F = { box: b, index, o, n: [nrm.getX(index * 4), nrm.getY(index * 4), nrm.getZ(index * 4)] };
  F.U = pu.map((c, k) => c - o[k]);
  F.V = pv.map((c, k) => c - o[k]);
  F.lenU = Math.hypot(...F.U);
  F.lenV = Math.hypot(...F.V);
  // Zwei Tangenten für die Strahlrichtungen
  F.t = F.U.map(c => c / (F.lenU || 1));
  F.b = F.V.map(c => c / (F.lenV || 1));
  return F;
}

function buildGrid(boxes) {
  const cells = new Map();
  for (const b of boxes) {
    const cx0 = Math.floor((b.min[0] - REACH) / CELL), cx1 = Math.floor((b.max[0] + REACH) / CELL);
    const cz0 = Math.floor((b.min[2] - REACH) / CELL), cz1 = Math.floor((b.max[2] + REACH) / CELL);
    // Sehr große Blöcke (Boden) über viele Zellen: nur einmal je Zelle
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const key = cx * 100000 + cz;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(b);
    }
  }
  return cells;
}

// Anteil verdeckter Strahlen (jeder Treffer innerhalb der Reichweite zählt voll; abgestuft war es zu schwach)
function occlusion(grid, p, f) {
  const list = grid.get(Math.floor(p[0] / CELL) * 100000 + Math.floor(p[2] / CELL));
  if (!list) return 0;
  let occ = 0;
  const d = [0, 0, 0];
  for (const [a, up, c] of DIRS) {
    for (let k = 0; k < 3; k++) d[k] = f.t[k] * a + f.n[k] * up + f.b[k] * c;
    let near = REACH;
    for (const b of list) {
      const t = hit(p, d, b, near);
      if (t < near) near = t;
    }
    if (near < REACH) occ += 1;
  }
  return occ / DIRS.length;
}

// Strahl gegen Block, Abstand oder Infinity
function hit(o, d, b, max) {
  let t0 = 0;
  let t1 = max;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < b.min[i] || o[i] > b.max[i]) return Infinity;
      continue;
    }
    let a = (b.min[i] - o[i]) / d[i];
    let c = (b.max[i] - o[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return Infinity;
  }
  return t0;
}
