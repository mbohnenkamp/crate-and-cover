// Bots: sehen, zielen, schießen, laufen über Wegpunkte, suchen Deckung, laden nach.
// Ein Bot liefert je Zeitschritt dasselbe Kommando wie die Tastatur — die Spiellogik kennt keinen Unterschied.

import { BOTS, WEAPONS, STEPS } from '../config.js';
import { emptyCommand } from './player.js';
import { nearestNode, findPath, lineOfSight } from './nav.js';
import { overlaps } from './world.js';

const PERCEIVE_EVERY = 0.1;
const COVER_RANGE = 14;
const HIGH_SNIPER = 0.75;
const HIGH_OTHERS = 0.25;

export function createBrain(p) {
  return {
    reset: true,
    yaw: p.yaw,
    pitch: 0,
    path: [],
    enemy: null,
    seenTime: 0,
    lastSeen: null,
    lastSeenAt: -99,
    perceive: 0,
    err: { yaw: 0, pitch: 0, timer: 0 },
    aimHead: false,
    stopToShoot: false,
    strafe: { dir: 1, timer: 0 },
    burst: 0,
    pause: 0,
    scopePress: false,
    stuck: { timer: 0, x: 0, z: 0 },
    hurtBy: null,
    cover: false,
    hold: 0,
    holdAt: null,
  };
}

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function turn(cur, target, max) {
  const d = wrap(target - cur);
  return cur + Math.max(-max, Math.min(max, d));
}

function aimAt(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), dist: Math.hypot(dx, dy, dz) };
}

const eye = p => ({ x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z });
const chest = p => ({ x: p.pos.x, y: p.pos.y + (p.crouched ? 0.7 : 1.0), z: p.pos.z }); // Bauch/Brust
const head = p => ({ x: p.pos.x, y: p.pos.y + (p.crouched ? 1.05 : 1.65), z: p.pos.z });

