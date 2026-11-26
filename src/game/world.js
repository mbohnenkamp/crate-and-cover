// Karte als Liste achsenparalleler Boxen. Kennt kein Three.js.

export function createWorld(map) {
  const boxes = [];
  for (const b of map.boxes) {
    boxes.push({ min: b.min, max: b.max, type: b.type, color: b.color, look: b.look, hidden: b.hidden });
  }
  for (const t of map.stairs ?? []) boxes.push(...expandStairs(t));
  return {
    name: map.name,
    boxes,
    spawns: map.spawns,
    killY: map.killY ?? -20,
    water: map.water ?? null,
    // Zonen aus dem Kartenbauer: Wasser (sichtbare Oberfläche) und Absturz (unsichtbar). Wer hineingerät, ist raus.
    zones: (map.zones ?? []).map(z => ({ kind: z.kind, min: z.min, max: z.max })),
    fallText: map.fallText ?? 'abgestürzt',
    // Nur fürs Aussehen: Oberfläche je Blockart und Schmuckblöcke ohne Kollision (Rahmen, Gesimse, Zinnen)
    looks: map.looks ?? null,
    licht: map.licht ?? 'mittag',
    deko: map.deko ?? [],
    // Blender-Modelle an Stelle von Blöcken (die Blöcke bleiben als Kollision, hidden: nicht gezeichnet)
    props: map.props ?? [],
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

// Zone an einer Stelle (Fußpunkt): drin ist, wer über der Fläche steht und mit den Füßen nicht höher als die Oberkante
export function zoneAt(world, x, y, z) {
  for (const zone of world.zones ?? []) {
    if (x >= zone.min[0] && x <= zone.max[0] && z >= zone.min[2] && z <= zone.max[2] &&
        y >= zone.min[1] - 0.5 && y <= zone.max[1] + 0.05) return zone;
  }
  return null;
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
