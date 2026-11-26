// Schmutz und Risse: flache Aufkleber auf Wänden und Boden (Schmutzränder am Wandfuß, Laufspuren unter Kanten,
// Risse, Ölflecken, Schmutzflecken) und Pfützen. Die Bilder werden einmal beim Laden im Code gemalt, die Plätze je
// Karte aus den Blöcken bestimmt (fester Zufall je Kartenname, also bei jedem Laden gleich). Nur fürs Aussehen,
// keine Kollision.
// Aufkleber dunkeln das fertige Bild ab (Multiplizieren): Licht und Schatten der Fläche darunter bleiben erhalten.
// Alle Aufkleber zusammen sind ein Zeichenaufruf, alle Pfützen ein zweiter.

import * as THREE from 'three';
import { lookFor } from './textures.js';

const SIZE = 1024;
// Plätze im Bild [x, y, Breite, Höhe] in Bildpunkten, mit Abstand, damit beim Verkleinern nichts überläuft
const TILES = {
  fuss: [0, 0, 1024, 128],
  spur: [[0, 136, 120, 240], [128, 136, 120, 240], [256, 136, 120, 240], [384, 136, 120, 240]],
  riss: [[512, 136, 240, 240], [768, 136, 240, 240], [0, 384, 240, 240], [256, 384, 240, 240]],
  oel: [[512, 384, 240, 240], [768, 384, 240, 240]],
  fleck: [[0, 632, 240, 240], [256, 632, 240, 240]],
};
const FOOT_LEN = 4; // Meter, die das Bild des Wandfußes abdeckt (wiederholt sich nahtlos)

// Farbe, mit der an der dunkelsten Stelle multipliziert wird
const TINT = {
  fuss: [0.3, 0.27, 0.23],
  spur: [0.38, 0.36, 0.33],
  rost: [0.6, 0.32, 0.17],
  riss: [0.22, 0.2, 0.19],
  oel: [0.3, 0.3, 0.32],
  fleck: [0.52, 0.48, 0.42],
  nass: [0.55, 0.53, 0.5],
};

const WALL_LOOKS = new Set(['putz', 'stein', 'beton', 'ziegel', 'wellblech', 'bretter']);
const NOT_WALLS = new Set(['treppe', 'decke', 'dach', 'boden', 'kiste', 'steg', 'balken', 'geruest', 'bank', 'pfosten', 'hecke']);

// ---------- Bilder ----------

function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Wertrauschen; period > 0: wiederholt sich in x nach period
function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = period ? ((xi % period) + period) % period : xi;
  const x1 = period ? (((xi + 1) % period) + period) % period : xi + 1;
  const a = hash(x0, yi, s), b = hash(x1, yi, s), c = hash(x0, yi + 1, s), d = hash(x1, yi + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, s, oct = 4, period = 0) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, s + o * 17, period * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
const clamp = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Malt eine Kachel Bildpunkt für Bildpunkt; f(u, v) mit u nach rechts, v nach oben (0..1), liefert Stärke 0..1
function paint(img, [x0, y0, w, h], f) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = clamp(f((i + 0.5) / w, 1 - (j + 0.5) / h));
      const k = ((y0 + j) * SIZE + x0 + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(a * 255);
    }
  }
}

// Rand einer Kachel auf null ziehen (kein Überlauf in die Nachbarn)
const edge = (u, v, m = 0.06) => smooth(0, m, u) * smooth(0, m, 1 - u) * smooth(0, m, v) * smooth(0, m, 1 - v);

// Unregelmäßiger Fleck um die Mitte: Abstand zum Rand mit verwackelter Kante (0 Mitte, 1 Rand)
function blob(u, v, s, warp) {
  const dx = u - 0.5, dy = v - 0.5;
  return Math.hypot(dx, dy) / 0.42 + (fbm(u * 3, v * 3, s, 4) - 0.5) * warp;
}

