// Figuren in Teamfarbe: Soldat aus Blender (public/models/custom/soldat.glb), sonst Blöcke.
// Treffer blitzt weiß, Fall kippt nach hinten und verschwindet. Kein Blut.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hitboxes } from '../game/hitbox.js';
import { buildWeapon, createMuzzleFlash, HANDS } from './viewmodel.js';
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
// Hautfarben, je Spieler eine aus der Reihe; Bart bei jedem zweiten
const SKINS = [0xd9c2a5, 0xc69c7a, 0x9c6b4a, 0xe8d2b8, 0x6f4a32, 0xb8865f];

export function createFigure(scene, team, id = 0) {
  const f = soldier ? soldierFigure(scene, team, id) : blockFigure(scene, team);
  f.bar = createBar();
  f.group.add(f.bar.group);
  return f;
}

// Lebensbalken über dem Kopf: dunkler Grund, Füllung grün/gelb/rot. Sprites drehen sich zur Kamera,
// Wände verdecken sie wie alles andere.
const BAR_W = 0.7;
const BAR_H = 0.08;
function createBar() {
  const group = new THREE.Group();
  const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
  back.scale.set(BAR_W + 0.04, BAR_H + 0.04, 1);
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5bbf4a, transparent: true }));
  fill.scale.set(BAR_W, BAR_H, 1);
  group.add(back, fill);
  group.visible = false;
  return { group, back, fill, show: 0 };
}

// show: so lange noch sichtbar (Sekunden); Teamkameraden bekommen immer einen Wert > 0
export function updateBar(f, health, max, alive, show, dt) {
  const b = f.bar;
  b.show = Math.max(show, b.show - dt);
  const k = Math.max(0, Math.min(1, health / max));
  b.group.visible = alive && b.show > 0;
  if (!b.group.visible) return;
  b.group.position.y = 2.05 - (f.kneel ?? 0) * 0.6;
  // Füllung links bündig: der Ankerpunkt (center) liegt in Bildschirmrichtung, so dreht er nicht mit der Figur
  const w = Math.max(0.001, k);
  b.fill.scale.x = BAR_W * w;
  b.fill.center.x = 0.5 / w;
  b.fill.material.color.setHex(k > 0.6 ? 0x5bbf4a : k > 0.3 ? 0xe0c040 : 0xd9443a);
  const fade = Math.min(1, b.show / 0.5);
  b.fill.material.opacity = fade;
  b.back.material.opacity = 0.6 * fade;
}

// Soldat: Arme nach vorn zur Waffe, Beine schwingen beim Laufen, kniet geduckt, Oberkörper und Kopf folgen dem Blick.
// Das Modell schaut nach +Z.
function soldierFigure(scene, team, id) {
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
    if (o.material.name === 'soldat_haut') o.material.color.setHex(SKINS[id % SKINS.length]);
    if (o.material.name === 'soldat_bart') o.visible = id % 2 === 1;
    o.material.transparent = true;
    o.castShadow = true;
    mats.push(o.material);
  });
  const parts = {
    torso: body.getObjectByName('soldat_rumpf'),
    head: body.getObjectByName('soldat_kopf'),
    armR: body.getObjectByName('soldat_arm_r'),
    armL: body.getObjectByName('soldat_arm_l'),
    foreR: body.getObjectByName('soldat_unterarm_r'),
    foreL: body.getObjectByName('soldat_unterarm_l'),
    legR: body.getObjectByName('soldat_bein_r'),
    legL: body.getObjectByName('soldat_bein_l'),
    shinR: body.getObjectByName('soldat_unterbein_r'),
    shinL: body.getObjectByName('soldat_unterbein_l'),
  };
  // Oberkörper dreht zuerst mit dem Blick (y), dann neigt er sich (x)
  parts.torso.rotation.order = 'YXZ';
  // Waffe hängt am Oberkörper, 30 cm über der Hüfte, vor der Brust, leicht nach rechts
  const gunHolder = new THREE.Group();
  gunHolder.position.set(-0.05, 0.3, 0.24);
  gunHolder.rotation.y = Math.PI;
  parts.torso.add(gunHolder);
  scene.add(group);
  return {
    group, pivot, body, mats, flash: 0, fall: 0, parts, gunHolder, weapon: null, muzzle: 0, muzzleMesh: null,
    walk: 0, kneel: 0, last: null, bodyYaw: null, reloadLeft: 0, reloadTime: 1,
    time: 0, air: 0, wasAir: false, land: 0, stab: 0, hitFrom: null, torsoY: parts.torso.position.y,
    flinch: 0, headshot: false, dead: false,
  };
}

