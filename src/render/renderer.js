import * as THREE from 'three';
import { VIEW, MATCH } from '../config.js';
import { createViewmodel, loadWeapons, loadHands } from './viewmodel.js';
import { createEffects } from './effects.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const draco = new DRACOLoader();
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TEAM_COLORS, createFigure, updateFigure, updateBar, createTargetFigure, removeFigure, loadSoldier, updateCorpses, clearCorpses } from './figures.js';
import { surfaceMaterial, lookFor, OLD_LIGHT } from './textures.js';
// ?schatten=aus: ohne vorberechnete Verschattung (zum Vergleich)
const NO_AO = new URLSearchParams(location.search).get('schatten') === 'aus';
import { createSky, DAYTIMES } from './sky.js';
import { bakeShadows } from './schatten.js';
import { PROP_MODELS } from '../game/props.js';

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

  // Umgebungslicht aus dem Himmel (je Tageszeit einmal): Licht von oben bläulich, vom Boden warm, weich je Richtung,
  // statt einer einzigen flachen Streulicht-Farbe. Metall bekommt damit auch Spiegelungen.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  function updateEnvironment() {
    if (OLD_LIGHT) return;
    const parent = sky.dome.parent;
    const holder = new THREE.Scene();
    holder.add(sky.dome);
    sky.dome.position.set(0, 0, 0);
    envTarget?.dispose();
    envTarget = pmrem.fromScene(holder, 0.04, 0.1, 1000);
    parent.add(sky.dome);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = Number(new URLSearchParams(location.search).get('umgebung') ?? 0.4);
  }

  // Tageszeit der Karte: Sonne, Streulicht, Himmel, Nebel, Belichtung
  function applyDaytime(t) {
    sun.position.set(...t.sun);
    sun.color.setHex(t.sunColor);
    sun.intensity = t.sunIntensity;
    hemi.color.setHex(t.hemi[0]);
    hemi.groundColor.setHex(t.hemi[1]);
    hemi.intensity = t.hemi[2] * (OLD_LIGHT ? 1 : 0.2); // den Großteil trägt jetzt das Umgebungslicht
    scene.fog.color.setHex(t.fog);
    renderer.toneMappingExposure = t.exposure;
    sky.set(t);
    updateEnvironment();
  }

  let mapGroup = null;
  let worldName = null;

  // Blöcke und Schmuckblöcke nach Oberfläche zusammengefasst (ein Mesh je Oberfläche). Farbe je Block als
  // Vertexfarbe mit leichter Abweichung, damit nicht jede Wand gleich aussieht. Schatten der Sonne über die ganze Karte.
  // force: auch bei gleichem Namen neu bauen; shade: Verschattung vorberechnen (im Kartenbauer aus, zu langsam je Änderung)
  let bakeMs = 0;
  function setWorld(world, force = false, shade = true) {
    if (worldName === world.name && !force) return;
    worldName = world.name;
    applyDaytime(DAYTIMES[world.licht] ?? DAYTIMES.mittag);
    if (mapGroup) {
      scene.remove(mapGroup);
      mapGroup.traverse(o => {
        o.geometry?.dispose();
        if (o.material?.map?.userData.own) o.material.map.dispose();
        if (o.material?.aoMap?.userData.own) o.material.aoMap.dispose();
        o.material?.dispose();
      });
    }
    mapGroup = new THREE.Group();
    const groups = {};
    const t0 = performance.now();
    const shadows = shade && !OLD_LIGHT && !NO_AO ? bakeShadows(world.boxes, world.deko) : null;
    bakeMs = performance.now() - t0;
    const add = (look, cast, geo) => (groups[look + (cast ? '+' : '-')] ??= { look, cast, geos: [] }).geos.push(geo);
    for (const b of [...world.boxes, ...world.deko]) {
      if (b.hidden) continue; // an seiner Stelle steht ein Blender-Modell
      // Schräge Dächer (Schmuck in Dachform statt Block): Dachflächen und Giebeldreiecke getrennt
      if (b.form) {
        const white = shadows?.rects.get(b)?.[0];
        for (const part of roofParts(b, white)) {
          tint(part.geo, new THREE.Color(part.color ?? 0xff00ff), variation(b));
          add(part.look, true, part.geo);
        }
        continue;
      }
      const look = lookFor(b, world);
      const cast = b.type !== 'boden';
      const geo = boxGeometry(b, look === 'kiste', shadows?.rects.get(b));
      tint(geo, new THREE.Color(b.color ?? COLORS[b.type] ?? 0xff00ff), variation(b));
      add(look, cast, geo);
    }
    for (const g of Object.values(groups)) {
      const merged = mergeGeometries(g.geos);
      for (const geo of g.geos) geo.dispose();
      const material = surfaceMaterial(g.look);
      if (shadows) material.aoMap = shadows.texture;
      const mesh = new THREE.Mesh(merged, material);
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
        // yaw dreht um die Hochachse, rx kippt (z. B. liegender Reifen); scale aus der Modellliste
        inst.rotation.set(p.rx ?? 0, p.yaw ?? 0, 0, 'YXZ');
        inst.scale.setScalar(PROP_MODELS[p.model]?.scale ?? 1);
        inst.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = PROP_MODELS[p.model]?.shadow !== false;
          o.receiveShadow = true;
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
    // Zonen aus dem Kartenbauer, Fläche auf der Oberkante: Wasser blau, Absturz als dunkler Abgrund
    for (const z of world.zones ?? []) {
      const w = z.max[0] - z.min[0];
      const d = z.max[2] - z.min[2];
      const material = z.kind === 'wasser'
        ? new THREE.MeshLambertMaterial({ color: 0x2f6b8f, transparent: true, opacity: 0.88 })
        : new THREE.MeshBasicMaterial({ map: abyssTexture(w, d) });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((z.min[0] + z.max[0]) / 2, z.max[1], (z.min[2] + z.max[2]) / 2);
      plane.receiveShadow = z.kind === 'wasser';
      mapGroup.add(plane);
    }
    scene.add(mapGroup);
    const floor = world.boxes.find(b => b.type === 'boden') ?? { min: [-20, 0, -20], max: [20, 0, 20] };
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

  // Nachbearbeitung mit Schalter: aus (direkt), leicht (Glühen und Kantenglättung), voll (dazu Umgebungsverdeckung)
  let composer = null;
  let effectLevel = 'aus';
  function setEffects(level) {
    effectLevel = level;
    composer?.dispose();
    composer = null;
    if (level === 'aus' && OLD_LIGHT) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (level === 'aus') {
      // Auch ohne Effekte die Farbabstimmung: ein zusätzlicher Durchgang über das Bild
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(GRADE));
      composer.setSize(w, h);
      return;
    }
    if (level === 'voll') {
      const gtao = new GTAOPass(scene, camera, w, h);
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.blendIntensity = 0.8;
      composer.addPass(gtao);
    }
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.25, 0.5, 0.92));
    composer.addPass(new OutputPass());
    if (!OLD_LIGHT) composer.addPass(new ShaderPass(GRADE));
    composer.addPass(new SMAAPass(w, h));
    composer.setSize(w, h);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewmodel.resize(w / h);
    if (composer) setEffects(effectLevel);
  }
  window.addEventListener('resize', resize);
  resize();

  function buildFigures() {
    for (const f of [...figures, ...targets]) if (f) removeFigure(scene, f);
    figures = game.players.map(p => (p === game.player ? null : createFigure(scene, p.team, p.id)));
    targets = game.targets.map(() => createTargetFigure(scene));
  }

  // Modelle kommen nach; bis dahin (oder wenn sie fehlen) Blockfiguren und Blockwaffen
  Promise.all([loadSoldier(), loadWeapons(), loadHands()]).then(() => {
    viewmodel.rebuild();
    if (game) buildFigures();
  });

  return {
    camera,
    scene,
    setWorld,
    get bakeMs() { return bakeMs; },
    setEffects,
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
        if (e.type === 'step') effects.dust(e.pos, e.player === game.player?.id ? 0.7 : 1);
        if (e.type === 'land') effects.dust(e.pos, 2);
        if (e.type === 'hit' && e.target !== null) targets[e.target].flash = 0.09;
        if (e.type === 'hit' && e.player !== null && figures[e.player]) figures[e.player].flash = 0.09;
        // Gegner zeigen ihren Lebensbalken 3 s nach jedem Schaden
        if (e.type === 'damaged' && figures[e.player]) figures[e.player].hurtShow = 3;
      }
    },
    // Nur Karte und Himmel, ohne Figuren und Waffe (Kartenbauer)
    renderPlain(view) {
      camera.position.set(view.x, view.y, view.z);
      camera.rotation.set(view.pitch, view.yaw, 0);
      sky.update(clock.getDelta(), camera.position);
      if (camera.fov !== view.fov) {
        camera.fov = view.fov;
        camera.updateProjectionMatrix();
      }
      renderer.clear();
      if (composer) composer.render();
      else renderer.render(scene, camera);
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
      if (composer) composer.render();
      else renderer.render(scene, camera);
      if (me.alive && !view.overview) {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      }
    },
  };
}

