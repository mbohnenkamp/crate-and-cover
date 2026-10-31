// Bewegung eines Spielers: Laufen, Schleichen, Ducken, Springen, Schwerkraft, Kollision.
// Reine Logik in festen Zeitschritten, läuft genauso in Node.

import { MOVE, BODY } from '../config.js';
import { overlaps, boxesAround } from './world.js';

const EPS = 1e-4;
const HW = BODY.halfWidth;
const CROUCH_DIFF = BODY.standHeight - BODY.crouchHeight;

export function createPlayer(spawn) {
  return {
    pos: { x: spawn.pos[0], y: spawn.pos[1], z: spawn.pos[2] },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    onGround: false,
    crouched: false,
    tucked: false,
    jumped: false,
    eye: BODY.standEye,
    jumpHeld: false,
  };
}

export function emptyCommand() {
  return { forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: 0, pitch: 0 };
}

export function height(p) {
  return p.crouched ? BODY.crouchHeight : BODY.standHeight;
}

export function horizontalSpeed(p) {
  return Math.hypot(p.vel.x, p.vel.z);
}

function blocked(world, x, y, z, h) {
  return overlaps(world, x - HW, y, z - HW, x + HW, y + h, z + HW);
}

export function stepPlayer(p, cmd, world, dt) {
  p.yaw = cmd.yaw;
  p.pitch = cmd.pitch;

  updateCrouch(p, cmd, world);

  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  // Blickrichtung bei yaw 0 ist −Z (wie die Three.js-Kamera)
  let wx = -sin * cmd.forward + cos * cmd.right;
  let wz = -cos * cmd.forward - sin * cmd.right;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  const wishSpeed = (p.crouched ? MOVE.crouchSpeed : cmd.walk ? MOVE.walkSpeed : MOVE.runSpeed) * Math.min(len, 1);
  if (len > 0) { wx /= len; wz /= len; }

  if (!cmd.jump) p.jumpHeld = false;
  let jumped = false;
  if (p.onGround && cmd.jump && !p.jumpHeld) {
    p.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight);
    p.onGround = false;
    p.jumpHeld = true;
    p.jumped = true;
    jumped = true;
  }

  let dy = 0;
  if (p.onGround) {
    applyFriction(p, dt);
    accelerate(p, wx, wz, wishSpeed, MOVE.groundAccel, dt);
  } else {
    const vy = Math.max(p.vel.y - MOVE.gravity * dt, -MOVE.maxFallSpeed);
    dy = (p.vel.y + vy) / 2 * dt; // Mittelwert: Sprunghöhe stimmt unabhängig vom Zeitschritt
    p.vel.y = vy;
    accelerate(p, wx, wz, Math.min(wishSpeed, MOVE.airMaxSpeed), MOVE.airAccel, dt);
  }

  const wasOnGround = p.onGround;
  moveHorizontal(p, world, 'x', p.vel.x * dt);
  moveHorizontal(p, world, 'z', p.vel.z * dt);
  if (p.onGround) p.vel.y = 0;
  else moveVertical(p, world, dy);
  if (p.onGround) checkGround(p, world, wasOnGround && !jumped);
  if (p.onGround) p.jumped = p.tucked = false;

  const target = p.crouched ? BODY.crouchEye : BODY.standEye;
  p.eye += (target - p.eye) * Math.min(1, BODY.eyeLerp * dt);

  if (p.pos.y < world.killY) respawn(p, world.spawns[0]);
}

// Ducken in der Luft zieht die Beine an: Füße hoch, Kopf bleibt (Ducksprung).
// Auch wenn Ducken und Springen gleichzeitig gedrückt werden.
function updateCrouch(p, cmd, world) {
  const { x, y, z } = p.pos;
  if (cmd.crouch) {
    const pressedNow = !p.crouched;
    p.crouched = true;
    if (!p.onGround && !p.tucked && (pressedNow || p.jumped) &&
        !blocked(world, x, y + CROUCH_DIFF, z, BODY.crouchHeight)) {
      p.pos.y += CROUCH_DIFF;
      p.eye -= CROUCH_DIFF;
      p.tucked = true;
    }
  } else if (p.crouched) {
    if (p.tucked && !blocked(world, x, y - CROUCH_DIFF, z, BODY.standHeight)) {
      p.pos.y -= CROUCH_DIFF;
      p.eye += CROUCH_DIFF;
      p.crouched = p.tucked = false;
    } else if (!blocked(world, x, y, z, BODY.standHeight)) {
      p.crouched = p.tucked = false;
    }
  }
}

