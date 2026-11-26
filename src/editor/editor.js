// Kartenbauer: eigene Karten im Spiel bauen. Draufsicht mit freier Kamera; Wände, Blöcke, Kisten, Treppen,
// Startpunkte und Modelle setzen, verschieben und ändern. Mehrfachauswahl, Kopieren, Spiegeln für faire Hälften,
// Rückgängig. Karten im Browser speichern, als JSON-Datei aus- und einlesen, prüfen und mit Bots Probe spielen.
// Die Karte hat dasselbe Format wie src/maps/*.json; die Kollision der Modelle und die Wegpunkte entstehen erst
// beim Spielen und Ausgeben (buildMap).

import * as THREE from 'three';
import { BODY } from '../config.js';
import { createWorld, overlaps, zoneAt } from '../game/world.js';
import { buildWaypoints, walk } from '../game/wegpunkte.js';

const DRAFT_KEY = 'arena-shooter.kartenbauer-entwurf';
const STORE_KEY = 'arena-shooter.eigene-karten';
const MAX_STEP = 0.45; // höhere Stufen schafft niemand (MOVE.stepHeight)

const BLOCK_TYPES = {
  boden: ['Boden', '#9a9184'], wand: ['Wand', '#cfc8bb'], beton: ['Beton', '#a8a49c'], ziegel: ['Ziegel', '#a5553f'],
  holz: ['Holz', '#8a6440'], stahl: ['Stahl', '#7f8c99'], kiste: ['Kiste', '#b07a43'], container: ['Container', '#3f7a4a'],
  plattform: ['Plattform', '#7f8c99'], dach: ['Dach', '#8e4a3a'], hecke: ['Hecke', '#3f6b38'],
};
const LOOKS = ['beton', 'putz', 'stein', 'ziegel', 'pflaster', 'bretter', 'kiste', 'dachziegel', 'wellblech', 'stahl',
  'erde', 'sand', 'laub', 'glatt'];
const DAYTIME_NAMES = { mittag: 'Mittag', morgen: 'Morgen', abend: 'Abend' };
const DIRS = { '-z': 'Norden', '+x': 'Osten', '+z': 'Süden', '-x': 'Westen' };
const PROP_NAMES = { baum: 'Baum', brunnen: 'Brunnen', marktstand: 'Marktstand' };
const KIND_NAMES = { box: 'Block', stairs: 'Treppe', spawn: 'Startpunkt', prop: 'Modell', zone: 'Zone' };
const ZONE_NAMES = { wasser: 'Wasser', absturz: 'Absturz' };

// Kollision der Modelle bei Drehung 0, relativ zum Fußpunkt (Maße wie in tools/karte_altstadt.mjs)
const PROP_BOXES = {
  baum: [['stamm', [-0.25, 0, -0.25], [0.25, 3, 0.25], '#6b4a2f'], ['laub', [-1.5, 2.6, -1.5], [1.5, 5, 1.5], '#4f7d3f']],
  brunnen: [['brunnen', [-1.5, 0, -1.5], [1.5, 0.9, 1.5], '#9a958c'], ['brunnen', [-0.25, 0.9, -0.25], [0.25, 2.6, 0.25], '#9a958c'],
    ['dach', [-0.9, 2.6, -0.9], [0.9, 2.8, 0.9], '#8e4a3a']],
  marktstand: [['kiste', [-1.3, 0, -0.5], [1.3, 1, 0.5]],
    ...[[-1.2, -0.4], [-1.2, 0.4], [1.2, -0.4], [1.2, 0.4]].map(([x, z]) => ['pfosten', [x - 0.05, 0, z - 0.05], [x + 0.05, 2.3, z + 0.05]]),
    ['stoff', [-1.5, 2.3, -1.2], [1.5, 2.4, 1.2]]],
};

const TOOLS = [
  ['select', 'Auswählen', 'Klicken wählt, Ziehen verschiebt, Shift+Klick wählt dazu, Ziehen auf freier Fläche wählt einen Bereich'],
  ['wand', 'Wand', 'Ziehen: Wand von Punkt zu Punkt'],
  ['block', 'Block', 'Ziehen: Fläche aufziehen'],
  ['kiste', 'Kiste', 'Klicken, auch auf andere Kisten'],
  ['treppe', 'Treppe', 'Klicken, R dreht'],
  ['spawnA', 'Start Blau', 'Klicken'],
  ['spawnB', 'Start Orange', 'Klicken'],
  ['baum', 'Baum', 'Klicken, R dreht'],
  ['brunnen', 'Brunnen', 'Klicken'],
  ['marktstand', 'Marktstand', 'Klicken, R dreht'],
  ['wasser', 'Wasser', 'Ziehen: Wasserfläche, wer hineinfällt, ist raus'],
  ['absturz', 'Absturz', 'Ziehen: Abgrund (dunkle Fläche), wer hineingerät, ist raus'],
];

const round = v => Math.round(v * 1000) / 1000;
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function newMap(name = 'Meine Karte', w = 40, d = 40) {
  const hx = w / 2;
  const hz = d / 2;
  const wall = (min, max) => ({ type: 'wand', min, max, color: '#a39c90', look: 'stein' });
  const spawns = [];
  for (const [team, x, yaw] of [['A', -hx + 3, -Math.PI / 2], ['B', hx - 3, Math.PI / 2]]) {
    for (const z of [-3, -1, 1, 3]) spawns.push({ team, pos: [x, 0, z], yaw: round(yaw) });
  }
  return {
    name, killY: -20, licht: 'mittag', looks: { boden: 'beton' },
    boxes: [
      { type: 'boden', min: [-hx, -1, -hz], max: [hx, 0, hz], color: '#8f877b' },
      wall([-hx - 1, 0, -hz - 1], [-hx, 5, hz + 1]), wall([hx, 0, -hz - 1], [hx + 1, 5, hz + 1]),
      wall([-hx, 0, -hz - 1], [hx, 5, -hz]), wall([-hx, 0, hz], [hx, 5, hz + 1]),
    ],
    stairs: [], spawns, props: [], zones: [], deko: [],
  };
}

function rotateBox(min, max, yaw, at) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const xs = [];
  const zs = [];
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
    xs.push(x * c + z * s);
    zs.push(-x * s + z * c);
  }
  return {
    min: [round(at[0] + Math.min(...xs)), round(at[1] + min[1]), round(at[2] + Math.min(...zs))],
    max: [round(at[0] + Math.max(...xs)), round(at[1] + max[1]), round(at[2] + Math.max(...zs))],
  };
}

