// Waffe unten rechts im Bild, aus Blöcken. Eigene Szene, damit sie nie in Wände ragt.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../config.js';

let loaded = null;
let hands = null;

// KI-Modelle (Meshy über Higgsfield, public/models/ki): Probe, nur lokal. Sie haben Vorrang vor den Blender-Modellen,
// wenn ihre Datei da ist; ?soldat=alt in der Adresse zeigt zum Vergleich alles aus Blender.
export const KI = new URLSearchParams(location.search).get('soldat') !== 'alt';
const KI_WEAPONS = ['gewehr', 'pistole', 'messer', 'scharf'];
const kiWeapons = {};
let kiArms = null;

const load = file => new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${file}`).then(gltf => gltf.scene);

// Waffen aus Blender (public/models/custom/waffen.glb, nach entwuerfe/Waffen.webp); fehlt die Datei, bleiben die Blöcke
export function loadWeapons() {
  return Promise.all([
    load('custom/waffen.glb').then(scene => { loaded = scene; }).catch(() => {}),
    ...(KI ? KI_WEAPONS : []).map(id => load(`ki/${id}.glb`).then(scene => {
      kiWeapons[id] = scene.getObjectByName(`waffe_${id}`);
      Object.assign(HANDS[id], KI_HANDS[id]); // Griff und Vorderschaft sitzen am KI-Modell etwas anders
    }).catch(() => {})),
  ]);
}

// Hände und Arme für die Ego-Ansicht aus Blender (haende.glb, dieselbe Hand wie am Soldaten); sonst Blöcke
export function loadHands() {
  return Promise.all([
    load('custom/haende.glb').then(scene => { hands = scene; }).catch(() => {}),
    KI ? load('ki/arm.glb').then(scene => { kiArms = scene; }).catch(() => {}) : null,
  ]);
}

const METAL = 0x2f3236;
const DARK = 0x1f2124;
const WOOD = 0x6b4a2f;
const STEEL = 0xc9ced4;

function part(group, color, size, pos) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(...pos);
  group.add(mesh);
  return mesh;
}

// Vorne ist −Z. Mündung jeweils am Ende des Laufs.
const BUILD = {
  gewehr(g) {
    part(g, METAL, [0.07, 0.09, 0.42], [0, 0, -0.05]);
    part(g, DARK, [0.03, 0.03, 0.26], [0, 0.015, -0.38]);
    part(g, DARK, [0.05, 0.14, 0.07], [0, -0.1, -0.12]);
    part(g, DARK, [0.05, 0.11, 0.05], [0, -0.09, 0.08]);
    part(g, WOOD, [0.06, 0.09, 0.2], [0, -0.02, 0.24]);
    part(g, DARK, [0.02, 0.04, 0.12], [0, 0.065, 0]);
    return -0.52;
  },
  pistole(g) {
    part(g, METAL, [0.045, 0.055, 0.2], [0, 0, -0.05]);
    part(g, DARK, [0.04, 0.12, 0.06], [0, -0.075, 0.03]);
    part(g, DARK, [0.02, 0.02, 0.02], [0, 0.035, -0.13]);
    return -0.16;
  },
  messer(g) {
    part(g, DARK, [0.035, 0.035, 0.12], [0, 0, 0.04]);
    part(g, METAL, [0.07, 0.04, 0.02], [0, 0, -0.025]);
    const blade = part(g, STEEL, [0.008, 0.045, 0.2], [0, 0.005, -0.135]);
    blade.rotation.x = 0.04;
    return -0.24;
  },
  scharf(g) {
    part(g, 0x4a5a3c, [0.07, 0.09, 0.5], [0, 0, 0]);
    part(g, DARK, [0.028, 0.028, 0.42], [0, 0.015, -0.44]);
    part(g, DARK, [0.05, 0.05, 0.24], [0, 0.085, -0.05]);
    part(g, DARK, [0.065, 0.065, 0.03], [0, 0.085, -0.17]);
    part(g, DARK, [0.05, 0.12, 0.05], [0, -0.09, 0.06]);
    part(g, 0x4a5a3c, [0.06, 0.1, 0.22], [0, -0.01, 0.33]);
    return -0.66;
  },
};

// Wo die Hände je Waffe sitzen (Waffenraum, vorn −Z): rechte Hand am Griff, linke am Vorderschaft oder unter dem
// Griff, mag = wohin die linke Hand beim Nachladen greift, bolt = Kammerstängel (rechte Hand nach dem Schuss)
export const HANDS = {
  gewehr: { right: [0, -0.11, 0.09], left: [0, -0.05, -0.2], mag: [0, -0.21, -0.12] },
  pistole: { right: [0, -0.08, 0.03], left: [0, -0.115, 0.01], mag: [0, -0.2, 0.0] },
  messer: { right: [0, 0, 0.045], left: null },
  scharf: { right: [0, -0.1, 0.06], left: [0, -0.06, -0.22], mag: [0, -0.16, -0.05], bolt: [0.06, 0.04, -0.02] },
};

// Griffpunkte der KI-Waffen, ersetzen die Werte oben, sobald das Modell geladen ist
const KI_HANDS = {
  gewehr: { right: [0, -0.09, 0.085], left: [0, -0.035, -0.3], mag: [0, -0.2, -0.17] },
  pistole: { right: [0, -0.065, 0.012], left: [-0.03, -0.085, -0.01], mag: [0, -0.2, 0.0] },
  messer: { right: [0, 0, 0.005], left: null },
  scharf: { right: [0, -0.07, 0.058], left: [0, -0.035, -0.3], mag: [0, -0.15, -0.13], bolt: [0.045, -0.02, -0.04] },
};

const GLOVE = 0x17181a;
const SKIN = 0xd9c2a5;
const SLEEVE = 0x2c2e33;
const CLOTH = 0x4a4d53;

// Arm für die Ego-Ansicht: Ursprung im Handgelenk, +Z zeigt zum Ellbogen. Aus Blender (Hand mit Fingern,
// Unterarm, Ärmel, Oberarm) oder aus Blöcken, wenn das Modell fehlt.
function buildArm(side) {
  const kiModel = kiArms?.getObjectByName(`hand_${side}`);
  const model = kiModel ?? hands?.getObjectByName(`hand_${side}`);
  if (model) {
    const g = model.clone(true);
    g.position.set(0, 0, 0);
    g.userData.ki = !!kiModel;
    g.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
    return g;
  }
  const g = new THREE.Group();
  const sx = side === 'r' ? 1 : -1;
  part(g, GLOVE, [0.09, 0.08, 0.1], [0, 0, 0]);
  part(g, GLOVE, [0.09, 0.05, 0.06], [0, -0.055, -0.03]); // Finger um den Griff
  part(g, GLOVE, [0.035, 0.035, 0.06], [-sx * 0.05, 0.01, -0.03]); // Daumen innen
  part(g, SKIN, [0.065, 0.06, 0.18], [0, 0.005, 0.13]); // Unterarm
  part(g, SLEEVE, [0.085, 0.08, 0.05], [0, 0.01, 0.24]); // hochgekrempelter Ärmel
  part(g, CLOTH, [0.095, 0.09, 0.4], [0, 0.015, 0.46]); // Oberarm, läuft aus dem Bild
  return g;
}

// KI-Arm: Faust mit dem Handrücken nach außen. Die linke Hand dreht um den Unterarm: am Vorderschaft greift sie
// von unten, an der Pistole legt sie sich seitlich um die rechte.
const KI_ROLL = { gewehr: 1.2, scharf: 1.2, pistole: 0.35 };

const _elbow = new THREE.Vector3();
function placeArm(arm, hand, elbow, roll = 0) {
  arm.position.set(hand[0], hand[1], hand[2]);
  arm.lookAt(_elbow.set(elbow[0], elbow[1], elbow[2]));
  if (roll) arm.rotateZ(roll);
}

const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// Ellbogen im Waffenraum: rechts unten hinten, links unten außen — die Arme laufen unten aus dem Bild
// Weit seitlich und tief, damit man die Unterarme von der Seite sieht und nicht als dicken Querschnitt von vorn
const ELBOW = { r: [0.5, -0.5, 0.25], l: [-0.55, -0.55, 0.0] };

let flashMap = null;

// Mündungsfeuer: leuchtender Stern, dreht sich je Schuss (setzt die Waffe über material.rotation)
export function createMuzzleFlash(size) {
  if (!flashMap) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.25, 'rgba(255,214,110,0.9)');
    grad.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 9 : 31;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    flashMap = new THREE.CanvasTexture(c);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sprite.scale.setScalar(size);
  sprite.visible = false;
  return sprite;
}

// Waffe, Vorderseite −Z — auch für die Figuren der anderen Spieler. Jede bekommt eigene Materialien.
export function buildWeapon(id) {
  const model = kiWeapons[id] ?? loaded?.getObjectByName(`waffe_${id}`);
  if (!model) {
    const g = new THREE.Group();
    g.userData.muzzleZ = BUILD[id](g);
    return g;
  }
  const g = model.clone(true);
  g.position.set(0, 0, 0);
  g.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
  g.userData.muzzleZ = new THREE.Box3().setFromObject(g).min.z;
  return g;
}

export function createViewmodel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xeef2f7, 0x554a3d, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 1.6);
  light.position.set(-1, 2, 1);
  scene.add(light);

  const holder = new THREE.Group();
  holder.scale.setScalar(0.8);
  scene.add(holder);
  const models = {};
  function fill() {
    for (const g of Object.values(models)) holder.remove(g);
    for (const id of Object.keys(WEAPONS)) {
      const g = buildWeapon(id);
      const muzzleZ = g.userData.muzzleZ;
      if (!WEAPONS[id].melee) {
        const flash = createMuzzleFlash(0.22);
        flash.position.set(0, 0.015, muzzleZ - 0.04);
        g.add(flash);
        g.userData.flash = flash;
      }
      g.visible = false;
      holder.add(g);
      models[id] = g;
    }
  }
  fill();
  let armR = null;
  let armL = null;
  function fillArms() {
    if (armR) holder.remove(armR, armL);
    armR = buildArm('r');
    armL = buildArm('l');
    holder.add(armR, armL);
  }
  fillArms();

  // Magazin in der linken Hand beim Nachladen (die Waffenmodelle sind je Material verschmolzen, darum ein eigenes)
  const MAG = { gewehr: [0.05, 0.16, 0.07], pistole: [0.03, 0.1, 0.04], scharf: [0.05, 0.1, 0.06] };
  const mags = {};
  for (const [id, size] of Object.entries(MAG)) {
    const m = part(armL, DARK, size, [0, -0.07 - size[1] / 2 + 0.03, -0.06]);
    m.visible = false;
    mags[id] = m;
  }

  let swingTime = 99;
  let time = 0;
  let sprintK = 0;
  let wasGround = true;
  let jumpK = 0;
  let landK = 0;

  return {
    scene,
    camera,
    rebuild() { fill(); fillArms(); },
    swing() { swingTime = 0; },
    update(arms, info, dt, alive = true) {
      time += dt;
      swingTime += dt;
      const w = WEAPONS[arms.current];
      const shown = alive && !arms.scoped;
      for (const [id, g] of Object.entries(models)) g.visible = shown && id === arms.current;
      const g = models[arms.current];

      // Hände: rechte am Griff (nach dem Schuss kurz am Kammerstängel), linke am Vorderschaft, beim Nachladen am Magazin
      const h = HANDS[arms.current];
      const reloadK = arms.reload > 0 ? Math.sin((1 - arms.reload / w.reload) * Math.PI) : 0;
      const boltK = h.bolt && arms.sinceShot > 0.15 && arms.sinceShot < 0.9 ? Math.sin(((arms.sinceShot - 0.15) / 0.75) * Math.PI) : 0;
      armR.visible = shown;
      placeArm(armR, boltK ? lerp3(h.right, h.bolt, boltK) : h.right, ELBOW.r);
      armL.visible = shown && !!h.left;
      if (h.left) placeArm(armL, reloadK ? lerp3(h.left, h.mag, reloadK) : h.left, ELBOW.l, armL.userData.ki ? KI_ROLL[arms.current] ?? 0 : 0);
      // Magazin sichtbar, solange die linke Hand unterwegs ist (ab einem Drittel des Wegs)
      for (const [id, m] of Object.entries(mags)) m.visible = id === arms.current && reloadK > 0.35;

      let x = 0.25, y = -0.21, z = -0.55, rx = 0, ry = 0.02, rz = 0;
      if (arms.current === 'messer') { x = 0.24; y = -0.2; z = -0.45; ry = 0.25; }
      // Atmen im Stand
      y += Math.sin(time * 1.6) * 0.003;

      // Wippen beim Laufen
      const bob = Math.min(1, info.speed / 5.6) * (info.onGround ? 1 : 0);
      x += Math.cos(time * 9) * 0.008 * bob;
      y += Math.abs(Math.sin(time * 9)) * 0.01 * bob;

      // Sprinten: Waffe sinkt und dreht nach innen; Sprung: Waffe hebt sich leicht; Landung: sackt kurz ab
      const sprintTarget = info.onGround && !arms.scoped && arms.reload === 0 ? Math.max(0, Math.min(1, (info.speed - 3.6) / 1.8)) : 0;
      sprintK += (sprintTarget - sprintK) * Math.min(1, dt * 8);
      y -= 0.07 * sprintK;
      x += 0.03 * sprintK;
      rx += 0.4 * sprintK;
      ry -= 0.3 * sprintK;
      if (wasGround && !info.onGround) jumpK = 1;
      if (!wasGround && info.onGround) landK = 1;
      wasGround = info.onGround;
      jumpK = Math.max(0, jumpK - dt * 3);
      landK = Math.max(0, landK - dt * 4);
      y += 0.03 * Math.sin(jumpK * Math.PI);
      rx -= 0.08 * Math.sin(jumpK * Math.PI);
      y -= 0.06 * Math.sin(landK * Math.PI);
      rx += 0.1 * Math.sin(landK * Math.PI);

      // Ziehen: kommt von unten
      if (arms.draw > 0) {
        const k = arms.draw / w.draw;
        y -= 0.3 * k * k;
        rx -= 0.6 * k;
      }
      // Nachladen: nach unten und gekippt
      if (arms.reload > 0) {
        const k = Math.sin((1 - arms.reload / w.reload) * Math.PI);
        y -= 0.12 * k;
        rx += 0.5 * k;
        rz += 0.3 * k;
      }
      // Rückstoß
      if (!w.melee) {
        const kick = Math.exp(-arms.sinceShot * 18);
        z += 0.05 * kick * (arms.current === 'scharf' ? 2 : 1);
        rx += 0.08 * kick;
        const flash = g.userData.flash;
        if (!flash.visible && arms.sinceShot < 0.04) flash.material.rotation = Math.random() * Math.PI;
        flash.visible = arms.sinceShot < 0.04;
      } else if (swingTime < 0.3) {
        const k = Math.sin(swingTime / 0.3 * Math.PI);
        x -= 0.12 * k;
        z -= 0.12 * k;
        ry += 0.8 * k;
        rz -= 0.5 * k;
      }

      holder.position.set(x, y, z);
      holder.rotation.set(rx, ry, rz);
    },
    resize(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
