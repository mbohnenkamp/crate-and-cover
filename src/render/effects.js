// Leuchtspur und Einschusslöcher. Abstrakt, kein Blut.

import * as THREE from 'three';

const MAX_HOLES = 80;
const HOLE_LIFE = 10;
const TRACER_LIFE = 0.06;

export function createEffects(scene, camera) {
  const holeGeo = new THREE.PlaneGeometry(0.07, 0.07);
  const holes = [];
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true });

  function impact(point, normal) {
    if (!normal) return;
    let hole = holes.length < MAX_HOLES ? null : holes.shift();
    if (!hole) {
      hole = { mesh: new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, depthWrite: false })), age: 0 };
      scene.add(hole.mesh);
    }
    const n = new THREE.Vector3(...normal);
    hole.mesh.position.set(point.x, point.y, point.z).addScaledVector(n, 0.005);
    hole.mesh.lookAt(hole.mesh.position.clone().add(n));
    hole.age = 0;
    hole.mesh.visible = true;
    holes.push(hole);
  }

  function shot(e) {
    if (e.hit === 'wall') impact(e.end, e.normal);
    // Spur beginnt etwas rechts unterhalb der Kamera, wo die Waffe ist
    const start = new THREE.Vector3(0.2, -0.15, -0.6).applyQuaternion(camera.quaternion).add(camera.position);
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
      h.mesh.material.opacity = Math.max(0, Math.min(0.85, (HOLE_LIFE - h.age) / 2));
      h.mesh.visible = h.age < HOLE_LIFE;
    }
  }

  return { shot, impact, update };
}
