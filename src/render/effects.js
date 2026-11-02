// Leuchtspur, Einschusslöcher und Treffereffekte je Oberfläche: Stein staubt und bröckelt, Holz splittert,
// Metall funkt. Treffer an Figuren: Stoffstaub am Körper, Funken am Helm. Abstrakt, kein Blut.

import * as THREE from 'three';

const MAX_HOLES = 80;
const HOLE_LIFE = 10;
const TRACER_LIFE = 0.06;
const MAX_BITS = 400;
const MAX_SPARKS = 200;
const MAX_PUFFS = 48;
const GRAVITY = 9.8;

// Kartenblöcke nach Material
const SURFACE = { kiste: 'holz', plattform: 'metall', balken: 'metall' };

// Je Oberfläche: Loch (Farbe innen, Rand), Brocken (Farben, Anzahl, Größe, Form), Funken, Staubwolke
const LOOK = {
  stein: { hole: ['#1d1c1a', 'rgba(70,66,60,0.55)'], size: 0.07, bits: { colors: [0xb9b2a6, 0x9a9184, 0xcfc8bb], count: 6, size: 0.025, stretch: 1 }, sparks: 0, puff: { color: 0xd8d1c4, size: 0.45 } },
  holz: { hole: ['#24170d', 'rgba(205,160,105,0.7)'], size: 0.06, bits: { colors: [0xc89a62, 0xb07a43, 0x8a5a2e], count: 7, size: 0.02, stretch: 3.5 }, sparks: 0, puff: { color: 0xc9a77c, size: 0.3 } },
  metall: { hole: ['#15171a', 'rgba(215,222,230,0.7)'], size: 0.045, bits: { colors: [0x6f7a85], count: 2, size: 0.015, stretch: 1 }, sparks: 9, puff: { color: 0xbfc6cc, size: 0.22 } },
  koerper: { bits: { colors: [0x4a4d53, 0x2c2e33], count: 5, size: 0.02, stretch: 1 }, sparks: 0, puff: { color: 0x8a8d92, size: 0.35 } },
  helm: { bits: { colors: [0x2c2e33], count: 2, size: 0.015, stretch: 1 }, sparks: 12, puff: { color: 0xdfe4ea, size: 0.25 } },
};

