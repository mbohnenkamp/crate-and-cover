import * as THREE from 'three';
import { VIEW, MATCH } from '../config.js';
import { createViewmodel, loadWeapons, loadHands } from './viewmodel.js';
import { createEffects } from './effects.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TEAM_COLORS, createFigure, updateFigure, updateBar, createTargetFigure, removeFigure, loadSoldier, updateCorpses, clearCorpses } from './figures.js';
import { textureFor, lookFor } from './textures.js';
import { createSky, DAYTIMES } from './sky.js';

const COLORS = {
  container: 0x8c8f93,
  steg: 0x6d7680,
  kran: 0xd9a92e,
  poller: 0x2b2d30,
  regal: 0x5b6a78,
  dach: 0x7b8088,
  pfosten: 0x6b4a2f,
  boden: 0x9a9184,
  wand: 0xcfc8bb,
  plattform: 0x7f8c99,
  balken: 0x6f7a85,
  treppe: 0x8d97a1,
  kiste: 0xb07a43,
  pfeiler: 0xb9b2a6,
  kante: 0xa39a8c,
};

// Die Karte wird je Kartenwechsel gebaut (setWorld), Figuren und Zielscheiben je Partie (setGame).
export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.autoClear = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc3d9ea, 45, 140);

  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.05, 1000);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xdde8f5, 0x6b6253, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.position.set(18, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const sky = createSky();
  scene.add(sky.dome);
  const clock = new THREE.Clock();

  // Tageszeit der Karte: Sonne, Streulicht, Himmel, Nebel, Belichtung
  function applyDaytime(t) {
    sun.position.set(...t.sun);
    sun.color.setHex(t.sunColor);
    sun.intensity = t.sunIntensity;
    hemi.color.setHex(t.hemi[0]);
    hemi.groundColor.setHex(t.hemi[1]);
    hemi.intensity = t.hemi[2];
    scene.fog.color.setHex(t.fog);
    renderer.toneMappingExposure = t.exposure;
    sky.set(t);
  }

  let mapGroup = null;
  let worldName = null;

  // Blöcke und Schmuckblöcke nach Oberfläche zusammengefasst (ein Mesh je Oberfläche). Farbe je Block als
  // Vertexfarbe mit leichter Abweichung, damit nicht jede Wand gleich aussieht. Schatten der Sonne über die ganze Karte.
  function setWorld(world) {
    if (worldName === world.name) return;
    worldName = world.name;
    applyDaytime(DAYTIMES[world.licht] ?? DAYTIMES.mittag);
    if (mapGroup) {
      scene.remove(mapGroup);
      mapGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    mapGroup = new THREE.Group();
    const groups = {};
    for (const b of [...world.boxes, ...world.deko]) {
      if (b.hidden) continue; // an seiner Stelle steht ein Blender-Modell
      const look = lookFor(b, world);
      const cast = b.type !== 'boden';
      const geo = boxGeometry(b, look === 'kiste');
      tint(geo, new THREE.Color(b.color ?? COLORS[b.type] ?? 0xff00ff), variation(b));
      (groups[look + (cast ? '+' : '-')] ??= { look, cast, geos: [] }).geos.push(geo);
    }
    for (const g of Object.values(groups)) {
      const merged = mergeGeometries(g.geos);
      for (const geo of g.geos) geo.dispose();
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: textureFor(g.look), vertexColors: true }));
      mesh.castShadow = g.cast;
      mesh.receiveShadow = true;
      mapGroup.add(mesh);
    }
    // Blender-Modelle (Baum, Brunnen, Marktstand …) an ihre Plätze; Modelle laden einmal, dann Kopien
    const group = mapGroup;
    for (const p of world.props) {
      loadProp(p.model).then(model => {
        if (!model || mapGroup !== group) return;
        const inst = model.clone(true);
        inst.position.set(p.pos[0], p.pos[1], p.pos[2]);
        inst.rotation.y = p.yaw ?? 0;
        inst.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
          if (p.color && o.material.name === `${p.model}_stoff`) {
            o.material = o.material.clone();
            o.material.color.set(p.color);
          }
        });
        group.add(inst);
      });
    }
    for (const s of world.spawns) {
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 24),
        new THREE.MeshBasicMaterial({ color: TEAM_COLORS[s.team], transparent: true, opacity: 0.6 }),
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(s.pos[0], s.pos[1] + 0.01, s.pos[2]);
      mapGroup.add(mark);
    }
    if (world.water) {
      const w = world.water;
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(w.max[0] - w.min[0], w.max[1] - w.min[1]),
        new THREE.MeshLambertMaterial({ color: 0x2f6b8f, transparent: true, opacity: 0.88 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set((w.min[0] + w.max[0]) / 2, w.y, (w.min[1] + w.max[1]) / 2);
      water.receiveShadow = true;
      mapGroup.add(water);
    }
    scene.add(mapGroup);
    const floor = world.boxes.find(b => b.type === 'boden');
    const hx = (floor.max[0] - floor.min[0]) / 2 + 4;
    const hz = (floor.max[2] - floor.min[2]) / 2 + 4;
    const r = Math.max(hx, hz);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.setScalar(r > 30 ? 4096 : 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  setWorld(world);

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
  Promise.all([loadSoldier(), loadWeapons(), loadHands()]).then(() => {
    viewmodel.rebuild();
    if (game) buildFigures();
  });

  return {
    camera,
    setWorld,
    setGame(g) {
      game = g;
      buildFigures();
      clearCorpses();
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
          if (e.hit === 'wall') effects.impact(e.end, e.normal, e.surface, true);
          if (figures[e.shooter]) figures[e.shooter].stab = 0.3;
        }
        // Richtung des Treffers merken: die Figur fällt vom Schützen weg
        if (e.type === 'hit' && e.player !== null && figures[e.player] && e.by !== undefined) {
          const a = game.players[e.by].pos;
          const b = game.players[e.player].pos;
          figures[e.player].hitFrom = { x: b.x - a.x, z: b.z - a.z };
          if (e.kill && e.part === 'head') figures[e.player].headshot = true;
          else if (!e.kill) figures[e.player].flinch = 0.25;
        }
        if (e.type === 'reload' && figures[e.player]) Object.assign(figures[e.player], { reloadLeft: e.time, reloadTime: e.time });
        if (e.type === 'hit' && e.target !== null) targets[e.target].flash = 0.09;
        if (e.type === 'hit' && e.player !== null && figures[e.player]) figures[e.player].flash = 0.09;
        // Gegner zeigen ihren Lebensbalken 3 s nach jedem Schaden
        if (e.type === 'damaged' && figures[e.player]) figures[e.player].hurtShow = 3;
      }
    },
    // positions: interpolierte Fußpunkte aller Spieler in der Reihenfolge von game.players
    render(view, positions, dt) {
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(view.pitch, view.yaw, 0);
      sky.update(clock.getDelta(), camera.position);
      if (camera.fov !== view.fov) {
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
      }
      game.players.forEach((p, i) => {
        if (!figures[i]) return;
        updateFigure(figures[i], positions[i], p.yaw, p.crouched, p.alive, dt, p.arms.current, p.pitch, !p.onGround);
        const mate = p.team === game.player.team;
        updateBar(figures[i], p.health, MATCH.health, p.alive, mate ? 1 : figures[i].hurtShow ?? 0, dt);
        if (figures[i].hurtShow) figures[i].hurtShow = 0;
      });
      game.targets.forEach((t, i) => updateFigure(targets[i], t.pos, 0, false, t.alive, dt));
      updateCorpses(dt);
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

// Box mit Texturkoordinaten in Metern, damit die Oberfläche überall gleich groß ist.
// perFace: ein Bild je Seite (Kisten, damit der Rahmen am Rand jeder Kiste liegt)
function boxGeometry(b, perFace = false) {
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const d = b.max[2] - b.min[2];
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  if (perFace) return geo;
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

const propCache = {};
function loadProp(name) {
  propCache[name] ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}models/custom/${name}.glb`)
    .then(gltf => gltf.scene)
    .catch(() => null); // fehlt das Modell, bleibt die Stelle leer (Kollision bleibt)
  return propCache[name];
}

// Farbe als Vertexfarbe auf alle Ecken, k hellt auf oder dunkelt ab
function tint(geo, color, k) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r * k;
    arr[i * 3 + 1] = color.g * k;
    arr[i * 3 + 2] = color.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// Leichte Helligkeitsabweichung je Block, aus der Lage berechnet, damit sie bei jedem Laden gleich ist
function variation(b) {
  let h = 2166136261;
  for (const v of [...b.min, ...b.max]) {
    h ^= Math.round(v * 100) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 0.93 + ((h % 1000) / 1000) * 0.14;
}