function crack(g, [x0, y0, w, h], r) {
  g.save();
  g.beginPath();
  g.rect(x0 + 6, y0 + 6, w - 12, h - 12);
  g.clip();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const branch = (x, y, angle, steps, width) => {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      angle += (r() - 0.5) * 0.9;
      x += Math.cos(angle) * (6 + r() * 8);
      y += Math.sin(angle) * (6 + r() * 8);
      pts.push([x, y]);
      if (steps > 4 && r() < 0.18) branch(x, y, angle + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), Math.floor(steps / 2), width * 0.6);
    }
    // Erst ein breiter, schwacher Schmutzsaum, dann der Riss selbst, zum Ende hin dünner
    for (const [lw, a] of [[width * 5, 0.1], [width, 0.95]]) {
      for (let i = 1; i < pts.length; i++) {
        g.strokeStyle = `rgba(255,255,255,${a})`;
        g.lineWidth = Math.max(0.6, lw * (1 - i / pts.length * 0.7));
        g.beginPath();
        g.moveTo(...pts[i - 1]);
        g.lineTo(...pts[i]);
        g.stroke();
      }
    }
  };
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const arms = 2 + Math.floor(r() * 2);
  const base = r() * Math.PI * 2;
  for (let a = 0; a < arms; a++) branch(cx, cy, base + a * (Math.PI * 2 / arms) + (r() - 0.5), 7 + Math.floor(r() * 5), 2 + r());
  g.restore();
}

let atlas = null;
let puddleMap = null;
function textures() {
  if (atlas) return;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  for (let k = 3; k < img.data.length; k += 4) img.data[k] = 255;

  // Wandfuß: dunkel unten, verwackelte Oberkante, Spritzer; wiederholt sich nahtlos nach rechts
  paint(img, TILES.fuss, (u, v) => {
    const top = 0.45 + 0.45 * fbm(u * 16, 0.5, 11, 4, 16);
    const body = smooth(top, top - 0.5, v);
    const grain = 0.55 + 0.45 * fbm(u * 96, v * 12, 12, 3, 96);
    const spots = smooth(0.62, 0.75, fbm(u * 64, v * 10, 13, 3, 64)) * smooth(0.9, 0.3, v);
    return (body * 0.85 + Math.pow(1 - v, 4) * 0.3 + spots * 0.35) * grain * smooth(0, 0.08, 1 - v);
  });
  // Laufspuren: von oben herab, unten auslaufend
  TILES.spur.forEach((t, n) => {
    const r = rng(100 + n);
    const lines = Array.from({ length: 3 + Math.floor(r() * 4) }, () =>
      ({ c: 0.2 + r() * 0.6, w: 0.03 + r() * 0.07, len: 0.35 + r() * 0.6, a: 0.35 + r() * 0.55 }));
    paint(img, t, (u, v) => {
      const d = 1 - v; // Abstand von oben
      let a = smooth(0.12, 0, d) * 0.45 * fbm(u * 8, 0, 120 + n, 3);
      for (const [k, l] of lines.entries()) {
        const wob = (fbm(d * 5, k, 130 + n, 3) - 0.5) * 0.08;
        a += l.a * Math.exp(-(((u - l.c + wob) / l.w) ** 2)) * smooth(l.len, l.len * 0.4, d);
      }
      return a * (0.6 + 0.4 * fbm(u * 30, v * 40, 140 + n, 3)) * edge(u, v, 0.08);
    });
  });
  // Ölflecken: dunkel mit kräftigerem Rand und Tropfen daneben
  TILES.oel.forEach((t, n) => paint(img, t, (u, v) => {
    const d = blob(u, v, 200 + n, 0.7);
    const drops = smooth(0.72, 0.8, fbm(u * 14, v * 14, 210 + n, 2)) * smooth(1.25, 0.9, d) * 0.7;
    const a = smooth(1, 0.82, d) * (0.55 + 0.45 * fbm(u * 12, v * 12, 220 + n, 3)) + 0.3 * Math.exp(-(((d - 0.95) / 0.05) ** 2));
    return (a + drops) * edge(u, v);
  }));
  // Schmutzflecken: weich und schwach
  TILES.fleck.forEach((t, n) => paint(img, t, (u, v) => {
    const d = blob(u, v, 300 + n, 1.1);
    return smooth(1, 0.2, d) * (0.4 + 0.6 * fbm(u * 10, v * 10, 310 + n, 4)) * edge(u, v);
  }));
  g.putImageData(img, 0, 0);
  TILES.riss.forEach((t, n) => crack(g, t, rng(400 + n)));

  atlas = new THREE.CanvasTexture(c);
  atlas.anisotropy = 4;
  atlas.colorSpace = THREE.NoColorSpace;

  // Pfützen: Form im Grünkanal (so liest three.js alphaMap), zwei Kacheln nebeneinander
  const p = document.createElement('canvas');
  p.width = 512;
  p.height = 256;
  const pg = p.getContext('2d');
  const pimg = pg.createImageData(512, 256);
  for (let n = 0; n < 2; n++) {
    for (let j = 0; j < 256; j++) {
      for (let i = 0; i < 256; i++) {
        const u = (i + 0.5) / 256, v = (j + 0.5) / 256;
        const a = smooth(1, 0.88, blob(u, v, 500 + n, 1.2)) * edge(u, v);
        const k = (j * 512 + n * 256 + i) * 4;
        pimg.data[k] = pimg.data[k + 1] = pimg.data[k + 2] = Math.round(a * 255);
        pimg.data[k + 3] = 255;
      }
    }
  }
  pg.putImageData(pimg, 0, 0);
  puddleMap = new THREE.CanvasTexture(p);
  puddleMap.colorSpace = THREE.NoColorSpace;
}