// Arm mit zwei Knochen (Oberarm, Unterarm) so stellen, dass die Hand den Zielpunkt erreicht (Oberkörper-Raum).
// Ruhelage beider Knochen zeigt nach −Y (Arm hängt herab). Der Ellbogen weicht in Richtung hint aus.
const ARM = { upper: 0.3, lower: 0.31 }; // Schulter bis Ellbogen, Ellbogen bis Griffmitte in der Hand
const SHOULDER = { r: new THREE.Vector3(-0.25, 0.45, 0), l: new THREE.Vector3(0.25, 0.45, 0) };
const ELBOW_HINT = { r: new THREE.Vector3(-0.7, -0.5, -0.25), l: new THREE.Vector3(0.7, -0.5, -0.25) };
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _u = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();

function aimArm(parts, side, target) {
  const upper = side === 'r' ? parts.armR : parts.armL;
  const lower = side === 'r' ? parts.foreR : parts.foreL;
  const S = SHOULDER[side];
  _d.subVectors(target, S);
  const dist = Math.max(0.05, Math.min(ARM.upper + ARM.lower - 0.005, _d.length()));
  _d.normalize();
  const cosA = (ARM.upper ** 2 + dist ** 2 - ARM.lower ** 2) / (2 * ARM.upper * dist);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  _axis.crossVectors(_d, ELBOW_HINT[side]);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  _u.copy(_d).applyAxisAngle(_axis, a);
  _e.copy(S).addScaledVector(_u, ARM.upper);
  _f.subVectors(target, _e).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _u);
  _q.setFromUnitVectors(DOWN, _f);
  lower.quaternion.copy(upper.quaternion).invert().multiply(_q);
}

const _target = new THREE.Vector3();
const _rest = new THREE.Vector3();
// Punkt aus dem Waffenraum in den Oberkörper-Raum
function gunPoint(f, p, out) {
  return out.set(p[0], p[1], p[2]).applyMatrix4(f.gunHolder.matrix);
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));


