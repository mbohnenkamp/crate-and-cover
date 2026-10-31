// Darstellung mit Three.js: Karte aus Blöcken, Ego-Kamera.

import * as THREE from 'three';
import { VIEW, COMBAT } from '../config.js';
import { hitboxes } from '../game/hitbox.js';
import { createViewmodel } from './viewmodel.js';
import { createEffects } from './effects.js';

const COLORS = {
  boden: 0x9a9184,
  wand: 0xcfc8bb,
  plattform: 0x7f8c99,
  balken: 0x6f7a85,
  treppe: 0x8d97a1,
  kiste: 0xb07a43,
  pfeiler: 0xb9b2a6,
  kante: 0xa39a8c,
};

const TEAM_COLORS = { A: 0x3d7bd9, B: 0xe0832f };

export function createRenderer(canvas, game) {
  const world = game.world;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9c7e0);
  scene.fog = new THREE.Fog(0xa9c7e0, 40, 90);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xdde8f5, 0x6b6253, 1.4));
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(18, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const grid = gridTexture();
  const materials = {};
  for (const b of world.boxes) {
    materials[b.type] ??= new THREE.MeshLambertMaterial({ color: COLORS[b.type] ?? 0xff00ff, map: grid });
    const mesh = new THREE.Mesh(boxGeometry(b), materials[b.type]);
    mesh.castShadow = b.type !== 'boden';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const s of world.spawns) {
    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[s.team], transparent: true, opacity: 0.6 }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(s.pos[0], s.pos[1] + 0.01, s.pos[2]);
    scene.add(mark);
  }

  const targets = game.targets.map(t => createTargetMesh(scene, t));
  const viewmodel = createViewmodel();
  const effects = createEffects(scene, camera);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewmodel.resize(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    camera,
    events(list) {
      for (const e of list) {
        if (e.type === 'shot') effects.shot(e);
        if (e.type === 'swing') { viewmodel.swing(); if (e.hit === 'wall') effects.impact(e.end, e.normal); }
        if (e.type === 'hit') targets[e.target].flash = 0.09;
      }
    },
    render(view, dt) {
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(view.pitch, view.yaw, 0);
      if (camera.fov !== view.fov) {
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
      }
      for (let i = 0; i < targets.length; i++) updateTarget(targets[i], game.targets[i], dt);
      effects.update(dt);
      viewmodel.update(game.player.arms, view, dt);

      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(viewmodel.scene, viewmodel.camera);
    },
  };
}

// Zielscheibe: rote Figur mit hellem Kopf. Treffer blitzt weiß, Fall kippt nach hinten und verschwindet.
function createTargetMesh(scene, t) {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  group.add(pivot);
  const [head, body] = hitboxes({ x: 0, y: 0, z: 0 });
  const mats = [];
  for (const [box, color] of [[head, 0xf2e6d8], [body, 0xc6423a]]) {
    const size = [0, 1, 2].map(i => box.max[i] - box.min[i]);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(0, (box.min[1] + box.max[1]) / 2, 0);
    mesh.castShadow = true;
    pivot.add(mesh);
    mats.push(mat);
  }
  const ring = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true }));
  ring.position.y = 1.05;
  pivot.add(ring);
  mats.push(ring.material);
  scene.add(group);
  return { group, pivot, mats, flash: 0, fall: 0 };
}

function updateTarget(m, t, dt) {
  m.group.position.set(t.pos.x, t.pos.y, t.pos.z);
  m.flash = Math.max(0, m.flash - dt);
  for (const mat of m.mats) mat.emissive.setScalar(m.flash > 0 ? 0.9 : 0);
  if (t.alive) {
    m.fall = 0;
    m.group.visible = true;
    m.pivot.rotation.x = 0;
    for (const mat of m.mats) mat.opacity = 1;
    return;
  }
  m.fall += dt;
  const k = Math.min(1, m.fall / 0.35);
  m.pivot.rotation.x = -Math.PI / 2 * k * k;
  const fade = Math.max(0, 1 - (m.fall - 0.6) / 0.4);
  for (const mat of m.mats) mat.opacity = fade;
  m.group.visible = m.fall < Math.min(1, COMBAT.respawnTime);
}

// Box mit Texturkoordinaten in Metern, damit das Raster überall 1 m groß ist
function boxGeometry(b) {
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const d = b.max[2] - b.min[2];
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const uv = geo.attributes.uv;
  const faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * faceSize[f][0], uv.getY(i) * faceSize[f][1]);
    }
  }
  return geo;
}

function gridTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#f1f1f1';
  g.fillRect(0, 0, size / 2, size / 2);
  g.fillRect(size / 2, size / 2, size / 2, size / 2);
  g.strokeStyle = '#c4c4c4';
  g.lineWidth = 2;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
