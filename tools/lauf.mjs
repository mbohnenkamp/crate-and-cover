// Läuft mit der echten Bewegung geradeaus von einem Punkt zum anderen. Für Wegpunkt-Prüfung und -Erzeugung.
import { TICK_RATE } from '../src/config.js';
import { createPlayer, stepPlayer, emptyCommand } from '../src/game/player.js';

const dt = 1 / TICK_RATE;

export function walk(world, from, to) {
  const p = createPlayer({ pos: from });
  for (let i = 0; i < 20; i++) stepPlayer(p, emptyCommand(), world, dt);
  const limit = (Math.hypot(to[0] - from[0], to[2] - from[2]) / 5 + 2) * TICK_RATE;
  for (let i = 0; i < limit; i++) {
    const dx = to[0] - p.pos.x;
    const dz = to[2] - p.pos.z;
    if (Math.hypot(dx, dz) < 0.6 && Math.abs(to[1] - p.pos.y) < 1.5) return true;
    stepPlayer(p, { ...emptyCommand(), forward: 1, yaw: Math.atan2(-dx, -dz) }, world, dt);
  }
  return false;
}