// Kollisionsblöcke eines Modells (nicht gezeichnet, an ihrer Stelle steht das Modell)
function propBoxes(p) {
  return (PROP_BOXES[p.model] ?? []).map(([type, min, max, color]) => ({
    type, ...rotateBox(min, max, p.yaw ?? 0, p.pos), color: p.model === 'marktstand' && type === 'stoff' ? p.color : color, hidden: true,
  }));
}

function stairBoxes(t) {
  return createWorld({ boxes: [], stairs: [t], spawns: [] }).boxes;
}

function union(list) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of list) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], b.min[i]);
    max[i] = Math.max(max[i], b.max[i]);
  }
  return { min, max };
}

const boxLike = kind => kind === 'box' || kind === 'zone';

function itemBounds(kind, it) {
  if (boxLike(kind)) return it;
  if (kind === 'stairs') return union(stairBoxes(it));
  if (kind === 'prop') return union(propBoxes(it));
  const [x, y, z] = it.pos;
  return { min: [x - 0.5, y, z - 0.5], max: [x + 0.5, y + 1.8, z + 0.5] };
}

function moveItem(kind, it, dx, dz) {
  const vs = boxLike(kind) ? [it.min, it.max] : kind === 'stairs' ? [it.start] : [it.pos];
  for (const v of vs) { v[0] = round(v[0] + dx); v[2] = round(v[2] + dz); }
}

// Spiegelbild an der Mittellinie: axis 0 = Ost–West (x → -x), 2 = Nord–Süd (z → -z). Teams tauschen die Seite.
function mirrorItem(kind, it, axis) {
  const m = clone(it);
  if (boxLike(kind)) {
    m.min[axis] = round(-it.max[axis]);
    m.max[axis] = round(-it.min[axis]);
    return m;
  }
  if (kind === 'stairs') {
    m.start[axis] = round(-it.start[axis]);
    if (it.dir[1] === (axis === 0 ? 'x' : 'z')) m.dir = (it.dir[0] === '+' ? '-' : '+') + it.dir[1];
    return m;
  }
  m.pos[axis] = round(-it.pos[axis]);
  const yaw = it.yaw ?? 0;
  m.yaw = round(axis === 0 ? -yaw : Math.PI - yaw);
  m.yaw = round(((m.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
  if (kind === 'spawn') m.team = it.team === 'A' ? 'B' : 'A';
  return m;
}

// Karte zum Spielen und Ausgeben: Kollision der Modelle dazu, Wegpunkte neu
export function buildMap(map) {
  const out = clone(map);
  out.boxes = [...map.boxes, ...map.props.flatMap(propBoxes)];
  const wp = buildWaypoints(out);
  out.waypoints = { nodes: wp.nodes, links: wp.links };
  return out;
}

// Prüft die Karte. problems: so nicht spielbar; warnings: spielbar, aber schlecht
export function checkMap(map) {
  const built = clone(map);
  built.boxes = [...map.boxes, ...map.props.flatMap(propBoxes)];
  const wp = buildWaypoints(built);
  built.waypoints = { nodes: wp.nodes, links: wp.links };
  const world = createWorld(built);
  const problems = [];
  const warnings = [];
  const badSpawns = [];
  const hw = BODY.halfWidth;
  for (const team of ['A', 'B']) {
    const n = map.spawns.filter(s => s.team === team).length;
    const name = team === 'A' ? 'Blau' : 'Orange';
    if (!n) problems.push(`Team ${name} hat keinen Startpunkt`);
    else if (n < 4) warnings.push(`Team ${name} hat nur ${n} Startpunkt${n > 1 ? 'e' : ''} (vier Spieler je Team)`);
  }
  if (wp.nodes.length < 2) problems.push('Keine Wege für die Bots gefunden — fehlt der Boden?');
  map.spawns.forEach((s, i) => {
    const [x, y, z] = s.pos;
    const label = `Start ${s.team === 'A' ? 'Blau' : 'Orange'} bei ${x} / ${z}`;
    if (overlaps(world, x - hw, y + 0.02, z - hw, x + hw, y + BODY.standHeight, z + hw)) {
      problems.push(`${label} steckt in einem Block`);
      badSpawns.push(i);
      return;
    }
    if (!overlaps(world, x - 0.05, y - 0.1, z - 0.05, x + 0.05, y - 0.01, z + 0.05)) {
      warnings.push(`${label} schwebt (fällt beim Start)`);
      badSpawns.push(i);
      return;
    }
    // Erreicht man von hier mit der echten Bewegung einen Wegpunkt des Netzes?
    const near = wp.nodes
      .filter(n => Math.abs(n[1] - y) < 1.5)
      .sort((a, b) => Math.hypot(a[0] - x, a[2] - z) - Math.hypot(b[0] - x, b[2] - z))
      .slice(0, 4);
    if (!near.some(n => Math.hypot(n[0] - x, n[2] - z) < 8 && walk(world, s.pos, n) && walk(world, n, s.pos))) {
      warnings.push(`${label} ist vom Wegenetz abgeschnitten (eingesperrt?)`);
      badSpawns.push(i);
    }
  });
  map.spawns.forEach(s => {
    const z = zoneAt(world, ...s.pos);
    if (z) problems.push(`Start ${s.team === 'A' ? 'Blau' : 'Orange'} bei ${s.pos[0]} / ${s.pos[2]} liegt in einer ${ZONE_NAMES[z.kind]}zone`);
  });
  map.stairs.forEach(t => {
    if (t.rise > MAX_STEP) warnings.push(`Treppe bei ${t.start[0]} / ${t.start[2]}: Stufen über ${MAX_STEP} m schafft niemand`);
  });
  // Auf Baumkronen, Brunnendach und Marktstand will niemand hin
  const onProp = n => world.boxes.some(b => b.hidden && Math.abs(b.max[1] - n[1]) < 0.01
    && n[0] >= b.min[0] && n[0] <= b.max[0] && n[2] >= b.min[2] && n[2] <= b.max[2]);
  // Punkte direkt am Rand von Wasser und Absturz verlieren nur ihre Verbindungen, erreichbar sind sie trotzdem
  const nearZone = n => world.zones.some(z => n[0] > z.min[0] - 1.5 && n[0] < z.max[0] + 1.5 && n[2] > z.min[2] - 1.5 && n[2] < z.max[2] + 1.5);
  const dropped = wp.dropped.filter(n => !onProp(n) && !nearZone(n));
  if (dropped.length) warnings.push(dropped.length === 1 ? '1 Stelle ist nicht erreichbar (roter Punkt)' : `${dropped.length} Stellen sind nicht erreichbar (rote Punkte)`);
  return { problems, warnings, badSpawns, dropped, built };
}

// Eingelesene Karte prüfen und auf das Format des Kartenbauers bringen (Modell-Kollision fällt weg, kommt neu)
export function readMap(data) {
  if (!data || !Array.isArray(data.boxes) || !Array.isArray(data.spawns)) throw new Error('Keine Karte von Crate & Cover');
  const vec = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  const map = {
    ...data,
    name: String(data.name ?? 'Eingelesene Karte').slice(0, 40),
    boxes: data.boxes.filter(b => b && vec(b.min) && vec(b.max) && !b.hidden),
    stairs: (data.stairs ?? []).filter(t => t && vec(t.start) && DIRS[t.dir] && t.steps > 0),
    spawns: data.spawns.filter(s => s && vec(s.pos) && (s.team === 'A' || s.team === 'B')),
    props: (data.props ?? []).filter(p => p && vec(p.pos) && PROP_BOXES[p.model]),
    zones: (data.zones ?? []).filter(z => z && vec(z.min) && vec(z.max) && ZONE_NAMES[z.kind]),
    deko: Array.isArray(data.deko) ? data.deko : [],
  };
  delete map.waypoints;
  delete map.targets;
  return map;
}

export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {}; } catch { return {}; }
}

function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; } catch { return false; }
}

