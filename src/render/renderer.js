import * as THREE from 'three';
import { VIEW } from '../config.js';
import { createViewmodel, loadWeapons } from './viewmodel.js';
import { createEffects } from './effects.js';
import { TEAM_COLORS, createFigure, updateFigure, createTargetFigure, removeFigure, loadSoldier } from './figures.js';

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

// Die Karte wird einmal gebaut, Figuren und Zielscheiben je Partie (setGame).
export function createRenderer(canvas, world) {
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

  const viewmodel = createViewmodel();
  const effects = createEffects(scene, camera);
  let game = null;
  let figures = [];
  let targets = [];

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

  function buildFigures() {
    for (const f of [...figures, ...targets]) if (f) removeFigure(scene, f);
    figures = game.players.map(p => (p === game.player ? null : createFigure(scene, p.team)));
    targets = game.targets.map(() => createTargetFigure(scene));
  }

  // Modelle kommen nach; bis dahin (oder wenn sie fehlen) Blockfiguren und Blockwaffen
  Promise.all([loadSoldier(), loadWeapons()]).then(() => {
    viewmodel.rebuild();
    if (game) buildFigures();
  });

  return {
    camera,
    setGame(g) {
      game = g;
      buildFigures();
      effects.clear();
    },
    events(list) {
      for (const e of list) {
        const own = e.shooter === game.player?.id;
        if (e.type === 'shot') {
          effects.shot(e, own);
          if (figures[e.shooter]) figures[e.shooter].muzzle = 0.05;
        }
        if (e.type === 'swing') {
          if (own) viewmodel.swing();
          if (e.hit === 'wall') effects.impact(e.end, e.normal);
        }
        if (e.type === 'hit' && e.target !== null) targets[e.target].flash = 0.09;
        if (e.type === 'hit' && e.player !== null && figures[e.player]) figures[e.player].flash = 0.09;
      }
    },
    // positions: interpolierte Fußpunkte aller Spieler in der Reihenfolge von game.players
    render(view, positions, dt) {
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(view.pitch, view.yaw, 0);
      if (camera.fov !== view.fov) {
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
      }
      game.players.forEach((p, i) => {
        if (figures[i]) updateFigure(figures[i], positions[i], p.yaw, p.crouched, p.alive, dt, p.arms.current, p.pitch);
      });
      game.targets.forEach((t, i) => updateFigure(targets[i], t.pos, 0, false, t.alive, dt));
      effects.update(dt);
      const me = game.player;
      viewmodel.update(me.arms, view, dt, me.alive);

      renderer.clear();
      renderer.render(scene, camera);
      if (me.alive && !view.overview) {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      }
    },
  };
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
