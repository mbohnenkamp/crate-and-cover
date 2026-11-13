// KI-Soldat (Meshy über Higgsfield, public/models/ki/soldat.glb): ein Körper mit Skelett und fertigen Bewegungen
// für Beine und Rumpf. Blick, Waffe und Hände kommen wie beim Blender-Soldaten aus dem Code: Die Wirbelsäule dreht
// und neigt sich mit dem Blick, die Arme greifen per Zwei-Knochen-Rechnung an die Waffe.
// Fehlt die Datei, bleibt der Blender-Soldat.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { HANDS } from './viewmodel.js';
import { WEAPONS } from '../config.js';

let model = null; // { scene, clips: { stehen, gehen, rennen, ducken, tod }, maps: { A, B } }

// Tempo, mit dem die Bewegungen von sich aus laufen (m/s, in Blender gemessen: blender/ki_schritt.py)
const PACE = { gehen: 1.2, rennen: 5.5, ducken: 1.25 };

export function loadKiSoldier() {
  return new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/ki/soldat.glb`)
    .then(gltf => {
      const clips = {};
      for (const c of gltf.animations) clips[c.name] = c;
      let map = null;
      gltf.scene.traverse(o => { if (o.isMesh && o.material.map) map = o.material.map; });
      model = { scene: gltf.scene, clips, maps: { A: map, B: map ? recolor(map) : null } };
      return true;
    })
    .catch(() => false);
}

export const hasKiSoldier = () => !!model;

// Team B: alles Blaue (Helm, Weste) wird orange. Der Farbton dreht, Helligkeit und Sättigung bleiben.
function recolor(map) {
  const img = map.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // blau: Blau führt deutlich vor Rot, genug Sättigung
    if (b !== max || max - min < 40 || b - r < 40) continue;
    const v = max / 255;
    const s = (max - min) / max;
    // Orange (Farbton 26°) mit gleicher Sättigung, etwas heller, weil Blau dunkler wirkt als Orange
    const vv = Math.min(1, v * 1.25);
    const lo = vv * (1 - s);
    d[i] = 255 * vv;
    d[i + 1] = 255 * (lo + (vv - lo) * (26 / 60));
    d[i + 2] = 255 * lo;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.wrapS = map.wrapS;
  tex.wrapT = map.wrapT;
  tex.anisotropy = map.anisotropy;
  return tex;
}

// Waffe im Zielrahmen (Ursprung am oberen Rücken): rechts vor der Schulter, vorn ist −Z
const GUN = [0.1, 0.14, -0.3];

const BONES = {
  hips: 'Hips', spine: ['Spine02', 'Spine01', 'Spine'], neck: 'neck', head: 'Head',
  armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand',
  armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand',
  legR: 'RightUpLeg', shinR: 'RightLeg', legL: 'LeftUpLeg', shinL: 'LeftLeg',
};

function buildBody(team) {
  const body = cloneSkinned(model.scene);
  const mats = [];
  body.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (model.maps[team]) o.material.map = model.maps[team];
    o.material.transparent = true;
    o.castShadow = true;
    o.frustumCulled = false; // der Hüllkörper eines Skelettmodells folgt der Bewegung nicht
    mats.push(o.material);
  });
  return { body, mats };
}

export function kiFigure(scene, team) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const { body, mats } = buildBody(team);
  body.rotation.y = Math.PI; // das Modell schaut nach +Z, die Figur nach −Z
  pivot.add(body);
  const bones = {};
  for (const [key, name] of Object.entries(BONES)) {
    bones[key] = Array.isArray(name) ? name.map(n => body.getObjectByName(n)) : body.getObjectByName(name);
  }
  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const name of ['stehen', 'gehen', 'rennen', 'ducken']) {
    if (!model.clips[name]) continue;
    actions[name] = mixer.clipAction(model.clips[name]);
    actions[name].setEffectiveWeight(name === 'stehen' ? 1 : 0).play();
  }
  // Zielrahmen: sitzt an der Brust, dreht mit dem Blick. Die Waffe hängt darin, vorn ist −Z.
  const aim = new THREE.Group();
  aim.rotation.order = 'YXZ';
  pivot.add(aim);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(...GUN);
  aim.add(gunHolder);
  scene.add(group);
  return {
    ki: true, team, group, pivot, body, mats, bones, mixer, actions, aim, gunHolder,
    flash: 0, fall: 0, weapon: null, muzzle: 0, muzzleMesh: null,
    kneel: 0, last: null, bodyYaw: null, reloadLeft: 0, reloadTime: 1, w: { stehen: 1, gehen: 0, rennen: 0, ducken: 0 },
    air: 0, stab: 0, hitFrom: null, flinch: 0, headshot: false, dead: false,
  };
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _gq = new THREE.Quaternion();
const _giq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _bq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _u = new THREE.Vector3();
const _e = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _hint = new THREE.Vector3();

// Knochen im Raum der Figur drehen: dq ist eine Drehung im Raum der Gruppe (x quer, −z nach vorn)
function turn(bone, gq, giq, dq) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_bq);
  // Welt-Drehung = Gruppe · dq · Gruppe⁻¹
  _q1.copy(gq).multiply(dq).multiply(giq).multiply(_bq);
  bone.quaternion.copy(_pq.invert().multiply(_q1));
  bone.updateMatrixWorld(true);
}

// Knochen so schwenken, dass er (seine +Y-Achse) in die Weltrichtung dir zeigt; die Verdrehung um die eigene Achse
// bleibt, wie die Bewegung sie vorgibt
function point(bone, dir) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_bq);
  _v1.copy(Y).applyQuaternion(_bq).normalize();
  _dq.setFromUnitVectors(_v1, dir);
  _q1.copy(_dq).multiply(_bq);
  bone.quaternion.copy(_pq.invert().multiply(_q1));
  bone.updateMatrixWorld(true);
}

// Arm an einen Weltpunkt: Oberarm und Unterarm über den Kosinussatz, der Ellbogen weicht Richtung hint aus
function reach(upper, fore, hand, target, hint) {
  upper.getWorldPosition(_s);
  fore.getWorldPosition(_v1);
  hand.getWorldPosition(_v2);
  const l1 = _s.distanceTo(_v1);
  const l2 = _v1.distanceTo(_v2) + 0.07; // bis zur Griffmitte in der Hand
  _d.subVectors(target, _s);
  const dist = Math.max(0.05, Math.min(l1 + l2 - 0.005, _d.length()));
  _d.normalize();
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  _axis.crossVectors(_d, hint);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  _u.copy(_d).applyAxisAngle(_axis, a);
  _e.copy(_s).addScaledVector(_u, l1);
  point(upper, _u);
  _u.subVectors(target, _e).normalize();
  point(fore, _u);
}

// setWeapon kommt aus figures.js (gleiche Waffen, gleicher Mündungsblitz)
export function animateKi(f, pos, yaw, crouched, alive, dt, weapon, pitch, airborne, setWeapon, hitDir) {
  if (f.weapon !== weapon) setWeapon(f, weapon);
  const b = f.bones;
  const moved = f.last && alive ? Math.hypot(pos.x - f.last.x, pos.z - f.last.z) : 0;
  f.last = { x: pos.x, z: pos.z };
  const speed = dt > 0 ? moved / dt : 0;

  if (f.bodyYaw === null) f.bodyYaw = yaw;
  let twist = wrapAngle(yaw - f.bodyYaw);
  if (speed > 0.5 || Math.abs(twist) > 1.0 || !alive) f.bodyYaw += twist * Math.min(1, dt * 12);
  twist = wrapAngle(yaw - f.bodyYaw);

  // Gewichte der Bewegungen: stehen, gehen, rennen nach Tempo, ducken überblendet alles
  f.kneel += ((crouched ? 1 : 0) - f.kneel) * Math.min(1, dt * 14);
  const c = f.kneel;
  const run = smooth(2.6, 4.6, speed);
  const walk = smooth(0.3, 1.2, speed) * (1 - run);
  const want = { stehen: (1 - walk - run) * (1 - c), gehen: walk * (1 - c), rennen: run * (1 - c), ducken: c };
  const k = Math.min(1, dt * 10);
  for (const name in f.actions) {
    f.w[name] += (want[name] - f.w[name]) * k;
    f.actions[name].setEffectiveWeight(f.w[name]);
  }
  if (f.actions.gehen) f.actions.gehen.timeScale = Math.max(0.5, speed / PACE.gehen);
  if (f.actions.rennen) f.actions.rennen.timeScale = Math.max(0.6, speed / PACE.rennen);
  if (f.actions.ducken) f.actions.ducken.timeScale = Math.min(2, speed / PACE.ducken);
  f.mixer.update(dt);

  // Welt-Lage der Gruppe steht erst nach updateFigure fest; hier zählt nur ihre Drehung
  f.group.rotation.y = f.bodyYaw;
  f.group.position.set(pos.x, pos.y, pos.z);
  f.group.updateMatrixWorld(true);
  f.group.getWorldQuaternion(_gq);
  _giq.copy(_gq).invert();

  // Sprung: Beine anziehen
  const inAir = airborne && alive ? 1 : 0;
  f.air += (inAir - f.air) * Math.min(1, dt * 14);
  const air = f.air * (1 - c);
  if (air > 0.01) {
    turn(b.legR, _gq, _giq, _dq.setFromAxisAngle(X, 0.7 * air));
    turn(b.shinR, _gq, _giq, _dq.setFromAxisAngle(X, -1.3 * air));
    turn(b.legL, _gq, _giq, _dq.setFromAxisAngle(X, 0.5 * air));
    turn(b.shinL, _gq, _giq, _dq.setFromAxisAngle(X, -1.0 * air));
  }

  // Wirbelsäule: dreht mit dem Blick zur Seite und neigt sich hoch und runter, Kopf am meisten
  const look = alive ? pitch : 0;
  f.flinch = Math.max(0, f.flinch - dt);
  for (const bone of b.spine) {
    _dq.setFromAxisAngle(Y, twist / 3);
    _dq.multiply(_q1.setFromAxisAngle(X, look * 0.15));
    turn(bone, _gq, _giq, _dq);
  }
  if (f.flinch > 0) {
    // Treffer: Oberkörper zuckt kurz vom Schützen weg
    const [dx, dz] = hitDir(f);
    const kf = Math.sin((f.flinch / 0.25) * Math.PI) * 0.22;
    turn(b.spine[1], _gq, _giq, _dq.setFromAxisAngle(_axis.set(dz, 0, -dx).normalize(), kf));
  }
  turn(b.head, _gq, _giq, _dq.setFromAxisAngle(X, look * 0.35));

  // Zielrahmen an die Brust, Waffe folgt dem Blick
  b.spine[2].getWorldPosition(_v1);
  f.pivot.worldToLocal(_v1);
  f.aim.position.copy(_v1);
  f.aim.rotation.set(look * 0.85, twist, 0);
  f.aim.updateMatrixWorld(true);

  // Hände an die Waffe, wie beim Blender-Soldaten
  const h = HANDS[weapon] ?? null;
  f.reloadLeft = Math.max(0, f.reloadLeft - dt);
  const reloadK = f.reloadLeft > 0 ? Math.sin((1 - f.reloadLeft / f.reloadTime) * Math.PI) : 0;
  f.stab = Math.max(0, f.stab - dt);
  const stabK = f.stab > 0 && WEAPONS[weapon]?.melee ? Math.sin((f.stab / 0.3) * Math.PI) : 0;
  f.gunHolder.position.z = GUN[2] - 0.3 * stabK;
  f.gunHolder.updateMatrixWorld(true);
  f.aim.getWorldQuaternion(_bq);
  if (h) {
    _t.set(...h.right);
    f.gunHolder.localToWorld(_t);
    reach(b.armR, b.foreR, b.handR, _t, _hint.set(0.6, -0.7, 0.3).applyQuaternion(_bq));
    if (h.left) {
      _t.set(...h.left);
      if (reloadK && h.mag) _t.lerp(_v2.set(...h.mag), reloadK);
      f.gunHolder.localToWorld(_t);
      f.aim.getWorldQuaternion(_bq);
      reach(b.armL, b.foreL, b.handL, _t, _hint.set(-0.6, -0.7, 0.1).applyQuaternion(_bq));
    }
  }

  f.muzzle = Math.max(0, f.muzzle - dt);
  if (f.muzzleMesh) {
    f.muzzleMesh.visible = f.muzzle > 0 && alive;
    f.muzzleMesh.material.rotation = Math.random() * Math.PI;
  }
}

// Gefallene: eigene Kopie, spielt die Sterbe-Bewegung, bleibt liegen und verblasst
const corpses = [];
const LIE = 6;

export function spawnKiCorpse(f) {
  const scene = f.group.parent;
  if (!scene || !model.clips.tod) return;
  const group = new THREE.Group();
  group.position.copy(f.group.position);
  group.rotation.y = f.group.rotation.y;
  const { body, mats } = buildBody(f.team);
  body.rotation.y = Math.PI;
  group.add(body);
  const mixer = new THREE.AnimationMixer(body);
  const action = mixer.clipAction(model.clips.tod);
  action.setLoop(THREE.LoopOnce);
  action.clampWhenFinished = true;
  action.timeScale = 1.5; // die Bewegung dauert von sich aus 3,5 s, der Wiedereinstieg kommt nach 3 s
  action.play();
  scene.add(group);
  corpses.push({ group, mats, mixer, age: 0 });
}

export function updateKiCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.age += dt;
    c.mixer.update(dt);
    const fade = Math.max(0, Math.min(1, 1 - (c.age - LIE)));
    for (const m of c.mats) m.opacity = fade;
    if (fade <= 0) {
      remove(c);
      corpses.splice(i, 1);
    }
  }
}

// Geometrie und Textur gehören dem Modell, nur die Materialien sind Kopien
function remove(c) {
  c.group.parent?.remove(c.group);
  for (const m of c.mats) m.dispose();
}

export function clearKiCorpses() {
  for (const c of corpses) remove(c);
  corpses.length = 0;
}