export function thinkBot(game, p, dt, events) {
  const b = p.brain;
  const skill = BOTS[p.difficulty];
  const rng = game.rng;
  const cmd = emptyCommand();
  const w = WEAPONS[p.arms.current];

  if (b.reset) {
    Object.assign(b, createBrain(p), { reset: false });
  }

  // Wahrnehmung, zehnmal je Sekunde
  b.perceive -= dt;
  if (b.perceive <= 0) {
    b.perceive = PERCEIVE_EVERY;
    perceive(game, p, b, skill);
  }

  const enemy = b.enemy !== null ? game.players[b.enemy] : null;
  let move = null; // gewünschte Laufrichtung in der Welt
  let lookYaw = b.yaw;
  let lookPitch = 0;

  if (enemy) {
    b.seenTime += dt;
    const target = b.aimHead ? head(enemy) : chest(enemy);
    const want = aimAt(eye(p), target);

    // Zielfehler, der beim Verfolgen kleiner wird
    b.err.timer -= dt;
    if (b.err.timer <= 0) {
      b.err.timer = 0.35 + rng() * 0.3;
      const settle = Math.max(skill.errFloor, 1 - b.seenTime / skill.settle);
      b.err.yaw = (rng() * 2 - 1) * skill.aimError * settle;
      b.err.pitch = (rng() * 2 - 1) * skill.aimError * settle * 0.4;
    }
    lookYaw = want.yaw + b.err.yaw;
    lookPitch = want.pitch + b.err.pitch;

    const off = Math.hypot(wrap(b.yaw - want.yaw), b.pitch - want.pitch);
    // Feuern, wenn lange genug gesehen und das Fadenkreuz nahe genug am Ziel (nah ist der Körper breiter)
    const ready = b.seenTime >= skill.reaction && off < skill.fireCone + Math.atan(0.25 / Math.max(want.dist, 0.5));

    if (w.scope && !p.arms.wantScope && want.dist > 6) cmd.alt = pressOnce(b);
    else b.scopePress = false;

    if (ready && p.arms.reload === 0 && (!w.scope || p.arms.scoped || want.dist <= 6)) {
      if (b.pause > 0) b.pause -= dt;
      else if (w.auto) {
        cmd.fire = true;
        if (p.arms.sinceShot === 0) b.burst++;
        if (b.burst >= skill.burst) { b.burst = 0; b.pause = 0.2 + rng() * 0.2; }
      } else {
        cmd.fire = p.arms.cooldown === 0 && !p.arms.fireHeld;
      }
    }

    const shooting = cmd.fire || p.arms.sinceShot < 0.3;
    const low = p.health < 35 || p.arms.reload > 0;
    if (low && !b.cover) {
      b.cover = true;
      b.path = coverPath(game, p, enemy) ?? [];
    }
    if (b.cover && b.path.length) {
      move = followPath(p, b);
    } else if (shooting && b.stopToShoot) {
      move = null;
      if (want.dist > 12 && skill.stopToShoot >= 1) cmd.crouch = true;
    } else {
      // Seitwärts ausweichen
      b.strafe.timer -= dt;
      if (b.strafe.timer <= 0) {
        b.strafe.timer = 0.5 + rng() * 0.8;
        b.strafe.dir = rng() < 0.5 ? -1 : 1;
      }
      const r = { x: Math.cos(want.yaw), z: -Math.sin(want.yaw) };
      const f = { x: -Math.sin(want.yaw), z: -Math.cos(want.yaw) };
      const toward = want.dist > skill.sight * 0.6 ? 1 : want.dist < 4 ? -0.5 : 0;
      move = { x: r.x * b.strafe.dir + f.x * toward, z: r.z * b.strafe.dir + f.z * toward };
      // Nicht über eine Kante ausweichen (Containerdach, Brücke, Stockwerk ohne Geländer)
      if (!floorAhead(game.world, p.pos, move)) {
        b.strafe.dir *= -1;
        move = { x: r.x * b.strafe.dir, z: r.z * b.strafe.dir };
        if (!floorAhead(game.world, p.pos, move)) move = null;
      }
    }
  } else {
    b.seenTime = 0;
    b.burst = 0;
    b.cover = false;
    // Oben angekommen: eine Weile bleiben und die Gegend absuchen (Scharfschütze länger)
    const holding = !b.path.length && b.hold > 0 && b.holdAt && Math.hypot(b.holdAt.x - p.pos.x, b.holdAt.z - p.pos.z) < 1.5;
    if (holding) {
      b.hold -= dt;
      lookYaw = b.yaw + Math.sin(game.time * 0.7) * 0.5;
    } else {
      b.hold = 0;
      if (!b.path.length) b.path = planPath(game, p, b) ?? [];
    }
    move = holding ? null : followPath(p, b);
    if (move) {
      lookYaw = Math.atan2(-move.x, -move.z);
      const next = b.path[0];
      if (next && Math.abs(next.y - p.pos.y) > 0.5) lookPitch = Math.atan2(next.y - p.pos.y, Math.hypot(next.x - p.pos.x, next.z - p.pos.z)) * 0.5;
    }
    const ammo = p.arms.ammo[p.arms.current];
    if (ammo && ammo.mag < w.magazine * 0.4 && ammo.reserve > 0) cmd.reload = true;
    if (p.arms.wantScope) cmd.alt = pressOnce(b);
    else b.scopePress = false;
  }

  b.yaw = turn(b.yaw, lookYaw, skill.turnSpeed * dt);
  b.pitch += Math.max(-skill.turnSpeed * dt, Math.min(skill.turnSpeed * dt, lookPitch - b.pitch));
  b.pitch = Math.max(-1.4, Math.min(1.4, b.pitch));
  // Rückstoß ausgleichen: Waffe schießt in Blick + Rückstoß
  cmd.yaw = b.yaw - p.arms.punch.yaw * skill.recoilComp;
  cmd.pitch = b.pitch - p.arms.punch.pitch * skill.recoilComp;

  if (move) {
    const len = Math.hypot(move.x, move.z);
    if (len > 1e-6) {
      const mx = move.x / len;
      const mz = move.z / len;
      cmd.forward = mx * -Math.sin(cmd.yaw) + mz * -Math.cos(cmd.yaw);
      cmd.right = mx * Math.cos(cmd.yaw) + mz * -Math.sin(cmd.yaw);
    }
    unstick(p, b, cmd, dt);
  } else {
    b.stuck.timer = 0;
  }
  return cmd;
}

function perceive(game, p, b, skill) {
  const from = eye(p);
  let best = null;
  let bestDist = Infinity;
  for (const e of game.players) {
    if (!e.alive || e.team === p.team) continue;
    const to = chest(e);
    const a = aimAt(from, to);
    if (a.dist > skill.sight) continue;
    const inView = Math.abs(wrap(a.yaw - b.yaw)) < (skill.fov * Math.PI) / 360;
    const attacker = b.hurtBy === e.id;
    if (!inView && !attacker && a.dist > 3) continue;
    if (!lineOfSight(game.world, from, to) && !lineOfSight(game.world, from, head(e))) continue;
    if (a.dist < bestDist) { bestDist = a.dist; best = e; }
  }
  b.hurtBy = null;

  if (best) {
    if (b.enemy !== best.id) {
      b.enemy = best.id;
      b.seenTime = 0;
      b.err.timer = 0;
      b.aimHead = game.rng() < skill.headChance;
      b.stopToShoot = game.rng() < skill.stopToShoot;
      b.path = [];
    }
    b.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
    b.lastSeenAt = game.time;
    return;
  }
  if (b.enemy !== null) b.path = [];
  b.enemy = null;

  // Hören: Schüsse und Schritte in der Nähe locken an. Wer schleicht, bleibt ungehört.
  for (const e of game.players) {
    if (!e.alive || e.team === p.team) continue;
    const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    const shot = e.arms.sinceShot <= 0.3 && d < STEPS.hearShots;
    const step = game.time - (e.lastStepAt ?? -99) <= 0.3 && d < STEPS.hearSteps;
    if (shot || step) {
      if (!b.lastSeen || game.time - b.lastSeenAt > 1) b.path = [];
      b.lastSeen = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
      b.lastSeenAt = game.time;
    }
  }
}

