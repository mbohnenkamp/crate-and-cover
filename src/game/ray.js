// Strahl gegen achsenparallele Box (Slab-Verfahren). Liefert Abstand und Flächennormale oder null.
export function rayBox(o, d, min, max, maxT = Infinity) {
  let tMin = 0;
  let tMax = maxT;
  let axis = -1;
  let sign = 0;
  const oa = [o.x, o.y, o.z];
  const da = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(da[i]) < 1e-12) {
      if (oa[i] < min[i] || oa[i] > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - oa[i]) / da[i];
    let t2 = (max[i] - oa[i]) / da[i];
    let s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tMin) { tMin = t1; axis = i; sign = s; }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  const normal = [0, 0, 0];
  if (axis >= 0) normal[axis] = sign;
  return { t: tMin, normal };
}

export function rayWorld(world, o, d, maxT) {
  let best = null;
  for (const b of world.boxes) {
    const hit = rayBox(o, d, b.min, b.max, best ? best.t : maxT);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

export function direction(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}