function holeTexture([inner, rim]) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner);
  grad.addColorStop(0.5, rim);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  // leicht ausgefranster Rand
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 26 + Math.random() * 6;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createEffects(scene, camera) {
  const holeGeo = new THREE.PlaneGeometry(1, 1);
  const holeMaps = Object.fromEntries(['stein', 'holz', 'metall'].map(k => [k, holeTexture(LOOK[k].hole)]));
  const holes = [];
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true });

  // Brocken und Splitter (beleuchtet) und Funken (leuchtend) als je ein Instanz-Mesh
  const bitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_BITS);
  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false }), MAX_SPARKS);
  for (const m of [bitMesh, sparkMesh]) {
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  bitMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const bits = [];
  const sparks = [];

  const puffMap = puffTexture();
  const puffs = Array.from({ length: MAX_PUFFS }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffMap, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, age: 99, life: 1, size: 0.3, vel: new THREE.Vector3() };
  });
  let nextPuff = 0;

  const tmp = new THREE.Object3D();
  const color = new THREE.Color();
  const forward = new THREE.Vector3(0, 0, 1);

  // Zufällige Richtung um die Normale, nach außen gestreut
  function scatter(n, speed, spread) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(spread);
    return v.add(n).normalize().multiplyScalar(speed * (0.5 + Math.random()));
  }

  function burst(point, n, look, strength = 1) {
    const p = new THREE.Vector3(point.x, point.y, point.z).addScaledVector(n, 0.02);
    // weit weg lohnt sich nur die Staubwolke
    const far = p.distanceTo(camera.position) > 35;
    const b = look.bits;
    for (let i = 0; i < (far ? 0 : Math.round(b.count * strength)); i++) {
      if (bits.length >= MAX_BITS) bits.shift();
      bits.push({
        pos: p.clone(), vel: scatter(n, 3, 0.8), age: 0, life: 0.5 + Math.random() * 0.4,
        size: b.size * (0.6 + Math.random() * 0.8), stretch: b.stretch,
        color: b.colors[Math.floor(Math.random() * b.colors.length)],
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: (Math.random() - 0.5) * 20,
      });
    }
    for (let i = 0; i < (far ? 0 : Math.round(look.sparks * strength)); i++) {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      sparks.push({ pos: p.clone(), vel: scatter(n, 7, 1), age: 0, life: 0.12 + Math.random() * 0.18 });
    }
    const puff = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % MAX_PUFFS;
    puff.sprite.position.copy(p);
    puff.sprite.material.color.setHex(look.puff.color);
    puff.vel.copy(n).multiplyScalar(0.6);
    puff.size = look.puff.size * strength;
    puff.life = 0.5 + Math.random() * 0.3;
    puff.age = 0;
    puff.sprite.visible = true;
  }

  function hole(point, n, surface, scale) {
    let h = holes.length < MAX_HOLES ? null : holes.shift();
    if (!h) {
      h = { mesh: new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })), age: 0 };
      scene.add(h.mesh);
    }
    h.mesh.material.map = holeMaps[surface];
    h.mesh.material.needsUpdate = true;
    h.mesh.scale.setScalar(LOOK[surface].size * 2 * scale);
    h.mesh.position.set(point.x, point.y, point.z).addScaledVector(n, 0.005 + Math.random() * 0.002);
    h.mesh.lookAt(h.mesh.position.clone().add(n));
    h.mesh.rotateZ(Math.random() * Math.PI * 2);
    h.age = 0;
    h.mesh.visible = true;
    holes.push(h);
  }

  // Treffer an der Karte. Messer: kleinere Kerbe, wenig Brocken.
  function impact(point, normal, type = null, knife = false) {
    if (!normal) return;
    const surface = SURFACE[type] ?? 'stein';
    const n = new THREE.Vector3(...normal);
    hole(point, n, surface, knife ? 0.6 : 1);
    burst(point, n, LOOK[surface], knife ? 0.4 : 1);
  }

  function shot(e, own) {
    if (e.hit === 'wall') impact(e.end, e.normal, e.surface);
    else if (e.hit === 'head' || e.hit === 'body') {
      const n = new THREE.Vector3(e.origin.x - e.end.x, e.origin.y - e.end.y, e.origin.z - e.end.z).normalize();
      burst(e.end, n, LOOK[e.hit === 'head' ? 'helm' : 'koerper']);
    }
    // Eigene Spur beginnt rechts unterhalb der Kamera, wo die Waffe ist; fremde an der Waffe der Figur
    const start = own
      ? new THREE.Vector3(0.2, -0.15, -0.6).applyQuaternion(camera.quaternion).add(camera.position)
      : new THREE.Vector3(e.origin.x, e.origin.y - 0.35, e.origin.z);
    const geo = new THREE.BufferGeometry().setFromPoints([start, new THREE.Vector3(e.end.x, e.end.y, e.end.z)]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line);
    tracers.push({ line, age: 0 });
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.age += dt;
      t.line.material.opacity = Math.max(0, 1 - t.age / TRACER_LIFE);
      if (t.age >= TRACER_LIFE) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    for (const h of holes) {
      h.age += dt;
      h.mesh.material.opacity = Math.max(0, Math.min(0.9, (HOLE_LIFE - h.age) / 2));
      h.mesh.visible = h.age < HOLE_LIFE;
    }

    // Brocken fallen und drehen sich, werden zum Ende kleiner
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.age += dt;
      if (b.age >= b.life) { bits.splice(i, 1); continue; }
      b.vel.y -= GRAVITY * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.rot.x += b.spin * dt;
      b.rot.y += b.spin * 0.7 * dt;
    }
    bits.forEach((b, i) => {
      const s = b.size * Math.min(1, (b.life - b.age) / 0.15);
      tmp.position.copy(b.pos);
      tmp.rotation.copy(b.rot);
      tmp.scale.set(s, s, s * b.stretch);
      tmp.updateMatrix();
      bitMesh.setMatrixAt(i, tmp.matrix);
      bitMesh.setColorAt(i, color.setHex(b.color));
    });
    bitMesh.count = bits.length;
    bitMesh.instanceMatrix.needsUpdate = true;
    if (bitMesh.instanceColor) bitMesh.instanceColor.needsUpdate = true;

    // Funken fliegen schnell, gestreckt in Flugrichtung
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vel.y -= GRAVITY * 0.5 * dt;
      s.pos.addScaledVector(s.vel, dt);
    }
    sparks.forEach((s, i) => {
      const k = 1 - s.age / s.life;
      tmp.position.copy(s.pos);
      tmp.quaternion.setFromUnitVectors(forward, s.vel.clone().normalize());
      tmp.scale.set(0.016 * k, 0.016 * k, 0.12 * k);
      tmp.updateMatrix();
      sparkMesh.setMatrixAt(i, tmp.matrix);
    });
    sparkMesh.count = sparks.length;
    sparkMesh.instanceMatrix.needsUpdate = true;

    // Staubwolken wachsen und verblassen
    for (const p of puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { p.sprite.visible = false; continue; }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(p.size * (0.35 + k));
      p.sprite.material.opacity = 0.7 * (1 - k);
    }
  }

  function clear() {
    for (const t of tracers) scene.remove(t.line);
    tracers.length = 0;
    for (const h of holes) { h.age = HOLE_LIFE; h.mesh.visible = false; }
    bits.length = sparks.length = 0;
    for (const p of puffs) p.sprite.visible = false;
  }

  return { shot, impact, update, clear };
}