// Ziel: zuletzt gesehener oder gehörter Gegner, sonst ein zufälliger Wegpunkt; oft ein erhöhter Platz,
// der Scharfschütze meistens
function planPath(game, p, b) {
  if (!game.nav) return null;
  const start = nearestNode(game.nav, p.pos);
  let goal;
  // Der Scharfschütze jagt Geräuschen meist nicht hinterher, er bezieht lieber Stellung
  const sniper = p.loadout === 'scharf';
  if (b.lastSeen && game.time - b.lastSeenAt < 6 && !(sniper && game.rng() < 0.7)) {
    goal = nearestNode(game.nav, b.lastSeen);
    if (goal === start) b.lastSeen = null;
  }
  if (!goal || goal === start) {
    const { nodes, high, top } = game.nav;
    const up = high.length && game.rng() < (sniper ? HIGH_SNIPER : HIGH_OTHERS);
    const pool = !up ? nodes : sniper && game.rng() < 0.6 ? top : high;
    goal = pool[Math.floor(game.rng() * pool.length)];
    if (up) {
      b.holdAt = goal;
      b.hold = sniper ? 12 + game.rng() * 12 : 3 + game.rng() * 5;
    }
  }
  return findPath(game.nav, start, goal);
}

// Nächster erreichbarer Wegpunkt, den der Gegner nicht sieht
function coverPath(game, p, enemy) {
  if (!game.nav) return null;
  const start = nearestNode(game.nav, p.pos);
  const enemyEye = eye(enemy);
  let best = null;
  let bestLen = Infinity;
  for (const n of game.nav.nodes) {
    const d = Math.hypot(n.x - p.pos.x, n.z - p.pos.z);
    if (d > COVER_RANGE || d < 2) continue;
    if (lineOfSight(game.world, enemyEye, { x: n.x, y: n.y + 1.2, z: n.z })) continue;
    const path = findPath(game.nav, start, n);
    if (!path) continue;
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    if (len < bestLen) { bestLen = len; best = path; }
  }
  return best;
}

// Boden 0,9 m voraus in Bewegungsrichtung, höchstens 1 m tiefer als die Füße
function floorAhead(world, pos, move) {
  const len = Math.hypot(move.x, move.z);
  if (len < 1e-6) return true;
  const x = pos.x + (move.x / len) * 0.9;
  const z = pos.z + (move.z / len) * 0.9;
  return !!overlaps(world, x - 0.1, pos.y - 1, z - 0.1, x + 0.1, pos.y + 0.45, z + 0.1);
}

// Rechte Maustaste einmal drücken, nicht halten
function pressOnce(b) {
  if (b.scopePress) return false;
  b.scopePress = true;
  return true;
}

function followPath(p, b) {
  while (b.path.length) {
    const n = b.path[0];
    if (Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < 0.6 && Math.abs(n.y - p.pos.y) < 1.5) b.path.shift();
    else return { x: n.x - p.pos.x, z: n.z - p.pos.z };
  }
  return null;
}

// Hängt der Bot fest: erst springen, dann neuen Weg suchen
function unstick(p, b, cmd, dt) {
  const s = b.stuck;
  s.timer += dt;
  if (s.timer >= 0.8) {
    const moved = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    if (moved < 0.4 && b.enemy !== null && !b.cover) {
      b.strafe.dir *= -1; // im Gefecht gegen eine Wand ausgewichen: andere Seite
      b.strafe.timer = 0.6;
    } else if (moved < 0.4) {
      s.count = (s.count ?? 0) + 1;
      cmd.jump = true;
      if (s.count >= 2) { b.path = []; s.count = 0; p.stuckCount = (p.stuckCount ?? 0) + 1; }
    } else {
      s.count = 0;
    }
    s.timer = 0;
    s.x = p.pos.x;
    s.z = p.pos.z;
  }
}