function applyFriction(p, dt) {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed < EPS) { p.vel.x = 0; p.vel.z = 0; return; }
  const drop = Math.max(speed, MOVE.stopSpeed) * MOVE.friction * dt;
  const scale = Math.max(0, speed - drop) / speed;
  p.vel.x *= scale;
  p.vel.z *= scale;
}

function accelerate(p, wx, wz, wishSpeed, accel, dt) {
  if (wishSpeed <= 0) return;
  const current = p.vel.x * wx + p.vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const a = Math.min(accel * wishSpeed * dt, add);
  p.vel.x += a * wx;
  p.vel.z += a * wz;
}

function moveHorizontal(p, world, axis, delta) {
  if (delta === 0) return;
  const h = height(p);
  const next = { ...p.pos, [axis]: p.pos[axis] + delta };
  const hits = boxesAround(world, next.x - HW, next.y, next.z - HW, next.x + HW, next.y + h, next.z + HW);
  if (hits.length === 0) { p.pos[axis] = next[axis]; return; }

  // Stufe hinauf, wenn das Hindernis niedrig genug ist
  if (p.onGround) {
    const rise = Math.max(...hits.map(b => b.max[1])) - p.pos.y;
    if (rise > 0 && rise <= MOVE.stepHeight && !blocked(world, next.x, next.y + rise, next.z, h)) {
      p.pos[axis] = next[axis];
      p.pos.y += rise;
      p.eye -= rise;
      return;
    }
  }

  const i = axis === 'x' ? 0 : 2;
  p.pos[axis] = delta > 0
    ? Math.min(...hits.map(b => b.min[i])) - HW - EPS
    : Math.max(...hits.map(b => b.max[i])) + HW + EPS;
  p.vel[axis] = 0;
}

function moveVertical(p, world, delta) {
  const h = height(p);
  const { x, z } = p.pos;
  if (delta < 0) {
    const y0 = p.pos.y;
    const y1 = y0 + delta;
    const under = boxesAround(world, x - HW, y1, z - HW, x + HW, y0 + EPS, z + HW)
      .filter(b => b.max[1] <= y0 + EPS);
    if (under.length) {
      p.pos.y = Math.max(...under.map(b => b.max[1]));
      p.vel.y = 0;
      p.onGround = true;
    } else {
      p.pos.y = y1;
    }
  } else if (delta > 0) {
    const head = p.pos.y + h;
    const above = boxesAround(world, x - HW, head - EPS, z - HW, x + HW, head + delta, z + HW)
      .filter(b => b.min[1] >= head - EPS);
    if (above.length) {
      p.pos.y = Math.min(...above.map(b => b.min[1])) - h;
      p.vel.y = 0;
    } else {
      p.pos.y += delta;
    }
  }
}

// Noch Boden unter den Füßen? Treppen hinab ohne Abheben (Einrasten bis Stufenhöhe).
function checkGround(p, world, snap) {
  const { x, y, z } = p.pos;
  const reach = snap ? MOVE.stepHeight : 0.02;
  const under = boxesAround(world, x - HW, y - reach, z - HW, x + HW, y + EPS, z + HW)
    .filter(b => b.max[1] <= y + EPS);
  if (!under.length) { p.onGround = false; return; }
  const top = Math.max(...under.map(b => b.max[1]));
  if (y - top > 0.02 && snap) {
    p.eye += y - top;
    p.pos.y = top;
  } else if (y - top > 0.02) {
    p.onGround = false;
  }
}

export function respawn(p, spawn) {
  p.pos.x = spawn.pos[0];
  p.pos.y = spawn.pos[1];
  p.pos.z = spawn.pos[2];
  p.vel.x = p.vel.y = p.vel.z = 0;
  p.onGround = false;
  p.crouched = p.tucked = p.jumped = false;
  p.eye = BODY.standEye;
}
