// Figuren in Teamfarbe: Soldat aus Blender (public/models/custom/soldat.glb), sonst Blöcke.
// Treffer blitzt weiß, Fall kippt nach hinten und verschwindet. Kein Blut.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hitboxes } from '../game/hitbox.js';
import { buildWeapon } from './viewmodel.js';
import { WEAPONS } from '../config.js';

let soldier = null;

export function loadSoldier() {
  return new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/custom/soldat.glb`)
    .then(gltf => { soldier = gltf.scene; return true; })
    .catch(() => false);
}

export const TEAM_COLORS = { A: 0x3d7bd9, B: 0xe0832f };

function block(parent, color, size, pos, mats) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  parent.add(mesh);
  mats.push(mat);
  return mesh;
}

// Vorderseite −Z, wie die Blickrichtung bei yaw 0
export function createFigure(scene, team) {
  return soldier ? soldierFigure(scene, team) : blockFigure(scene, team);
}

// Soldat: Arme nach vorn zur Waffe, Beine schwingen beim Laufen, kniet geduckt, Oberkörper und Kopf folgen dem Blick.
// Das Modell schaut nach +Z.
function soldierFigure(scene, team) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const body = soldier.clone(true);
  body.rotation.y = Math.PI;
  pivot.add(body);
  const mats = [];
  body.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (o.material.name === 'soldat_team') o.material.color.setHex(TEAM_COLORS[team]);
    o.material.transparent = true;
    o.castShadow = true;
    mats.push(o.material);
  });
  const parts = {
    torso: body.getObjectByName('soldat_rumpf'),
    head: body.getObjectByName('soldat_kopf'),
    armR: body.getObjectByName('soldat_arm_r'),
    armL: body.getObjectByName('soldat_arm_l'),
    legR: body.getObjectByName('soldat_bein_r'),
    legL: body.getObjectByName('soldat_bein_l'),
    shinR: body.getObjectByName('soldat_unterbein_r'),
    shinL: body.getObjectByName('soldat_unterbein_l'),
  };
  parts.armR.rotation.order = parts.armL.rotation.order = 'YXZ';
  // Waffe hängt am Oberkörper, 32 cm über der Hüfte, vor der Brust
  const gunHolder = new THREE.Group();
  gunHolder.position.set(-0.07, 0.32, 0.32);
  gunHolder.rotation.y = Math.PI;
  parts.torso.add(gunHolder);
  scene.add(group);
  return { group, pivot, body, mats, flash: 0, fall: 0, parts, gunHolder, weapon: null, muzzle: 0, muzzleMesh: null, walk: 0, kneel: 0, last: null };
}

const MUZZLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9 });
const MUZZLE_GEO = new THREE.BoxGeometry(0.09, 0.09, 0.14);

function setWeapon(f, id) {
  f.weapon = id;
  for (const old of [...f.gunHolder.children]) {
    f.gunHolder.remove(old);
    old.traverse(o => {
      if (o === f.muzzleMesh) return;
      o.geometry?.dispose();
      if (o.material) f.mats.splice(f.mats.indexOf(o.material), 1);
    });
  }
  f.muzzleMesh = null;
  if (!id) return;
  const gun = buildWeapon(id);
  gun.traverse(o => {
    if (!o.isMesh) return;
    o.material.transparent = true;
    o.castShadow = true;
    f.mats.push(o.material);
  });
  if (!WEAPONS[id].melee) {
    f.muzzleMesh = new THREE.Mesh(MUZZLE_GEO, MUZZLE_MAT);
    f.muzzleMesh.position.set(0, 0.015, gun.userData.muzzleZ - 0.06);
    f.muzzleMesh.visible = false;
    gun.add(f.muzzleMesh);
  }
  f.gunHolder.add(gun);
}

function blockFigure(scene, team) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const mats = [];
  const color = TEAM_COLORS[team];
  block(pivot, 0x3a3d42, [0.22, 0.85, 0.26], [-0.13, 0.425, 0], mats);
  block(pivot, 0x3a3d42, [0.22, 0.85, 0.26], [0.13, 0.425, 0], mats);
  block(pivot, color, [0.56, 0.62, 0.32], [0, 1.17, 0], mats);
  block(pivot, 0xd9c2a5, [0.28, 0.3, 0.28], [0, 1.64, 0], mats);
  block(pivot, color, [0.3, 0.06, 0.3], [0, 1.8, 0], mats);
  block(pivot, color, [0.14, 0.14, 0.5], [0.24, 1.25, -0.22], mats);
  block(pivot, 0x23252a, [0.07, 0.1, 0.6], [0.12, 1.28, -0.42], mats);
  scene.add(group);
  return { group, pivot, mats, flash: 0, fall: 0 };
}

export function updateFigure(f, pos, yaw, crouched, alive, dt, weapon = null, pitch = 0) {
  if (f.parts) animateSoldier(f, pos, crouched, alive, dt, weapon, pitch);
  else f.pivot.scale.y = crouched ? 1.2 / 1.8 : 1;
  f.group.position.set(pos.x, pos.y, pos.z);
  f.group.rotation.y = yaw;
  f.flash = Math.max(0, f.flash - dt);
  for (const m of f.mats) m.emissive.setScalar(f.flash > 0 ? 0.9 : 0);
  if (alive) {
    f.fall = 0;
    f.group.visible = true;
    f.pivot.rotation.x = 0;
    for (const m of f.mats) m.opacity = 1;
    return;
  }
  f.fall += dt;
  const k = Math.min(1, f.fall / 0.35);
  f.pivot.rotation.x = (Math.PI / 2) * k * k;
  const fade = Math.max(0, 1 - (f.fall - 0.6) / 0.4);
  for (const m of f.mats) m.opacity = fade;
  f.group.visible = fade > 0;
}

// Zielscheibe für den Schießstand: rote Figur mit hellem Kopf und weißem Ring
export function createTargetFigure(scene) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const mats = [];
  const [head, body] = hitboxes({ x: 0, y: 0, z: 0 });
  for (const [box, color] of [[head, 0xf2e6d8], [body, 0xc6423a]]) {
    const size = [0, 1, 2].map(i => box.max[i] - box.min[i]);
    block(pivot, color, size, [0, (box.min[1] + box.max[1]) / 2, 0], mats);
  }
  block(pivot, 0xffffff, [0.62, 0.12, 0.62], [0, 1.05, 0], mats);
  scene.add(group);
  return { group, pivot, mats, flash: 0, fall: 0 };
}

export function removeFigure(scene, f) {
  scene.remove(f.group);
  f.group.traverse(o => {
    if (o.material === MUZZLE_MAT) return;
    o.geometry?.dispose();
    o.material?.dispose();
  });
}

// Knien (geduckt): Hüfte 61 cm tiefer, rechtes Knie am Boden, linker Fuß vorn aufgestellt. Kopf oben bei 1,21 m,
// passend zur Trefferzone. Winkel um x, positiv schwingt den Fuß nach hinten.
const HIP_DROP = 0.61;
const KNEEL = { legR: -0.95, shinR: Math.PI / 2 + 0.95, legL: -2.0, shinL: 2.0 };

// Beine schwingen mit der gelaufenen Strecke, Ausschlag nach Tempo. Blick hoch und runter: Oberkörper ein wenig,
// Arme mit Waffe mehr, Kopf am meisten.
function animateSoldier(f, pos, crouched, alive, dt, weapon, pitch) {
  if (f.weapon !== weapon) setWeapon(f, weapon);
  const p = f.parts;
  const moved = f.last && alive ? Math.hypot(pos.x - f.last.x, pos.z - f.last.z) : 0;
  f.last = { x: pos.x, z: pos.z };
  const speed = dt > 0 ? moved / dt : 0;
  const k = Math.min(1, dt * 10);
  f.kneel += ((crouched ? 1 : 0) - f.kneel) * Math.min(1, dt * 14);
  const c = f.kneel;
  const amount = Math.min(1, speed / 5) * 0.6 * (1 - c);
  f.walk += moved * 3.3;
  const swing = Math.sin(f.walk) * amount;
  // ohne Bewegung langsam zurück in die Ruhe
  f.swing = (f.swing ?? 0) + (swing - (f.swing ?? 0)) * k;
  p.legR.rotation.x = f.swing * (1 - c) + KNEEL.legR * c;
  p.legL.rotation.x = -f.swing * (1 - c) + KNEEL.legL * c;
  p.shinR.rotation.x = Math.max(0, f.swing) * 0.5 * (1 - c) + KNEEL.shinR * c;
  p.shinL.rotation.x = Math.max(0, -f.swing) * 0.5 * (1 - c) + KNEEL.shinL * c;
  f.body.position.y = -HIP_DROP * c;

  const look = alive ? pitch : 0;
  p.torso.rotation.x = -look * 0.3;
  p.head.rotation.x = -look * 0.5;
  // Nach vorn heben, dann nach innen zur Waffe schwenken (rechte Hand am Griff, linke vorn am Lauf)
  p.armR.rotation.set(-1.3 - look * 0.45, 0.3, 0);
  p.armL.rotation.set(-1.25 - look * 0.45, -0.5, 0);
  f.gunHolder.rotation.x = -look * 0.45;

  f.muzzle = Math.max(0, f.muzzle - dt);
  if (f.muzzleMesh) {
    f.muzzleMesh.visible = f.muzzle > 0 && alive;
    f.muzzleMesh.rotation.z = Math.random() * Math.PI;
  }
}