// Box mit Texturkoordinaten in Metern, damit die Oberfläche überall gleich groß ist.
// perFace: ein Bild je Seite (Kisten, damit der Rahmen am Rand jeder Kiste liegt)
// rects: Platz jeder Fläche im Verschattungsbild (schatten.js), wird zur zweiten Texturkoordinate uv1
function boxGeometry(b, perFace = false, rects = null) {
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const d = b.max[2] - b.min[2];
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  if (rects) {
    const src = geo.attributes.uv;
    const uv1 = new Float32Array(src.count * 2);
    for (let i = 0; i < src.count; i++) {
      const r = rects[i >> 2];
      uv1[i * 2] = r[0] + src.getX(i) * (r[2] - r[0]);
      uv1[i * 2 + 1] = r[1] + src.getY(i) * (r[3] - r[1]);
    }
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  }
  if (perFace) return geo;
  // Texturkoordinaten aus der Lage in der Welt (in Metern), damit Steinreihen und Bretter über
  // aneinanderstoßende Blöcke weiterlaufen. Seiten: ±x, ±y, ±z je vier Ecken.
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const f = i >> 3;
    if (f === 0) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else if (f === 1) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return geo;
}

const propCache = {};
function loadProp(name) {
  propCache[name] ??= new GLTFLoader().setDRACOLoader(draco)
    .loadAsync(`${import.meta.env.BASE_URL}models/${name.includes('/') ? name : `custom/${name}`}.glb`)
    .then(gltf => gltf.scene)
    .catch(() => null); // fehlt das Modell, bleibt die Stelle leer (Kollision bleibt)
  return propCache[name];
}

