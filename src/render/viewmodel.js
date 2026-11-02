// Waffe unten rechts im Bild, aus Blöcken. Eigene Szene, damit sie nie in Wände ragt.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WEAPONS } from '../config.js';

let loaded = null;

// Waffen aus Blender (public/models/custom/waffen.glb, nach entwuerfe/Waffen.webp); fehlt die Datei, bleiben die Blöcke
export function loadWeapons() {
  return new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/custom/waffen.glb`)
    .then(gltf => { loaded = gltf.scene; return true; })
    .catch(() => false);
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
  const model = loaded?.getObjectByName(`waffe_${id}`);
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

  let swingTime = 99;
  let time = 0;

  return {
    scene,
    camera,
    rebuild: fill,
    swing() { swingTime = 0; },
    update(arms, info, dt, alive = true) {
      time += dt;
      swingTime += dt;
      const w = WEAPONS[arms.current];
      for (const [id, g] of Object.entries(models)) g.visible = alive && id === arms.current && !arms.scoped;
      const g = models[arms.current];

      let x = 0.25, y = -0.24, z = -0.55, rx = 0, ry = 0.02, rz = 0;
      if (arms.current === 'messer') { x = 0.24; y = -0.22; z = -0.45; ry = 0.25; }

      // Wippen beim Laufen
      const bob = Math.min(1, info.speed / 5.6) * (info.onGround ? 1 : 0);
      x += Math.cos(time * 9) * 0.008 * bob;
      y += Math.abs(Math.sin(time * 9)) * 0.01 * bob;

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
