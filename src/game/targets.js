// Zielscheiben in Figurengröße. Manche gehen hin und her. Fallen bei 0 Lebenspunkten und stehen nach 3 s wieder.
import { COMBAT } from '../config.js';

export function createTargets(map) {
  return (map.targets ?? []).map((t, id) => ({
    id,
    base: { x: t.pos[0], y: t.pos[1], z: t.pos[2] },
    pos: { x: t.pos[0], y: t.pos[1], z: t.pos[2] },
    move: t.move ?? null, // { axis: "x"|"z", range, speed }
    health: COMBAT.targetHealth,
    alive: true,
    deadTime: 0,
  }));
}

export function stepTargets(targets, time, dt) {
  for (const t of targets) {
    if (!t.alive) {
      t.deadTime += dt;
      if (t.deadTime >= COMBAT.respawnTime) {
        t.alive = true;
        t.health = COMBAT.targetHealth;
        t.deadTime = 0;
      }
      continue;
    }
    if (t.move) {
      const { axis, range, speed } = t.move;
      t.pos[axis] = t.base[axis] + Math.sin(time * speed / range) * range;
    }
  }
}

export function damageTarget(t, amount) {
  t.health -= amount;
  if (t.health <= 0) {
    t.health = 0;
    t.alive = false;
    t.deadTime = 0;
    return true;
  }
  return false;
}