// Schräges Dach in seinem Kasten min/max: form 'satteldach' (First entlang axis 'x' oder 'z', Giebel an den Enden)
// oder 'zeltdach' (vier Flächen zur Spitze in der Mitte). Dachflächen bekommen b.color und b.look (Standard
// dachziegel), Giebel b.wallColor und b.wallLook (Standard putz). Texturkoordinaten in Metern wie bei den Blöcken.
// white: Platz im Verschattungsbild ohne Verschattung (oder null, wenn es keins gibt).
function roofParts(b, white) {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  const center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const roof = { pos: [], uv: [] };
  const gable = { pos: [], uv: [] };
  // Dreieck mit Außenseite weg von der Kastenmitte (bzw. nach unten, wenn out angegeben)
  const tri = (part, a, c, d, uvs, out = null) => {
    const n = cross(sub(c, a), sub(d, a));
    const centroid = [0, 1, 2].map(k => (a[k] + c[k] + d[k]) / 3);
    const want = out ?? sub(centroid, center);
    if (dot(n, want) < 0) { [c, d] = [d, c]; uvs = [uvs[0], uvs[2], uvs[1]]; }
    part.pos.push(...a, ...c, ...d);
    part.uv.push(...uvs.flat());
  };
  const quad = (part, a, c, d, e, uvs, out) => {
    tri(part, a, c, d, [uvs[0], uvs[1], uvs[2]], out);
    tri(part, a, d, e, [uvs[0], uvs[2], uvs[3]], out);
  };
  if (b.form === 'satteldach') {
    // in Firstrichtung: Koordinate k (along), quer: q; Hilfsfunktion baut Punkte je nach Achse
    const alongZ = b.axis !== 'x';
    const P = (q, y, k) => (alongZ ? [q, y, k] : [k, y, q]);
    const [q0, q1, k0, k1] = alongZ ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const qm = (q0 + q1) / 2;
    const slope = Math.hypot(qm - q0, y1 - y0);
    for (const qe of [q0, q1]) {
      quad(roof, P(qe, y0, k0), P(qe, y0, k1), P(qm, y1, k1), P(qm, y1, k0), [[k0, 0], [k1, 0], [k1, slope], [k0, slope]]);
    }
    for (const k of [k0, k1]) {
      tri(gable, P(q0, y0, k), P(q1, y0, k), P(qm, y1, k), [[q0, y0], [q1, y0], [qm, y1]]);
    }
    quad(roof, P(q0, y0, k0), P(q1, y0, k0), P(q1, y0, k1), P(q0, y0, k1), [[q0, k0], [q1, k0], [q1, k1], [q0, k1]], [0, -1, 0]);
  } else {
    const apex = [center[0], y1, center[2]];
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [cx, cz] = corners[(i + 1) % 4];
      const len = Math.hypot(cx - ax, cz - az);
      const h = Math.hypot(Math.hypot(apex[0] - (ax + cx) / 2, apex[2] - (az + cz) / 2), y1 - y0);
      tri(roof, [ax, y0, az], [cx, y0, cz], apex, [[0, 0], [len, 0], [len / 2, h]]);
    }
    quad(roof, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [0, -1, 0]);
  }
  const parts = [];
  for (const [part, look, color] of [[roof, b.look ?? 'dachziegel', b.color], [gable, b.wallLook ?? 'putz', b.wallColor]]) {
    if (!part.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
    geo.computeVertexNormals();
    if (white) geo.setAttribute('uv1', new THREE.Float32BufferAttribute(new Array(part.pos.length / 3 * 2).fill(white[0]), 2));
    geo.setIndex([...Array(part.pos.length / 3).keys()]); // wie BoxGeometry mit Index, sonst lässt es sich nicht zusammenlegen
    parts.push({ geo, look, color });
  }
  return parts;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

// Abgrund: innen schwarz, zum Rand hin ein schmaler Übergang in dunkles Grau, damit man die Kante sieht.
// Eigenes Bild je Zone, 32 Pixel je Meter, damit der Rand überall gleich breit ist (0,5 m).
function abyssTexture(w, d) {
  const k = Math.min(32, 512 / Math.max(w, d));
  const cw = Math.max(8, Math.round(w * k));
  const ch = Math.max(8, Math.round(d * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  const img = g.createImageData(cw, ch);
  const rim = 0.5 * k;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const edge = Math.min(x, y, cw - 1 - x, ch - 1 - y);
      const t = Math.max(0, 1 - edge / rim);
      const v = 6 + 70 * t * t;
      const i = (y * cw + x) * 4;
      img.data[i] = img.data[i + 1] = v;
      img.data[i + 2] = v + 4;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.own = true; // gehört nur dieser Zone, wird beim Kartenwechsel freigegeben
  return tex;
}

// Farbabstimmung nach Marcos Beispielbildern (realistischer Militär-Shooter): etwas entsättigt, mehr Kontrast,
// helle Töne warm, dunkle kühl, Ränder leicht abgedunkelt. Läuft nach der Tonwertabbildung auf dem fertigen Bild.
const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 0.72);
      col = (col - 0.5) * 1.18 + 0.5;
      col += vec3(0.025, 0.008, -0.02) * smoothstep(0.45, 1.0, l);
      col += vec3(-0.02, 0.0, 0.025) * (1.0 - smoothstep(0.0, 0.45, l));
      col *= mix(0.72, 1.0, smoothstep(0.9, 0.35, length(vUv - 0.5)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
