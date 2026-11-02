// Figuren in Teamfarbe: Soldat aus Blender (public/models/custom/soldat.glb), sonst Blöcke.
// Treffer blitzt weiß, Fall kippt nach hinten und verschwindet. Kein Blut.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hitboxes } from '../game/hitbox.js';
import { buildWeapon } from './viewmodel.js';

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

// Soldat: Arme nach vorn zur Waffe, Beine schwingen beim Laufen. Das Modell schaut nach +Z.
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
    armR: body.getObjectByName('soldat_arm_r'),
    armL: body.getObjectByName('soldat_arm_l'),
    legR: body.getObjectByName('soldat_bein_r'),
    legL: body.getObjectByName('soldat_bein_l'),
  };
  // Nach vorn heben, dann nach innen zur Waffe schwenken (rechte Hand am Griff, linke vorn am Lauf)
  parts.armR.rotation.set(-1.3, 0.3, 0, 'YXZ');
  parts.armL.rotation.set(-1.25, -0.5, 0, 'YXZ');
  const gunHolder = new THREE.Group();
  gunHolder.position.set(-0.07, 1.27, 0.32);
  gunHolder.rotation.y = Math.PI;
  body.add(gunHolder);
  scene.add(group);
  return { group, pivot, mats, flash: 0, fall: 0, parts, gunHolder, weapon: null, walk: 0, last: null };
}

function setWeapon(f, id) {
  f.weapon = id;
  for (const old of [...f.gunHolder.children]) {
    f.gunHolder.remove(old);
    old.traverse(o => { o.geometry?.dispose(); if (o.material) f.mats.splice(f.mats.indexOf(o.material), 1); });
  }
  if (!id) return;
  const gun = buildWeapon(id);
  gun.traverse(o => {
    if (!o.isMesh) return;
    o.material.transparent = true;
    o.castShadow = true;
    f.mats.push(o.material);
  });
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

export function updateFigure(f, pos, yaw, crouched, alive, dt, weapon = null) {
  if (f.parts) animateSoldier(f, pos, alive, dt, weapon);
  f.group.position.set(pos.x, pos.y, pos.z);
  f.group.rotation.y = yaw;
  f.pivot.scale.y = crouched ? 1.2 / 1.8 : 1;
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
  f.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
}

// Beine schwingen mit der gelaufenen Strecke, Ausschlag nach Tempo
function animateSoldier(f, pos, alive, dt, weapon) {
  if (f.weapon !== weapon) setWeapon(f, weapon);
  const moved = f.last && alive ? Math.hypot(pos.x - f.last.x, pos.z - f.last.z) : 0;
  f.last = { x: pos.x, z: pos.z };
  const speed = dt > 0 ? moved / dt : 0;
  const amount = Math.min(1, speed / 5) * 0.6;
  f.walk += moved * 3.3;
  const swing = Math.sin(f.walk) * amount;
  // ohne Bewegung langsam zurück in die Ruhe
  const k = Math.min(1, dt * 10);
  f.parts.legR.rotation.x += (swing - f.parts.legR.rotation.x) * k;
  f.parts.legL.rotation.x += (-swing - f.parts.legL.rotation.x) * k;
}