// Strahl gegen achsenparallele Box: Abstand und Seite (Normale) oder null
function rayBox(o, d, min, max) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - o[i]) / d[i];
    let t2 = (max[i] - o[i]) / d[i];
    const s = -Math.sign(d[i]);
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || axis < 0) return null;
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return { t: Math.max(tmin, 0), normal };
}

export function createEditor({ view, canvas, onPlay, onExit }) {
  const $ = id => document.getElementById(id);
  const root = $('editor');
  const props = $('ed-props');
  const status = $('ed-status');
  const help = $('ed-help');
  const rectEl = $('ed-rect');

  let map = loadDraft() ?? newMap();
  let tool = 'select';
  let sel = []; // [{ kind: 'box' | 'stairs' | 'spawn' | 'prop', index }]
  let active = false;
  let message = '';
  let checkInfo = null;
  let grid = 0.5;
  let clipboard = null;
  let mouseRay = null;
  let undoList = [];
  let redoList = [];
  let snapshot = JSON.stringify(map);

  const snap = v => Math.round(v / grid) * grid;
  const lists = () => ({ box: map.boxes, stairs: map.stairs, spawn: map.spawns, prop: map.props, zone: map.zones });
  const itemOf = s => lists()[s.kind][s.index];
  const one = () => (sel.length === 1 ? sel[0] : null);
  const isSelected = s => sel.some(x => x.kind === s.kind && x.index === s.index);

  const cam = { x: 0, z: 0, dist: 45, yaw: 0, pitch: -1.0 };
  const keys = new Set();

  // Hilfsobjekte über der Karte: Raster, Auswahl, Vorschau, Wege
  const overlay = new THREE.Group();
  overlay.visible = false;
  view.scene.add(overlay);
  const gridMesh = new THREE.GridHelper(200, 400, 0xffffff, 0xffffff);
  gridMesh.material.transparent = true;
  gridMesh.material.opacity = 0.18;
  gridMesh.material.depthWrite = false;
  gridMesh.position.y = 0.015;
  overlay.add(gridMesh);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(unitBox);
  const selMat = new THREE.LineBasicMaterial({ color: 0xffd27a, depthTest: false });
  const selGroup = new THREE.Group();
  overlay.add(selGroup);
  const ghost = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.visible = false;
  overlay.add(ghost);
  let marks = null;
  // Absturzzonen im Kartenbauer zusätzlich als rote Kästen, damit man ihre Tiefe sieht
  const dropGroup = new THREE.Group();
  overlay.add(dropGroup);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.25, depthWrite: false });

  function placeBox(obj, b) {
    obj.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    obj.scale.set(Math.max(b.max[0] - b.min[0], 0.05), Math.max(b.max[1] - b.min[1], 0.05), Math.max(b.max[2] - b.min[2], 0.05));
  }

  const bounds = s => itemBounds(s.kind, itemOf(s));

  // ---- Karte zeichnen, sichern, Rückgängig ----

  function rebuild(record = true) {
    const now = JSON.stringify(map);
    if (record && now !== snapshot) {
      undoList.push(snapshot);
      if (undoList.length > 100) undoList.shift();
      redoList = [];
    }
    snapshot = now;
    view.setWorld(createWorld({ ...map, boxes: [...map.boxes, ...map.props.flatMap(propBoxes)] }), true);
    dropGroup.clear();
    for (const z of map.zones) {
      if (z.kind !== 'absturz') continue;
      const m = new THREE.Mesh(unitBox, dropMat);
      placeBox(m, z);
      dropGroup.add(m);
    }
    try { localStorage.setItem(DRAFT_KEY, now); } catch {}
    clearMarks();
    showSelection();
    showProps();
    showStatus();
  }

  function undo() {
    if (!undoList.length) { say('Nichts mehr rückgängig zu machen'); return; }
    redoList.push(snapshot);
    map = JSON.parse(undoList.pop());
    sel = [];
    showMapSettings();
    rebuild(false);
    say('Rückgängig');
  }

  function redo() {
    if (!redoList.length) { say('Nichts zu wiederholen'); return; }
    undoList.push(snapshot);
    map = JSON.parse(redoList.pop());
    sel = [];
    showMapSettings();
    rebuild(false);
    say('Wiederholt');
  }

  function loadDraft() {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      return d ? readMap(JSON.parse(d)) : null;
    } catch { return null; }
  }

  function setMap(m) {
    map = m;
    sel = [];
    undoList = [];
    redoList = [];
    snapshot = JSON.stringify(map);
    const floor = map.boxes.find(b => b.type === 'boden');
    const size = floor ? Math.max(floor.max[0] - floor.min[0], floor.max[2] - floor.min[2]) : 40;
    Object.assign(cam, { x: 0, z: 0, dist: Math.max(20, size * 1.1), yaw: 0, pitch: -1.0 });
    showMapSettings();
    showStore();
    rebuild(false);
  }

  function say(text) {
    message = text;
    showStatus();
  }

  function showStatus() {
    const a = map.spawns.filter(s => s.team === 'A').length;
    const b = map.spawns.filter(s => s.team === 'B').length;
    const parts = [`${map.boxes.length} Blöcke`, `${map.stairs.length} Treppen`, `${map.props.length} Modelle`, `${map.zones.length} Zonen`,
      `Start Blau ${a}`, `Start Orange ${b}`];
    if (sel.length > 1) parts.push(`${sel.length} ausgewählt`);
    let html = parts.join(' · ');
    if (checkInfo) html += checkInfo;
    if (message) html += `<br><b>${esc(message)}</b>`;
    status.innerHTML = html;
  }

  function clearMarks() {
    if (marks) {
      overlay.remove(marks);
      marks.traverse(o => o.geometry?.dispose());
      marks = null;
    }
    checkInfo = null;
  }

  // Karte prüfen: Wege in Pink, unerreichbare Stellen und schlechte Startpunkte in Rot, Meldungen unten
  function runCheck() {
    clearMarks();
    const result = checkMap(map);
    const { nodes, links } = result.built.waypoints;
    marks = new THREE.Group();
    const pts = [];
    for (const [a, b] of links) pts.push(nodes[a][0], nodes[a][1] + 0.1, nodes[a][2], nodes[b][0], nodes[b][1] + 0.1, nodes[b][2]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff4fd8, depthTest: false }));
    lines.renderOrder = 9;
    marks.add(lines);
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false });
    for (const n of result.dropped) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), red);
      dot.position.set(n[0], n[1] + 0.25, n[2]);
      dot.renderOrder = 9;
      marks.add(dot);
    }
    for (const i of result.badSpawns) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), red);
      ring.rotation.x = -Math.PI / 2;
      const [x, y, z] = map.spawns[i].pos;
      ring.position.set(x, y + 0.05, z);
      ring.renderOrder = 9;
      marks.add(ring);
    }
    overlay.add(marks);
    const lines2 = [...result.problems.map(p => `<span class="bad">✗ ${esc(p)}</span>`), ...result.warnings.map(w => `<span class="warn">! ${esc(w)}</span>`)];
    checkInfo = ` · ${nodes.length} Wegpunkte` + (lines2.length ? `<br>${lines2.slice(0, 6).join('<br>')}` : '<br><span class="good">✓ Keine Probleme gefunden</span>');
    message = '';
    showStatus();
    return result;
  }

  // ---- Auswahl und Eigenschaften ----

  function select(list) {
    sel = list;
    showSelection();
    showProps();
    showStatus();
  }

  function showSelection() {
    sel = sel.filter(s => itemOf(s));
    selGroup.clear();
    selGroup.position.set(0, 0, 0);
    for (const s of sel) {
      const box = new THREE.LineSegments(edges, selMat);
      box.renderOrder = 10;
      placeBox(box, bounds(s));
      selGroup.add(box);
    }
  }

  function field(label, input) {
    return `<label><span>${label}</span>${input}</label>`;
  }
  const num = (key, value, step = 0.5, min = '') => `<input type="number" data-k="${key}" value="${round(value)}" step="${step}" min="${min}">`;
  const opts = (key, list, value) => `<select data-k="${key}">${Object.entries(list).map(([v, t]) => `<option value="${v}"${v === value ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const groupButtons = `<div class="ed-row"><button data-act="dup">Verdoppeln</button><button data-act="del">Löschen</button></div>
    <div class="ed-row"><button data-act="mirrorX" title="Spiegelbild an der Mittellinie Nord–Süd, Teams tauschen">Spiegeln Ost–West</button></div>
    <div class="ed-row"><button data-act="mirrorZ" title="Spiegelbild an der Mittellinie Ost–West, Teams tauschen">Spiegeln Nord–Süd</button></div>`;

  function showProps() {
    if (!sel.length) {
      props.innerHTML = `<p class="ed-hint">${TOOLS.find(t => t[0] === tool)[2]}.<br><br>Kamera: WASD oder Pfeile schieben, Mausrad zoomt, rechte Maustaste dreht und neigt, mittlere Maustaste schiebt, Q/E drehen.<br><br>Entf löscht, Strg+D verdoppelt, Strg+C/V kopiert und fügt an der Maus ein, Strg+Z macht rückgängig, Strg+Y wiederholt, R dreht, Strg+A wählt alles, Esc hebt die Auswahl auf.<br><br>Faire Hälften: eine Seite bauen, mit Ziehen auswählen, Spiegeln.</p>`;
      return;
    }
    if (sel.length > 1) {
      const count = {};
      for (const s of sel) count[s.kind] = (count[s.kind] ?? 0) + 1;
      props.innerHTML = `<h3>${sel.length} ausgewählt</h3><p class="ed-hint">${Object.entries(count).map(([k, n]) => `${n} × ${KIND_NAMES[k]}`).join(', ')}.<br>Ziehen verschiebt alle zusammen.</p>${groupButtons}`;
      return;
    }
    const s = sel[0];
    const it = itemOf(s);
    let html = '';
    if (s.kind === 'box') {
      const looks = { '': 'Standard', ...Object.fromEntries(LOOKS.map(l => [l, l[0].toUpperCase() + l.slice(1)])) };
      html = `<h3>Block</h3>`
        + field('Art', opts('type', Object.fromEntries(Object.entries(BLOCK_TYPES).map(([k, v]) => [k, v[0]])), it.type))
        + field('Breite (x)', num('w', it.max[0] - it.min[0], 0.1, 0.1))
        + field('Tiefe (z)', num('d', it.max[2] - it.min[2], 0.1, 0.1))
        + field('Höhe', num('h', it.max[1] - it.min[1], 0.1, 0.1))
        + field('Unterkante', num('y', it.min[1], 0.1))
        + field('Farbe', `<input type="color" data-k="color" value="${it.color ?? BLOCK_TYPES[it.type]?.[1] ?? '#999999'}">`)
        + field('Oberfläche', opts('look', looks, it.look ?? ''));
    } else if (s.kind === 'zone') {
      html = `<h3>${ZONE_NAMES[it.kind]}</h3>`
        + field('Art', opts('zkind', ZONE_NAMES, it.kind))
        + field('Breite (x)', num('w', it.max[0] - it.min[0], 0.1, 0.1))
        + field('Tiefe (z)', num('d', it.max[2] - it.min[2], 0.1, 0.1))
        + field('Oberkante', num('top', it.max[1], 0.1))
        + field('Höhe', num('h', it.max[1] - it.min[1], 0.1, 0.1))
        + `<p class="ed-hint">${it.kind === 'wasser' ? 'Wasser zeigt seine Oberfläche auf der Oberkante. ' : 'Im Spiel ein dunkler Abgrund auf der Oberkante. '}Wer mit den Füßen nicht höher als die Oberkante darüber kommt, ist raus. Bots meiden die Fläche.</p>`;
    } else if (s.kind === 'stairs') {
      html = `<h3>Treppe</h3>`
        + field('Hinauf nach', opts('dir', DIRS, it.dir))
        + field('Stufen', num('steps', it.steps, 1, 1))
        + field('Stufenhöhe', num('rise', it.rise, 0.05, 0.05))
        + field('Stufentiefe', num('depth', it.depth, 0.05, 0.2))
        + field('Breite', num('width', it.width, 0.1, 0.8))
        + field('Unterkante', num('y', it.start[1], 0.1))
        + `<p class="ed-hint">Höhe oben: ${round(it.steps * it.rise)} m. Stufen über ${MAX_STEP} m schafft niemand.</p>`;
    } else if (s.kind === 'spawn') {
      html = `<h3>Startpunkt</h3>`
        + field('Team', opts('team', { A: 'Blau', B: 'Orange' }, it.team))
        + field('Blickrichtung (Grad)', num('deg', ((Math.round(it.yaw * 180 / Math.PI) % 360) + 360) % 360, 15))
        + field('Höhe', num('y', it.pos[1], 0.1));
    } else {
      html = `<h3>${PROP_NAMES[it.model]}</h3>`
        + field('Drehung (Grad)', opts('deg', { 0: '0', 90: '90', 180: '180', 270: '270' }, String(((Math.round((it.yaw ?? 0) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360)))
        + (it.model === 'marktstand' ? field('Stoff', `<input type="color" data-k="color" value="${it.color ?? '#b33a3a'}">`) : '');
    }
    props.innerHTML = html + groupButtons;
  }

  props.addEventListener('change', e => {
    const k = e.target.dataset.k;
    const s = one();
    if (!k || !s) return;
    const it = itemOf(s);
    const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'number' && !Number.isFinite(v)) return;
    if (boxLike(s.kind)) {
      const cx = (it.min[0] + it.max[0]) / 2;
      const cz = (it.min[2] + it.max[2]) / 2;
      if (k === 'zkind') it.kind = v;
      if (k === 'top') { const h = it.max[1] - it.min[1]; it.max[1] = round(v); it.min[1] = round(v - h); }
      if (k === 'w' && v > 0) { it.min[0] = round(cx - v / 2); it.max[0] = round(cx + v / 2); }
      if (k === 'd' && v > 0) { it.min[2] = round(cz - v / 2); it.max[2] = round(cz + v / 2); }
      if (k === 'h' && v > 0) it.max[1] = round(it.min[1] + v);
      if (k === 'y') { const h = it.max[1] - it.min[1]; it.min[1] = round(v); it.max[1] = round(v + h); }
      if (k === 'type') { it.type = v; it.color = BLOCK_TYPES[v][1]; }
      if (k === 'color') it.color = v;
      if (k === 'look') { if (v) it.look = v; else delete it.look; }
    } else if (s.kind === 'stairs') {
      if (k === 'dir') it.dir = v;
      if (k === 'steps' && v >= 1) it.steps = Math.min(40, Math.round(v));
      if (k === 'rise' && v > 0) it.rise = v;
      if (k === 'depth' && v > 0) it.depth = v;
      if (k === 'width' && v > 0) it.width = v;
      if (k === 'y') it.start[1] = round(v);
    } else if (s.kind === 'spawn') {
      if (k === 'team') it.team = v;
      if (k === 'deg') it.yaw = round(v * Math.PI / 180);
      if (k === 'y') it.pos[1] = round(v);
    } else {
      if (k === 'deg') it.yaw = round(Number(v) * Math.PI / 180);
      if (k === 'color') it.color = v;
    }
    rebuild();
  });

  props.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'del') remove();
    if (act === 'dup') duplicate();
    if (act === 'mirrorX') mirror(0);
    if (act === 'mirrorZ') mirror(2);
  });

  // Neue Dinge anhängen und als Auswahl setzen
  function addItems(items) {
    const added = [];
    for (const { kind, item } of items) {
      const list = lists()[kind];
      list.push(item);
      added.push({ kind, index: list.length - 1 });
    }
    sel = added;
  }

  function remove() {
    if (!sel.length) return;
    // Von hinten löschen, damit die übrigen Nummern stimmen
    for (const s of [...sel].sort((a, b) => b.index - a.index)) lists()[s.kind].splice(s.index, 1);
    sel = [];
    rebuild();
  }

  function selectedItems() {
    return sel.map(s => ({ kind: s.kind, item: clone(itemOf(s)) }));
  }

  function duplicate() {
    if (!sel.length) return;
    const items = selectedItems();
    for (const { kind, item } of items) moveItem(kind, item, 1, 1);
    addItems(items);
    rebuild();
  }

  function copy() {
    if (!sel.length) return;
    clipboard = selectedItems();
    say(`${clipboard.length} kopiert`);
  }

  // Einfügen an der Maus (Mitte der Gruppe auf den Mauspunkt), sonst versetzt
  function paste() {
    if (!clipboard) return;
    const items = clone(clipboard);
    const b = union(items.map(({ kind, item }) => itemBounds(kind, item)));
    const p = mouseRay && planePoint(mouseRay, b.min[1]);
    const dx = p ? snap(p[0] - (b.min[0] + b.max[0]) / 2) : 1;
    const dz = p ? snap(p[2] - (b.min[2] + b.max[2]) / 2) : 1;
    for (const { kind, item } of items) moveItem(kind, item, dx, dz);
    addItems(items);
    rebuild();
    say(`${items.length} eingefügt`);
  }

  // Spiegelkopie der Auswahl; was es spiegelgleich schon gibt (oder in der Mitte liegt), wird nicht verdoppelt
  function mirror(axis) {
    if (!sel.length) { say('Erst auswählen (Ziehen auf freier Fläche wählt einen Bereich)'); return; }
    // Vergleich mit Blickrichtung auf 0 bis 360 Grad gebracht (-90 Grad und 270 Grad sind dasselbe)
    const key = (kind, it) => kind + JSON.stringify({ ...it, yaw: it.yaw === undefined ? 0 : Math.round(((it.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 100) % 628 });
    const existing = new Set(Object.entries(lists()).flatMap(([kind, list]) => list.map(it => key(kind, it))));
    const items = [];
    for (const { kind, item } of selectedItems()) {
      const m = mirrorItem(kind, item, axis);
      if (!existing.has(key(kind, m))) items.push({ kind, item: m });
    }
    if (!items.length) { say('Alles schon spiegelgleich vorhanden'); return; }
    addItems(items);
    rebuild();
    say(`${items.length} gespiegelt${items.some(i => i.kind === 'spawn') ? ', Startpunkte mit Teamwechsel' : ''}`);
  }

  // R: Blöcke um 90 Grad (Breite und Tiefe tauschen), Treppen, Startpunkte und Modelle drehen
  function rotate() {
    const s = one();
    if (!s) return;
    const it = itemOf(s);
    if (boxLike(s.kind)) {
      const cx = (it.min[0] + it.max[0]) / 2;
      const cz = (it.min[2] + it.max[2]) / 2;
      const hw = (it.max[0] - it.min[0]) / 2;
      const hd = (it.max[2] - it.min[2]) / 2;
      it.min[0] = round(cx - hd); it.max[0] = round(cx + hd);
      it.min[2] = round(cz - hw); it.max[2] = round(cz + hw);
    } else if (s.kind === 'stairs') {
      const order = ['-z', '+x', '+z', '-x'];
      it.dir = order[(order.indexOf(it.dir) + 1) % 4];
    } else {
      it.yaw = round(((it.yaw ?? 0) - Math.PI / 2 + Math.PI * 4) % (Math.PI * 2));
    }
    rebuild();
  }

  // ---- Maus: Strahl in die Karte ----

  const raycaster = new THREE.Raycaster();
  function rayAt(e) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    view.camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, view.camera);
    const { origin: o, direction: d } = raycaster.ray;
    return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] };
  }

  // Nächstes Ding unter der Maus (fürs Auswählen)
  function pick(ray, withZones = true) {
    let best = null;
    const test = (kind, index, boxes) => {
      for (const b of boxes) {
        const hit = rayBox(ray.o, ray.d, b.min, b.max);
        if (hit && (!best || hit.t < best.t)) best = { kind, index, t: hit.t, normal: hit.normal };
      }
    };
    map.boxes.forEach((b, i) => test('box', i, [b]));
    map.stairs.forEach((t, i) => test('stairs', i, stairBoxes(t)));
    map.props.forEach((p, i) => test('prop', i, propBoxes(p)));
    map.spawns.forEach((s, i) => test('spawn', i, [itemBounds('spawn', s)]));
    if (withZones) map.zones.forEach((z, i) => test('zone', i, [z]));
    return best;
  }

  // Punkt zum Setzen: oben auf dem getroffenen Ding, sonst auf Bodenhöhe 0
  function surfacePoint(ray) {
    const hit = pick(ray, false);
    if (hit && hit.normal[1] === 1 && hit.kind !== 'spawn') {
      const p = ray.o.map((v, i) => v + ray.d[i] * hit.t);
      // Kiste auf Kiste: genau mittig stapeln
      const under = hit.kind === 'box' && map.boxes[hit.index];
      if (tool === 'kiste' && under?.type === 'kiste') {
        return [round((under.min[0] + under.max[0]) / 2), under.max[1], round((under.min[2] + under.max[2]) / 2)];
      }
      return [snap(p[0]), round(p[1]), snap(p[2])];
    }
    return planePoint(ray, 0);
  }

  function planePoint(ray, y) {
    if (Math.abs(ray.d[1]) < 1e-6) return null;
    const t = (y - ray.o[1]) / ray.d[1];
    if (t < 0) return null;
    return [snap(ray.o[0] + ray.d[0] * t), y, snap(ray.o[2] + ray.d[2] * t)];
  }

  // Was ein Werkzeug an einem Punkt (oder beim Ziehen von a nach b) setzen würde
  function draft(a, b = a) {
    if (tool === 'wand') {
      const along = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]) ? 0 : 2;
      const across = 2 - along;
      const min = [0, a[1], 0];
      const max = [0, a[1] + 3, 0];
      min[along] = Math.min(a[along], b[along]);
      max[along] = Math.max(a[along], b[along]) + (a[along] === b[along] ? grid : 0);
      min[across] = a[across] - 0.25;
      max[across] = a[across] + 0.25;
      return { kind: 'box', item: { type: 'wand', min, max, color: BLOCK_TYPES.wand[1] } };
    }
    if (tool === 'block') {
      const x0 = Math.min(a[0], b[0]);
      const z0 = Math.min(a[2], b[2]);
      const x1 = Math.max(a[0], b[0]) + (a[0] === b[0] ? 2 : 0);
      const z1 = Math.max(a[2], b[2]) + (a[2] === b[2] ? 2 : 0);
      return { kind: 'box', item: { type: 'beton', min: [x0, a[1], z0], max: [x1, a[1] + 3, z1], color: BLOCK_TYPES.beton[1] } };
    }
    if (tool === 'wasser' || tool === 'absturz') {
      const x0 = Math.min(a[0], b[0]);
      const z0 = Math.min(a[2], b[2]);
      const x1 = Math.max(a[0], b[0]) + (a[0] === b[0] ? 2 : 0);
      const z1 = Math.max(a[2], b[2]) + (a[2] === b[2] ? 2 : 0);
      const top = round(a[1] + 0.05);
      return { kind: 'zone', item: { kind: tool, min: [x0, round(top - (tool === 'wasser' ? 1 : 3)), z0], max: [x1, top, z1] } };
    }
    if (tool === 'kiste') {
      return { kind: 'box', item: { type: 'kiste', min: [a[0] - 0.5, a[1], a[2] - 0.5], max: [a[0] + 0.5, a[1] + 1, a[2] + 0.5], color: BLOCK_TYPES.kiste[1] } };
    }
    if (tool === 'treppe') {
      return { kind: 'stairs', item: { start: [...a], dir: stairDir, steps: 10, rise: 0.3, depth: 0.5, width: 1.2 } };
    }
    if (tool === 'spawnA' || tool === 'spawnB') {
      return { kind: 'spawn', item: { team: tool === 'spawnA' ? 'A' : 'B', pos: [...a], yaw: round(Math.atan2(a[0], a[2])) } };
    }
    const item = { model: tool, pos: [a[0], a[1], a[2]], yaw: propYaw };
    if (tool === 'marktstand') item.color = '#b33a3a';
    return { kind: 'prop', item };
  }
  let stairDir = '-z';
  let propYaw = 0;

  let drag = null; // { mode: 'place' | 'move' | 'orbit' | 'rect', ... }

  function showRect(d, e) {
    const x = Math.min(d.x0, e.clientX);
    const y = Math.min(d.y0, e.clientY);
    Object.assign(rectEl.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(e.clientX - d.x0)}px`, height: `${Math.abs(e.clientY - d.y0)}px` });
    rectEl.classList.remove('hidden');
  }

  // Alles, dessen Mitte im Rechteck auf dem Bildschirm liegt
  function selectRect(d, e) {
    const r = canvas.getBoundingClientRect();
    const [x0, x1] = [Math.min(d.x0, e.clientX), Math.max(d.x0, e.clientX)];
    const [y0, y1] = [Math.min(d.y0, e.clientY), Math.max(d.y0, e.clientY)];
    const found = [];
    const v = new THREE.Vector3();
    for (const [kind, list] of Object.entries(lists())) {
      list.forEach((it, index) => {
        const b = itemBounds(kind, it);
        v.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2).project(view.camera);
        if (v.z > 1) return;
        const sx = r.left + ((v.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - v.y) / 2) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) found.push({ kind, index });
      });
    }
    return found;
  }

  canvas.addEventListener('mousedown', e => {
    if (!active) return;
    if (e.button === 2 || e.button === 1) {
      drag = { mode: 'orbit', x: e.clientX, y: e.clientY, pan: e.button === 1 };
      return;
    }
    if (e.button !== 0) return;
    const ray = rayAt(e);
    if (tool === 'select') {
      const hit = pick(ray);
      // Auf freie Fläche (oder den Boden): Bereich aufziehen
      const floorHit = hit && hit.kind === 'box' && map.boxes[hit.index].type === 'boden' && !isSelected(hit);
      if (!hit || floorHit) {
        drag = { mode: 'rect', x0: e.clientX, y0: e.clientY, add: e.shiftKey, hit: floorHit ? { kind: hit.kind, index: hit.index } : null };
        return;
      }
      const s = { kind: hit.kind, index: hit.index };
      if (e.shiftKey) {
        select(isSelected(s) ? sel.filter(x => !(x.kind === s.kind && x.index === s.index)) : [...sel, s]);
        return;
      }
      if (!isSelected(s)) select([s]);
      const it = itemOf(s);
      const baseY = boxLike(s.kind) ? it.min[1] : s.kind === 'stairs' ? it.start[1] : it.pos[1];
      const p = ray.o.map((v, i) => v + ray.d[i] * hit.t);
      drag = { mode: 'move', baseY, start: planePoint(ray, baseY) ?? [snap(p[0]), baseY, snap(p[2])], dx: 0, dz: 0 };
      return;
    }
    const a = surfacePoint(ray);
    if (!a) return;
    drag = { mode: 'place', a, b: a };
    placeBox(ghost, itemBounds(draft(a).kind, draft(a).item));
  });

  window.addEventListener('mousemove', e => {
    if (!active) return;
    if (drag?.mode === 'orbit') {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.pan || e.shiftKey) {
        const k = cam.dist * 0.0015;
        cam.x -= (Math.cos(cam.yaw) * dx + Math.sin(cam.yaw) * dy) * k;
        cam.z -= (-Math.sin(cam.yaw) * dx + Math.cos(cam.yaw) * dy) * k;
      } else {
        cam.yaw -= dx * 0.005;
        cam.pitch = Math.max(-1.5, Math.min(-0.25, cam.pitch - dy * 0.005));
      }
      return;
    }
    if (drag?.mode === 'rect') {
      showRect(drag, e);
      return;
    }
    if (e.target !== canvas && !drag) { ghost.visible = false; return; }
    const ray = rayAt(e);
    mouseRay = ray;
    if (drag?.mode === 'move') {
      const p = planePoint(ray, drag.baseY);
      if (!p) return;
      drag.dx = p[0] - drag.start[0];
      drag.dz = p[2] - drag.start[2];
      selGroup.position.set(drag.dx, 0, drag.dz);
      return;
    }
    if (tool === 'select') { ghost.visible = false; return; }
    if (drag?.mode === 'place') {
      const p = planePoint(ray, drag.a[1]);
      if (p) drag.b = p;
      const dr = draft(drag.a, drag.b);
      placeBox(ghost, itemBounds(dr.kind, dr.item));
      ghost.visible = true;
      return;
    }
    const a = surfacePoint(ray);
    ghost.visible = !!a;
    if (a) {
      const dr = draft(a);
      placeBox(ghost, itemBounds(dr.kind, dr.item));
    }
  });

  window.addEventListener('mouseup', e => {
    if (!active || !drag) return;
    const d = drag;
    drag = null;
    if (d.mode === 'rect') {
      rectEl.classList.add('hidden');
      const small = Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4;
      if (small) {
        // Einfacher Klick: Boden auswählen oder Auswahl aufheben
        if (d.hit) select(d.add ? [...sel, d.hit] : [d.hit]);
        else if (!d.add) select([]);
        return;
      }
      const found = selectRect(d, e).filter(s => !(s.kind === 'box' && map.boxes[s.index].type === 'boden'));
      select(d.add ? [...sel, ...found.filter(s => !isSelected(s))] : found);
      return;
    }
    if (d.mode === 'move' && (d.dx || d.dz)) {
      for (const s of sel) moveItem(s.kind, itemOf(s), d.dx, d.dz);
      rebuild();
    }
    if (d.mode === 'place') {
      const dr = draft(d.a, d.b);
      addItems([dr]);
      rebuild();
      // Startpunkte und Modelle meist einzeln, danach gleich wieder Auswählen
      if (dr.kind !== 'box') setTool('select', true);
    }
  });

  canvas.addEventListener('wheel', e => {
    if (!active) return;
    e.preventDefault();
    cam.dist = Math.max(6, Math.min(160, cam.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
  }, { passive: false });

  const typing = e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  window.addEventListener('keydown', e => {
    if (!active || typing(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const k = e.code;
      if (k === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'KeyY' || (k === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 'KeyD') { e.preventDefault(); duplicate(); }
      else if (k === 'KeyC') { e.preventDefault(); copy(); }
      else if (k === 'KeyV') { e.preventDefault(); paste(); }
      else if (k === 'KeyA') {
        e.preventDefault();
        select(Object.entries(lists()).flatMap(([kind, list]) => list.map((it, index) => ({ kind, index })))
          .filter(s => !(s.kind === 'box' && map.boxes[s.index].type === 'boden')));
      }
      return;
    }
    keys.add(e.code);
    if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); remove(); }
    if (e.code === 'KeyR') {
      if (sel.length) rotate();
      else if (tool === 'treppe') stairDir = { '-z': '+x', '+x': '+z', '+z': '-x', '-x': '-z' }[stairDir];
      else propYaw = round((propYaw - Math.PI / 2 + Math.PI * 4) % (Math.PI * 2));
    }
    if (e.code === 'Escape') { if (sel.length) select([]); else setTool('select'); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ---- Werkzeuge und Kartenleiste ----

  const toolBox = $('ed-tools');
  toolBox.innerHTML = TOOLS.map(([k, name]) => `<button data-tool="${k}">${name}</button>`).join('');
  toolBox.addEventListener('click', e => { if (e.target.dataset.tool) setTool(e.target.dataset.tool); });

  function setTool(t, keepSelection = false) {
    tool = t;
    for (const b of toolBox.children) b.classList.toggle('on', b.dataset.tool === t);
    ghost.visible = false;
    if (t !== 'select' && !keepSelection) sel = [];
    showSelection();
    showProps();
    help.textContent = TOOLS.find(x => x[0] === t)[2];
  }

  function showMapSettings() {
    $('ed-name').value = map.name;
    $('ed-licht').innerHTML = Object.entries(DAYTIME_NAMES).map(([k, v]) => `<option value="${k}"${k === map.licht ? ' selected' : ''}>${v}</option>`).join('');
  }

  $('ed-name').addEventListener('change', e => { map.name = e.target.value.trim().slice(0, 40) || 'Meine Karte'; rebuild(); });
  $('ed-licht').addEventListener('change', e => { map.licht = e.target.value; rebuild(); });
  $('ed-grid').addEventListener('change', e => { grid = Number(e.target.value); });
  $('ed-undo').addEventListener('click', undo);
  $('ed-redo').addEventListener('click', redo);

  function showStore() {
    const names = Object.keys(loadStore()).sort();
    $('ed-saved').innerHTML = names.length
      ? names.map(n => `<option${n === map.name ? ' selected' : ''}>${esc(n)}</option>`).join('')
      : '<option value="">— noch keine —</option>';
    $('ed-del').textContent = 'Löschen';
  }

  $('ed-new').addEventListener('click', () => { setMap(newMap()); say('Neue Karte'); });
  $('ed-save').addEventListener('click', () => {
    const store = loadStore();
    store[map.name] = clone(map);
    if (saveStore(store)) { showStore(); say(`Gespeichert als „${map.name}“, steht jetzt auch in der Kartenauswahl`); }
    else say('Speichern ging nicht (Browser-Speicher voll oder gesperrt)');
  });
  $('ed-open').addEventListener('click', () => {
    const name = $('ed-saved').value;
    const m = loadStore()[name];
    if (!m) return;
    setMap(readMap(m));
    say(`„${name}“ geöffnet`);
  });
  // Löschen ohne Browser-Dialog: erster Klick fragt, zweiter löscht
  $('ed-del').addEventListener('click', e => {
    const name = $('ed-saved').value;
    if (!name) return;
    if (e.target.textContent !== 'Wirklich?') { e.target.textContent = 'Wirklich?'; return; }
    const store = loadStore();
    delete store[name];
    saveStore(store);
    showStore();
    say(`„${name}“ gelöscht`);
  });
  $('ed-saved').addEventListener('change', () => { $('ed-del').textContent = 'Löschen'; });

  $('ed-export').addEventListener('click', () => {
    const built = buildMap(map);
    const blob = new Blob([JSON.stringify(built, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${map.name.replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'karte'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(`Als Datei ausgegeben (${built.waypoints.nodes.length} Wegpunkte)`);
  });
  $('ed-import').addEventListener('click', () => $('ed-file').click());
  $('ed-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      setMap(readMap(JSON.parse(await file.text())));
      say(`„${file.name}“ eingelesen`);
    } catch (err) {
      say(`Einlesen ging nicht: ${err.message}`);
    }
  });

  $('ed-check').addEventListener('click', runCheck);

  $('ed-play').addEventListener('click', () => {
    const result = runCheck();
    if (result.problems.length) { say('So geht es noch nicht — siehe rote Zeilen'); return; }
    onPlay(result.built);
  });
  $('ed-exit').addEventListener('click', () => onExit());

  // ---- Kamera ----

  function update(dt) {
    const speed = cam.dist * 0.9 * dt;
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    cam.x += (-Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * r) * speed;
    cam.z += (-Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * r) * speed;
    cam.yaw += ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * 1.5 * dt;
  }

  function camera() {
    const cp = Math.cos(cam.pitch);
    return {
      x: cam.x + Math.sin(cam.yaw) * cp * cam.dist,
      y: -Math.sin(cam.pitch) * cam.dist,
      z: cam.z + Math.cos(cam.yaw) * cp * cam.dist,
      yaw: cam.yaw,
      pitch: cam.pitch,
      fov: 55,
    };
  }

  setTool('select');

  return {
    get map() { return map; },
    get selection() { return sel; },
    open() {
      active = true;
      root.classList.remove('hidden');
      overlay.visible = true;
      showMapSettings();
      showStore();
      rebuild(false);
    },
    close() {
      active = false;
      drag = null;
      keys.clear();
      root.classList.add('hidden');
      rectEl.classList.add('hidden');
      overlay.visible = false;
      clearMarks();
    },
    update,
    camera,
    // Zum Prüfen im Browser
    setMap, buildMap: () => buildMap(map), check: runCheck, setTool, select, undo, redo, mirror, copy, paste,
  };
}
