// Figuren aus Blöcken in Teamfarbe. Treffer blitzt weiß, Fall kippt nach hinten und verschwindet. Kein Blut.

import * as THREE from 'three';
import { hitboxes } from '../game/hitbox.js';

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

export function updateFigure(f, pos, yaw, crouched, alive, dt) {
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
