// Waffen eines Spielers: Wechsel, Feuern, Streuung, Rückstoß, Magazin, Nachladen, Zielfernrohr.
// Treffer per Strahl (Hitscan) gegen Karte und Trefferzonen. Kennt kein Three.js.

import { WEAPONS, WEAPON_ORDER, COMBAT, MOVE } from '../config.js';
import { rayBox, rayWorld, direction } from './ray.js';
import { hitboxes } from './hitbox.js';
import { damageTarget } from './targets.js';
import { horizontalSpeed } from './player.js';
import { damagePlayer } from './game.js';

export function createArms(start = 'gewehr') {
  const ammo = {};
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    if (!w.melee) ammo[id] = { mag: w.magazine, reserve: w.reserve };
  }
  return {
    current: start,
    last: 'pistole',
    ammo,
    cooldown: 0,
    draw: WEAPONS[start].draw,
    reload: 0,
    bloom: 0,
    punch: { pitch: 0, yaw: 0 },
    sinceShot: 99,
    fireHeld: false,
    altHeld: false,
    wantScope: false,
    scoped: false,
  };
}

export function refillArms(a) {
  for (const id of Object.keys(a.ammo)) {
    a.ammo[id].mag = WEAPONS[id].magazine;
    a.ammo[id].reserve = WEAPONS[id].reserve;
  }
}

export function currentWeapon(p) {
  return WEAPONS[p.arms.current];
}

export function switchWeapon(a, id) {
  if (!WEAPONS[id] || id === a.current) return;
  a.last = a.current;
  a.current = id;
  a.draw = WEAPONS[id].draw;
  a.reload = 0;
  a.bloom = 0;
  a.wantScope = false;
  a.scoped = false;
}

export function currentSpread(p) {
  const a = p.arms;
  const w = WEAPONS[a.current];
  if (w.melee) return 0;
  const s = w.spread;
  let spread = (a.scoped ? s.scoped : s.base) + a.bloom;
  spread += s.move * Math.min(1, horizontalSpeed(p) / MOVE.runSpeed);
  if (!p.onGround) spread += s.air;
  else if (p.crouched) spread *= s.crouch;
  return spread;
}

export function stepWeapon(p, cmd, game, dt, events) {
  const a = p.arms;

  if (cmd.select && WEAPONS[cmd.select]) switchWeapon(a, cmd.select);
  if (cmd.lastWeapon) switchWeapon(a, a.last);
  if (cmd.wheel) {
    const i = WEAPON_ORDER.indexOf(a.current);
    const n = WEAPON_ORDER.length;
    switchWeapon(a, WEAPON_ORDER[(i + Math.sign(cmd.wheel) + n) % n]);
  }

  const w = WEAPONS[a.current];
  const ammo = a.ammo[a.current];

  a.cooldown = tick(a.cooldown, dt);
  a.draw = tick(a.draw, dt);
  a.sinceShot += dt;

  if (a.reload > 0) {
    a.reload = tick(a.reload, dt);
    if (a.reload === 0) {
      a.reload = 0;
      const take = Math.min(w.magazine - ammo.mag, ammo.reserve);
      ammo.mag += take;
      ammo.reserve -= take;
      events.push({ type: 'reloaded', player: p.id, weapon: a.current });
    }
  }

  const canReload = !w.melee && a.reload === 0 && ammo.mag < w.magazine && ammo.reserve > 0;
  if (canReload && (cmd.reload || (ammo.mag === 0 && a.cooldown === 0))) startReload(p, w, events);

  if (w.scope && cmd.alt && !a.altHeld) a.wantScope = !a.wantScope;
  a.scoped = !!w.scope && a.wantScope && a.reload === 0 && a.draw === 0 && a.cooldown === 0;

  const trigger = w.auto ? cmd.fire : cmd.fire && !a.fireHeld;
  const ready = a.draw === 0 && a.reload === 0 && a.cooldown === 0;
  if (trigger && ready) {
    if (w.melee) swing(p, w, game, events);
    else if (ammo.mag > 0) shoot(p, w, ammo, game, events);
    else if (!a.fireHeld) {
      events.push({ type: 'empty', player: p.id, weapon: a.current });
      if (canReload) startReload(p, w, events);
    }
  }

  if (a.sinceShot > (w.interval ?? 0) + 0.05) {
    const r = Math.exp(-COMBAT.recoilRecover * dt);
    a.punch.pitch *= r;
    a.punch.yaw *= r;
    a.bloom *= Math.exp(-COMBAT.bloomRecover * dt);
  }

  a.fireHeld = cmd.fire;
  a.altHeld = cmd.alt;
  p.speedFactor = a.scoped ? w.scope.moveFactor : w.moveFactor;
}