// ---------- Plätze ----------

// Sammelt Vierecke: Mitte, Achsen (halbe Breite entlang t, halbe Höhe entlang b), Bildausschnitt, Farbe
function quads() {
  const pos = [], uv = [], col = [];
  return {
    pos, uv, col,
    add(c, t, b, hw, hh, [u0, v0, u1, v1], color = [1, 1, 1]) {
      const corner = (st, sb) => [0, 1, 2].map(k => c[k] + t[k] * hw * st + b[k] * hh * sb);
      const p = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, -1), corner(1, 1), corner(-1, 1)];
      const q = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
      for (let i = 0; i < 6; i++) { pos.push(...p[i]); uv.push(...q[i]); col.push(...color); }
    },
    geometry() {
      if (!pos.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    },
  };
}

const rect = ([x, y, w, h], size = SIZE, sizeY = SIZE) => [x / size, 1 - (y + h) / sizeY, (x + w) / size, 1 - y / sizeY];
const mix = (tint, s) => tint.map(c => 1 - (1 - c) * s);

export function buildGrime(world) {
  textures();
  let seed = 7;
  for (const ch of world.name ?? '') seed = Math.imul(seed, 31) + ch.charCodeAt(0) | 0;
  const r = rng(seed);
  const pick = list => list[Math.floor(r() * list.length)];
  const between = (a, b) => a + r() * (b - a);

  const solid = world.boxes;
  const inside = (p, skip) => solid.some(b => b !== skip &&
    p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1] && p[2] > b.min[2] && p[2] < b.max[2]);
  const inZone = p => (world.zones ?? []).some(z => p[0] > z.min[0] && p[0] < z.max[0] && p[2] > z.min[2] && p[2] < z.max[2]);
  // Oberkante des Bodens unter einem Punkt zwischen y0 und y1 (höchste), sonst null
  const floorAt = (x, z, y0, y1) => {
    let top = null;
    for (const b of solid) {
      if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] >= y0 && b.max[1] <= y1) {
        if (top === null || b.max[1] > top) top = b.max[1];
      }
    }
    return top;
  };

  const decals = quads();
  const tally = {};
  const note = k => { tally[k] = (tally[k] ?? 0) + 1; };
  const puddles = quads();
  const at = (o, t, b, n, u, v, out) => [0, 1, 2].map(k => o[k] + t[k] * u + b[k] * v + n[k] * out);
  // Ein Viereck auf einer Fläche ist nur frei, wenn vor allen vier Ecken und der Mitte nichts steht
  const free = (o, t, b, n, u, v, hw, hh, host) =>
    [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, c]) => !inside(at(o, t, b, n, u + a * hw * 0.95, v + c * hh * 0.95, 0.04), host));

  // ----- Wände -----
  // Niedrige Schmuckblöcke am Boden (Steinsockel, untere Containerschienen) stehen vor der Wand und verdecken deren
  // Fuß, sie bekommen den Schmutzrand selbst (nur den, keine Spuren und Risse)
  const plinths = world.deko.filter(d => !d.form && d.min[1] < 0.3 && d.max[1] - d.min[1] <= 1.2);
  for (const box of [...solid, ...plinths]) {
    const deko = !solid.includes(box);
    if (box.hidden || NOT_WALLS.has(box.type)) continue;
    const look = lookFor(box, world);
    if (!WALL_LOOKS.has(look) && !(deko && look === 'stahl')) continue;
    const height = box.max[1] - box.min[1];
    if (height < (deko ? 0.1 : 1)) continue;
    const metal = look === 'wellblech' || look === 'stahl';
    for (const [axis, side] of [[0, 1], [0, -1], [2, 1], [2, -1]]) {
      const n = [0, 0, 0];
      n[axis] = side;
      const t = axis === 0 ? [0, 0, -side] : [side, 0, 0]; // nach rechts, wenn man auf die Fläche schaut
      const b = [0, 1, 0];
      const other = 2 - axis;
      const width = box.max[other] - box.min[other];
      // o: unten links der Fläche (in Blickrichtung), u läuft entlang t, v nach oben
      const o = [0, 0, 0];
      o[axis] = side > 0 ? box.max[axis] : box.min[axis];
      o[other] = t[other] > 0 ? box.min[other] : box.max[other];
      o[1] = box.min[1];
      const out = 0.015;

      // Schmutzrand am Fuß, in Stücken von einem Meter, damit Ecken und Anbauten ausgespart bleiben
      const footH = deko ? height : Math.min(height * 0.6, between(0.7, 1.2));
      const foot = rect(TILES.fuss);
      const footTint = mix(TINT.fuss, metal || look === 'bretter' ? 0.7 : 1);
      for (let s = 0; s < width; s += 1) {
        const len = Math.min(1, width - s);
        const mid = at(o, t, b, n, s + len / 2, 0, 0.1);
        const ground = floorAt(mid[0], mid[2], box.min[1] - 0.05, box.max[1] - (deko ? 0.05 : 0.3));
        if (ground === null) continue;
        const h = Math.min(footH, box.max[1] - ground);
        const v = ground - box.min[1] + h / 2;
        if (!free(o, t, b, n, s + len / 2, v, len / 2, h / 2, box)) continue;
        const uA = (s % FOOT_LEN) / FOOT_LEN; // Stück s beginnt im Bild bei s mod 4 m, so läuft der Rand nahtlos weiter
        const uB = uA + len / FOOT_LEN;
        decals.add(at(o, t, b, n, s + len / 2, v, out), t, b, len / 2, h / 2,
          [foot[0] + (foot[2] - foot[0]) * uA, foot[1], foot[0] + (foot[2] - foot[0]) * uB, foot[3]], footTint);
        note('fuss');
      }

      // Laufspuren von der Oberkante, wo nichts darauf steht
      if (deko) continue;
      if (height >= 2 && look !== 'bretter' && look !== 'ziegel') {
        const count = Math.floor(width / 2.5 * between(0.4, 1.2));
        for (let k = 0; k < count; k++) {
          const hw = between(0.25, 0.45);
          if (width < hw * 2 + 0.2) break;
          const u = between(hw + 0.1, width - hw - 0.1);
          const hh = Math.min(between(0.6, 1.3), height * 0.4);
          const above = at(o, t, b, n, u, height + 0.05, -0.05);
          if (inside(above)) continue;
          const v = height - hh;
          if (!free(o, t, b, n, u, v, hw, hh, box)) continue;
          decals.add(at(o, t, b, n, u, v, out + 0.002), t, b, hw, hh, rect(pick(TILES.spur)), metal ? TINT.rost : TINT.spur);
          note('spur');
        }
      }

      // Risse in Putz und Beton
      if (look === 'putz' || look === 'beton') {
        const count = Math.round(width * height / 14 * between(0.3, 1.3));
        for (let k = 0; k < count; k++) {
          const hs = between(0.3, 0.65);
          if (width < hs * 2 + 0.2 || height < hs * 2 + 0.2) break;
          const u = between(hs + 0.1, width - hs - 0.1);
          const v = between(hs + 0.3, height - hs - 0.1);
          if (!free(o, t, b, n, u, v, hs, hs, box)) continue;
          decals.add(at(o, t, b, n, u, v, out + 0.004), t, b, hs, hs, rect(pick(TILES.riss)), TINT.riss);
          note('riss');
        }
      }
    }
  }

  // ----- Boden -----
  const floors = solid.filter(b => !b.hidden && (b.type === 'boden' ||
    (lookFor(b, world) === 'beton' && b.max[1] <= 1.2 && (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) >= 6)));
  const up = [0, 1, 0];
  for (const box of floors) {
    const look = lookFor(box, world);
    const area = (box.max[0] - box.min[0]) * (box.max[2] - box.min[2]);
    const y = box.max[1];
    const placeFloor = hs => {
      for (let tries = 0; tries < 6; tries++) {
        const c = [between(box.min[0] + hs, box.max[0] - hs), y, between(box.min[2] + hs, box.max[2] - hs)];
        if (c[0] !== c[0] || c[2] !== c[2]) return null;
        const pts = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b2]) => [c[0] + a * hs, y + 0.04, c[2] + b2 * hs]);
        if (pts.every(p => !inside(p, box) && !inZone(p) && floorAt(p[0], p[2], y - 0.01, y + 0.01) === y)) return c;
      }
      return null;
    };
    const spin = () => { const a = r() * Math.PI * 2; return [[Math.cos(a), 0, Math.sin(a)], [Math.sin(a), 0, -Math.cos(a)]]; }; // Vorderseite nach oben
    const put = (list, hs, tile, tint, lift) => {
      const c = placeFloor(hs);
      if (!c) return null;
      const [t, b] = spin();
      list.add([c[0], y + lift, c[2]], t, b, hs, hs, tile, tint);
      note(tint === TINT.oel ? 'oel' : tint === TINT.riss ? 'bodenriss' : list === puddles ? 'pfuetze' : 'fleck');
      return c;
    };
    const wet = look === 'pflaster' || look === 'erde';
    const oily = look === 'beton';
    const n = (per, k = 1) => Math.round(area / per * between(0.6, 1.2) * k);
    for (let k = 0; k < n(40); k++) put(decals, between(0.8, 2), rect(pick(TILES.fleck)), mix(TINT.fleck, look === 'erde' ? 0.6 : 1), 0.012);
    if (oily) {
      for (let k = 0; k < n(60); k++) put(decals, between(0.5, 1.4), rect(pick(TILES.oel)), TINT.oel, 0.014);
      for (let k = 0; k < n(45); k++) put(decals, between(0.4, 0.9), rect(pick(TILES.riss)), TINT.riss, 0.016);
    }
    if (wet) {
      for (let k = 0; k < n(110); k++) {
        const hs = between(0.6, 1.4);
        const c = put(puddles, hs, rect([pick([0, 256]), 0, 256, 256], 512, 256), [1, 1, 1], 0.02);
        // Nasser, dunklerer Rand um die Pfütze
        if (c) decals.add([c[0], y + 0.013, c[2]], [1, 0, 0], [0, 0, -1], hs * 1.35, hs * 1.35, rect(pick(TILES.fleck)), TINT.nass);
      }
    }
  }

  const group = new THREE.Group();
  const decalGeo = decals.geometry();
  if (decalGeo) {
    const mesh = new THREE.Mesh(decalGeo, decalMaterial());
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  const puddleGeo = puddles.geometry();
  if (puddleGeo) {
    const mesh = new THREE.Mesh(puddleGeo, new THREE.MeshStandardMaterial({
      color: 0x1c1f22, roughness: 0.12, metalness: 0, alphaMap: puddleMap, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.7,
    }));
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  group.userData.count = tally;
  return group;
}

// Bild × (Farbe an dunklen Stellen), im Nebel zur Ferne hin ausgeblendet
function decalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vDepth;
      void main() {
        vUv = uv;
        vTint = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform float fogNear;
      uniform float fogFar;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vDepth;
      void main() {
        float a = texture2D(map, vUv).r * (1.0 - smoothstep(fogNear, fogFar, vDepth));
        gl_FragColor = vec4(mix(vec3(1.0), vTint, a), 1.0);
      }`,
    vertexColors: true,
    fog: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
  });
}