function setWeapon(f, id) {
  f.weapon = id;
  for (const old of [...f.gunHolder.children]) {
    f.gunHolder.remove(old);
    old.traverse(o => {
      if (o === f.muzzleMesh) { o.material.dispose(); return; }
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
    f.muzzleMesh = createMuzzleFlash(0.3);
    f.muzzleMesh.position.set(0, 0.015, gun.userData.muzzleZ - 0.04);
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

const _fallAxis = new THREE.Vector3(1, 0, 0);

// Richtung des letzten Treffers im Raum der Figur (x quer, z nach vorn); ohne Treffer nach hinten
function hitDir(f) {
  const d = f.hitFrom;
  const by = f.group.rotation.y;
  if (!d || (!d.x && !d.z)) return [0, 1];
  const len = Math.hypot(d.x, d.z);
  return [(d.x * Math.cos(by) - d.z * Math.sin(by)) / len, (d.x * Math.sin(by) + d.z * Math.cos(by)) / len];
}

export function updateFigure(f, pos, yaw, crouched, alive, dt, weapon = null, pitch = 0, airborne = false) {
  if (f.parts) animateSoldier(f, pos, yaw, crouched, alive, dt, weapon, pitch, airborne);
  else f.pivot.scale.y = crouched ? 1.2 / 1.8 : 1;
  f.group.position.set(pos.x, pos.y, pos.z);
  f.group.rotation.y = f.parts ? f.bodyYaw : yaw;
  f.flash = Math.max(0, f.flash - dt);
  for (const m of f.mats) m.emissive.setScalar(f.flash > 0 ? 0.9 : 0);
  if (alive) {
    f.fall = 0;
    f.dead = false;
    f.group.visible = true;
    f.pivot.quaternion.identity();
    for (const m of f.mats) m.opacity = 1;
    return;
  }
  // Fallen: vom Schützen weg (Richtung des letzten Treffers), sonst nach hinten. Achse quer zur Fallrichtung.
  const [dx, dz] = hitDir(f);
  _fallAxis.set(dz, 0, -dx);
  if (f.parts) {
    // Soldat: eine Kopie bleibt als Gefallener liegen, die Figur selbst wartet unsichtbar auf den Wiedereinstieg
    if (!f.dead) {
      spawnCorpse(f, _fallAxis);
      f.dead = true;
      f.headshot = false;
    }
    f.group.visible = false;
    return;
  }
  if (f.fall === 0) f.fallAxis = _fallAxis.clone();
  f.fall += dt;
  const k = Math.min(1, f.fall / 0.35);
  f.pivot.quaternion.setFromAxisAngle(f.fallAxis ?? _fallAxis, (Math.PI / 2) * k * k);
  const fade = Math.max(0, 1 - (f.fall - 0.6) / 0.4);
  for (const m of f.mats) m.opacity = fade;
  f.group.visible = fade > 0;
}

// Gefallene: Kopie der Figur in ihrer letzten Haltung, kippt um, bleibt liegen, verblasst nach CORPSE_LIE Sekunden.
// Bei einem Kopftreffer fliegt der Helm weg und bleibt am Boden liegen.
const corpses = [];
const CORPSE_LIE = 6;
const _hv = new THREE.Vector3();

function spawnCorpse(f, axis) {
  const scene = f.group.parent;
  if (!scene) return;
  const group = new THREE.Group();
  group.position.copy(f.group.position);
  group.rotation.y = f.group.rotation.y;
  const pivot = new THREE.Group();
  group.add(pivot);
  const body = f.body.clone(true);
  const mats = [];
  body.traverse(o => {
    if (o.isSprite) { o.visible = false; return; }
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.emissive.setScalar(0);
    mats.push(o.material);
  });
  pivot.add(body);
  scene.add(group);
  const c = { group, pivot, mats, axis: axis.clone(), age: 0, helmet: null, hvel: new THREE.Vector3(), hspin: 0 };
  if (f.headshot) {
    const headName = f.parts.head.name;
    const original = f.parts.head.children.find(o => o.isMesh && o.material.name === 'soldat_team');
    const copy = body.getObjectByName(headName)?.children.find(o => o.isMesh && o.material.name === 'soldat_team');
    if (original && copy) {
      copy.visible = false;
      const helmet = new THREE.Mesh(original.geometry, copy.material);
      original.getWorldPosition(helmet.position);
      original.getWorldQuaternion(helmet.quaternion);
      helmet.castShadow = true;
      scene.add(helmet);
      const [dx, dz] = hitDir(f);
      // vom Schützen weg und nach oben, in Weltrichtung gedreht
      const by = f.group.rotation.y;
      _hv.set(dx * Math.cos(by) + dz * Math.sin(by), 0, -dx * Math.sin(by) + dz * Math.cos(by));
      c.hvel.copy(_hv).multiplyScalar(2 + Math.random()).setY(3 + Math.random());
      c.hspin = 6 + Math.random() * 6;
      c.helmet = helmet;
    }
  }
  corpses.push(c);
}

export function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.age += dt;
    const k = Math.min(1, c.age / 0.35);
    c.pivot.quaternion.setFromAxisAngle(c.axis, (Math.PI / 2) * k * k);
    const fade = Math.max(0, Math.min(1, 1 - (c.age - CORPSE_LIE)));
    for (const m of c.mats) m.opacity = fade;
    if (c.helmet) {
      c.hvel.y -= 9.8 * dt;
      c.helmet.position.addScaledVector(c.hvel, dt);
      c.helmet.rotation.x += c.hspin * dt;
      c.helmet.rotation.z += c.hspin * 0.7 * dt;
      const floor = c.group.position.y + 0.1;
      if (c.helmet.position.y < floor) {
        c.helmet.position.y = floor;
        c.hvel.set(0, 0, 0);
        c.hspin = 0;
      }
      c.helmet.material.opacity = fade;
    }
    if (fade <= 0) {
      removeCorpse(c);
      corpses.splice(i, 1);
    }
  }
}

// Geometrie gehört dem Soldatenmodell, nur die Materialien sind Kopien
function removeCorpse(c) {
  c.group.parent?.remove(c.group);
  c.helmet?.parent?.remove(c.helmet);
  for (const m of c.mats) m.dispose();
}

export function clearCorpses() {
  for (const c of corpses) removeCorpse(c);
  corpses.length = 0;
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
    if (!o.isSprite) o.geometry?.dispose();
    o.material?.dispose();
  });
}