// Rückwärts zählen bis null, ohne Rundungsrest (sonst kommt ein Schuss einen Zeitschritt zu spät)
function tick(t, dt) {
  return t - dt > 1e-9 ? t - dt : 0;
}

function startReload(p, w, events) {
  const a = p.arms;
  a.reload = w.reload;
  a.wantScope = false;
  a.scoped = false;
  events.push({ type: 'reload', player: p.id, weapon: a.current, time: w.reload });
}

function eyeOf(p) {
  return { x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z };
}

function shoot(p, w, ammo, game, events) {
  const a = p.arms;
  const spread = currentSpread(p);
  const yaw = p.yaw + a.punch.yaw;
  const pitch = p.pitch + a.punch.pitch;
  const f = direction(yaw, pitch);
  // Zufällige Abweichung im Kegel um die Blickrichtung
  const r = spread * Math.sqrt(game.rng());
  const phi = 2 * Math.PI * game.rng();
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const up = { x: right.y * f.z - right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y - right.y * f.x };
  const dx = Math.cos(phi) * r;
  const dy = Math.sin(phi) * r;
  const d = { x: f.x + right.x * dx + up.x * dy, y: f.y + right.y * dx + up.y * dy, z: f.z + right.z * dx + up.z * dy };
  const len = Math.hypot(d.x, d.y, d.z);
  d.x /= len; d.y /= len; d.z /= len;

  const origin = eyeOf(p);
  const hit = trace(game, origin, d, COMBAT.range, p);
  events.push({ type: 'shot', shooter: p.id, weapon: a.current, origin, end: pointAt(origin, d, hit.t), hit: hit.kind, normal: hit.normal });
  applyHit(game, p, w, hit, events);

  ammo.mag--;
  a.cooldown = w.interval;
  a.sinceShot = 0;
  a.bloom = Math.min(w.spread.max, a.bloom + w.spread.bloom);
  a.punch.pitch = Math.min(w.recoil.max, a.punch.pitch + w.recoil.kick);
  a.punch.yaw += (game.rng() * 2 - 1) * w.recoil.jitter;
}

function swing(p, w, game, events) {
  const a = p.arms;
  const origin = eyeOf(p);
  const d = direction(p.yaw, p.pitch);
  const hit = trace(game, origin, d, w.range, p);
  events.push({ type: 'swing', shooter: p.id, weapon: a.current, origin, end: pointAt(origin, d, hit.t), hit: hit.kind, normal: hit.normal });
  applyHit(game, p, w, hit, events);
  a.cooldown = w.interval;
  a.sinceShot = 0;
}

function applyHit(game, shooter, w, hit, events) {
  if (!hit.target && !hit.player) return;
  const damage = Math.round(w.damage * (hit.kind === 'head' ? w.headMult : 1));
  const kill = hit.target
    ? damageTarget(hit.target, damage)
    : damagePlayer(game, hit.player, shooter, damage, hit.kind, shooter.arms.current, events);
  events.push({ type: 'hit', by: shooter.id, target: hit.target?.id ?? null, player: hit.player?.id ?? null, part: hit.kind, damage, kill });
}

function pointAt(o, d, t) {
  return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
}

// Nächster Treffer: Karte, Zielscheibe oder gegnerische Figur (kein Beschuss im eigenen Team)
export function trace(game, origin, d, maxT, shooter) {
  const wall = rayWorld(game.world, origin, d, maxT);
  let best = wall ? { t: wall.t, kind: 'wall', normal: wall.normal } : { t: maxT, kind: null, normal: null };
  const check = (boxes, extra) => {
    for (const box of boxes) {
      const h = rayBox(origin, d, box.min, box.max, best.t);
      if (h && h.t < best.t) best = { t: h.t, kind: box.part, normal: h.normal, ...extra };
    }
  };
  for (const target of game.targets) {
    if (target.alive) check(hitboxes(target.pos), { target });
  }
  for (const other of game.players) {
    if (!other.alive || other === shooter || other.team === shooter.team) continue;
    check(hitboxes(other.pos, other.crouched), { player: other });
  }
  return best;
}
