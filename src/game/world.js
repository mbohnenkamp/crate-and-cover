// Karte als Liste achsenparalleler Boxen. Kennt kein Three.js.

export function createWorld(map) {
  const boxes = [];
  for (const b of map.boxes) {
    boxes.push({ min: b.min, max: b.max, type: b.type, color: b.color });
  }
  for (const t of map.stairs ?? []) boxes.push(...expandStairs(t));
  return {
    name: map.name,
    boxes,
    spawns: map.spawns,
    killY: map.killY ?? -20,
    water: map.water ?? null,
    fallText: map.fallText ?? 'abgestürzt',
  };
}

// Treppe aus Stufen-Boxen. dir: "+x", "-x", "+z" oder "-z" = Richtung, in der es hinaufgeht.
function expandStairs(t) {
  const out = [];
  const [x0, y0, z0] = t.start;
  const axis = t.dir[1];
  const sign = t.dir[0] === '-' ? -1 : 1;
  for (let i = 0; i < t.steps; i++) {
    const top = y0 + (i + 1) * t.rise;
    const a = sign * i * t.depth;
    const b = sign * (i + 1) * t.depth;
    const along = [Math.min(a, b), Math.max(a, b)];
    const half = t.width / 2;
    const min = axis === 'x'
      ? [x0 + along[0], y0, z0 - half]
      : [x0 - half, y0, z0 + along[0]];
    const max = axis === 'x'
      ? [x0 + along[1], top, z0 + half]
      : [x0 + half, top, z0 + along[1]];
    out.push({ min, max, type: 'treppe' });
  }
  return out;
}

const EPS = 1e-4;

export function overlaps(world, minX, minY, minZ, maxX, maxY, maxZ) {
  for (const b of world.boxes) {
    if (maxX > b.min[0] + EPS && minX < b.max[0] - EPS &&
        maxY > b.min[1] + EPS && minY < b.max[1] - EPS &&
        maxZ > b.min[2] + EPS && minZ < b.max[2] - EPS) return b;
  }
  return null;
}

export function boxesAround(world, minX, minY, minZ, maxX, maxY, maxZ) {
  return world.boxes.filter(b =>
    maxX > b.min[0] + EPS && minX < b.max[0] - EPS &&
    maxY > b.min[1] + EPS && minY < b.max[1] - EPS &&
    maxZ > b.min[2] + EPS && minZ < b.max[2] - EPS);
}