// Knien (geduckt): Hüfte 61 cm tiefer, rechtes Knie am Boden, linker Fuß vorn aufgestellt. Kopf oben bei 1,21 m,
// passend zur Trefferzone. Winkel um x, positiv schwingt den Fuß nach hinten.
const HIP_DROP = 0.61;
const KNEEL = { legR: -0.95, shinR: Math.PI / 2 + 0.95, legL: -2.0, shinL: 2.0 };

// Beine schwingen mit der gelaufenen Strecke, Ausschlag nach Tempo. Blick hoch und runter: Oberkörper ein wenig,
// Arme mit Waffe mehr, Kopf am meisten.
function animateSoldier(f, pos, yaw, crouched, alive, dt, weapon, pitch, airborne) {
  if (f.weapon !== weapon) setWeapon(f, weapon);
  const p = f.parts;
  f.time += dt;
  const moved = f.last && alive ? Math.hypot(pos.x - f.last.x, pos.z - f.last.z) : 0;
  f.last = { x: pos.x, z: pos.z };
  const speed = dt > 0 ? moved / dt : 0;
  const k = Math.min(1, dt * 10);

  // Beine folgen dem Blick nur beim Gehen oder wenn der Oberkörper zu weit verdreht wäre; im Stand dreht
  // nur der Oberkörper mit Kopf, Armen und Waffe
  if (f.bodyYaw === null) f.bodyYaw = yaw;
  let twist = wrapAngle(yaw - f.bodyYaw);
  if (speed > 0.5 || Math.abs(twist) > 1.0 || !alive) f.bodyYaw += twist * Math.min(1, dt * 12);
  twist = wrapAngle(yaw - f.bodyYaw);
  p.torso.rotation.y = twist;
  f.kneel += ((crouched ? 1 : 0) - f.kneel) * Math.min(1, dt * 14);
  const c = f.kneel;
  const amount = Math.min(1, speed / 5) * 0.6 * (1 - c);
  f.walk += moved * 3.3;
  const swing = Math.sin(f.walk) * amount;
  // ohne Bewegung langsam zurück in die Ruhe
  f.swing = (f.swing ?? 0) + (swing - (f.swing ?? 0)) * k;
  // Sprung: Beine anziehen, Oberkörper leicht nach vorn; Landung: kurz in die Knie
  const inAir = airborne && alive ? 1 : 0;
  f.air += (inAir - f.air) * Math.min(1, dt * 14);
  if (f.wasAir && !airborne && alive) f.land = 1;
  f.wasAir = airborne;
  f.land = Math.max(0, f.land - dt * 4);
  const air = f.air * (1 - c);
  const squat = Math.sin(f.land * Math.PI) * (1 - c);
  p.legR.rotation.x = f.swing * (1 - c) + KNEEL.legR * c - 0.7 * air - 0.3 * squat;
  p.legL.rotation.x = -f.swing * (1 - c) + KNEEL.legL * c - 0.55 * air - 0.3 * squat;
  p.shinR.rotation.x = Math.max(0, f.swing) * 0.5 * (1 - c) + KNEEL.shinR * c + 1.3 * air + 0.6 * squat;
  p.shinL.rotation.x = Math.max(0, -f.swing) * 0.5 * (1 - c) + KNEEL.shinL * c + 1.1 * air + 0.6 * squat;
  f.body.position.y = -HIP_DROP * c - 0.1 * squat;

  // Oberkörper wippt beim Laufen (hoch bei jedem Schritt, leicht seitlich), atmet im Stand
  const bob = Math.abs(Math.sin(f.walk)) * 0.025 * amount;
  const breath = Math.sin(f.time * 1.6) * 0.004 * (1 - amount);
  p.torso.position.y = f.torsoY + bob + breath - 0.04 * squat;
  p.torso.rotation.z = Math.sin(f.walk) * 0.05 * amount;
  p.head.rotation.z = -Math.sin(f.walk) * 0.03 * amount;

  const look = alive ? pitch : 0;
  p.torso.rotation.x = -look * 0.3 + 0.25 * air;
  // Treffer: Oberkörper zuckt kurz vom Schützen weg
  f.flinch = Math.max(0, f.flinch - dt);
  if (f.flinch > 0) {
    const [dx, dz] = hitDir(f);
    const kf = Math.sin((f.flinch / 0.25) * Math.PI) * 0.22;
    p.torso.rotation.x += kf * dz;
    p.torso.rotation.z -= kf * dx;
  }
  p.head.rotation.x = -look * 0.5;
  f.gunHolder.rotation.x = -look * 0.45;
  f.gunHolder.updateMatrix();

  // Hände an die Waffe: rechte am Griff, linke am Vorderschaft, beim Nachladen greift die linke zum Magazin.
  // Ohne Waffe oder beim Messer hängt der linke Arm locker.
  const h = HANDS[weapon] ?? null;
  f.reloadLeft = Math.max(0, f.reloadLeft - dt);
  const reloadK = f.reloadLeft > 0 ? Math.sin((1 - f.reloadLeft / f.reloadTime) * Math.PI) : 0;
  // Messerhieb: rechte Hand stößt nach vorn
  f.stab = Math.max(0, f.stab - dt);
  const stabK = f.stab > 0 && WEAPONS[weapon]?.melee ? Math.sin((f.stab / 0.3) * Math.PI) : 0;
  if (h) {
    gunPoint(f, h.right, _target);
    if (stabK) { _target.z += 0.35 * stabK; _target.y += 0.05 * stabK; }
    aimArm(p, 'r', _target);
    if (h.left) {
      gunPoint(f, h.left, _target);
      if (reloadK && h.mag) _target.lerp(gunPoint(f, h.mag, _rest), reloadK);
      aimArm(p, 'l', _target);
    } else {
      aimArm(p, 'l', _rest.set(0.3, -0.1, 0.12));
    }
  } else {
    aimArm(p, 'r', _rest.set(-0.3, -0.1, 0.12));
    aimArm(p, 'l', _rest.set(0.3, -0.1, 0.12));
  }

  f.muzzle = Math.max(0, f.muzzle - dt);
  if (f.muzzleMesh) {
    f.muzzleMesh.visible = f.muzzle > 0 && alive;
    f.muzzleMesh.material.rotation = Math.random() * Math.PI;
  }
}
