// Eine Partie: Karte, Spieler und Bots in zwei Teams, Zielscheiben, Zufall, Zeit, Punkte.
// Ein Zeitschritt liefert Ereignisse für Bild und Ton. Kennt kein Three.js, läuft auch in Node.

import { TICK_RATE, MATCH, STEPS } from '../config.js';
import { createWorld } from './world.js';
import { createPlayer, stepPlayer, respawn, horizontalSpeed } from './player.js';
import { createArms, stepWeapon, refillArms } from './weapons.js';
import { createTargets, stepTargets } from './targets.js';
import { createRng } from './rng.js';
import { createBrain, thinkBot } from './bots.js';
import { createNav } from './nav.js';

export const DT = 1 / TICK_RATE;

// Modi: "deathmatch" (Team gegen Team mit Bots) oder "schiessstand" (allein, Zielscheiben).
// humans: 1 = Marco spielt in Team A, 0 = nur Bots (Testspieler).
export function createGame(map, options = {}) {
  const o = { ...MATCH.defaults, seed: 1, humans: 1, difficultyA: null, difficultyB: null, ...options };
  const world = createWorld(map);
  const game = {
    world,
    nav: map.waypoints ? createNav(map.waypoints, world) : null,
    mode: o.mode,
    difficulty: o.difficulty,
    killGoal: o.killGoal,
    timeLimit: o.timeLimit * 60,
    players: [],
    targets: o.mode === 'schiessstand' ? createTargets(map) : [],
    rng: createRng(o.seed),
    time: 0,
    score: { A: 0, B: 0 },
    state: 'running',
    winner: null,
  };

  const teams = o.mode === 'schiessstand' ? [['A', 1]] : [['A', MATCH.teamSize], ['B', MATCH.teamSize]];
  for (const [team, size] of teams) {
    for (let i = 0; i < size; i++) {
      const human = team === 'A' && i < o.humans;
      const difficulty = (team === 'A' ? o.difficultyA : o.difficultyB) ?? o.difficulty;
      // Je Team trägt ein Bot das Scharfschützengewehr
      const weapon = !human && i === size - 1 ? 'scharf' : 'gewehr';
      addPlayer(game, { team, human, name: human ? 'Du' : MATCH.names[team][i], weapon, difficulty });
    }
  }
  game.player = game.players.find(p => !p.isBot) ?? null;
  for (const p of game.players) spawnPlayer(game, p);
  return game;
}

function addPlayer(game, { team, human, name, weapon, difficulty }) {
  const spawn = game.world.spawns.find(s => s.team === team);
  const p = createPlayer(spawn);
  Object.assign(p, {
    id: game.players.length,
    name,
    team,
    isBot: !human,
    difficulty,
    health: MATCH.health,
    alive: true,
    deadTime: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    arms: createArms(weapon),
    loadout: weapon,
  });
  if (p.isBot) p.brain = createBrain(p);
  game.players.push(p);
}

// Startpunkt des eigenen Teams, der am weitesten von lebenden Gegnern weg ist
function spawnPlayer(game, p) {
  const own = game.world.spawns.filter(s => s.team === p.team);
  const enemies = game.players.filter(e => e.alive && e.team !== p.team && e !== p);
  let best = own[0];
  let bestDist = -1;
  for (const s of own) {
    const blocked = game.players.some(o => o !== p && o.alive && Math.hypot(o.pos.x - s.pos[0], o.pos.z - s.pos[2]) < 1);
    let d = enemies.length ? Math.min(...enemies.map(e => Math.hypot(e.pos.x - s.pos[0], e.pos.z - s.pos[2]))) : game.rng();
    if (blocked) d -= 1000;
    if (d > bestDist) { bestDist = d; best = s; }
  }
  respawn(p, best);
  p.health = MATCH.health;
  p.alive = true;
  p.deadTime = 0;
  refillArms(p.arms);
  p.arms.reload = 0;
  p.arms.punch.pitch = p.arms.punch.yaw = 0;
  if (p.arms.current !== p.loadout) {
    p.arms.current = p.loadout;
    p.arms.wantScope = p.arms.scoped = false;
  }
  if (p.brain) p.brain.reset = true;
}

export function stepGame(game, humanCmd) {
  const events = [];
  if (game.state !== 'running') return events;

  for (const p of game.players) {
    if (!p.alive) {
      p.deadTime += DT;
      if (p.deadTime >= MATCH.respawnTime) {
        spawnPlayer(game, p);
        events.push({ type: 'spawn', player: p.id });
      }
      continue;
    }
    const cmd = p.isBot ? thinkBot(game, p, DT, events) : humanCmd;
    // Blick zuerst übernehmen, sonst schießt die Waffe in die Richtung des vorigen Schritts
    p.yaw = cmd.yaw;
    p.pitch = cmd.pitch;
    stepWeapon(p, cmd, game, DT, events);
    const wasOnGround = p.onGround;
    const fallSpeed = -p.vel.y;
    stepPlayer(p, cmd, game.world, DT);
    footsteps(game, p, wasOnGround, fallSpeed, events);
    if (p.pos.y < game.world.killY + 1) killPlayer(game, p, null, null, false, events);
  }

  stepTargets(game.targets, game.time, DT);
  game.time += DT;

  if (game.mode === 'deathmatch') {
    const leader = game.score.A === game.score.B ? null : game.score.A > game.score.B ? 'A' : 'B';
    if (game.score.A >= game.killGoal || game.score.B >= game.killGoal || game.time >= game.timeLimit) {
      game.state = 'ended';
      game.winner = leader;
      events.push({ type: 'end', winner: leader });
    }
  }
  return events;
}

// Laufen ist hörbar, Schleichen und geduckt Gehen nicht (wie in CS). Landungen nach einem Sprung auch.
function footsteps(game, p, wasOnGround, fallSpeed, events) {
  if (!wasOnGround && p.onGround && fallSpeed > STEPS.landSpeed) {
    p.lastStepAt = game.time;
    events.push({ type: 'land', player: p.id, pos: { ...p.pos } });
  }
  const speed = horizontalSpeed(p);
  if (!p.onGround || speed < STEPS.minSpeed) {
    p.stepDist = 0;
    return;
  }
  p.stepDist = (p.stepDist ?? 0) + speed * DT;
  if (p.stepDist >= STEPS.length) {
    p.stepDist = 0;
    p.lastStepAt = game.time;
    events.push({ type: 'step', player: p.id, pos: { ...p.pos } });
  }
}

export function damagePlayer(game, victim, shooter, damage, part, weapon, events) {
  victim.health -= damage;
  events.push({ type: 'damaged', player: victim.id, by: shooter.id, damage, from: { x: shooter.pos.x, z: shooter.pos.z } });
  if (victim.brain) victim.brain.hurtBy = shooter.id;
  if (victim.health <= 0) {
    killPlayer(game, victim, shooter, weapon, part === 'head', events);
    return true;
  }
  return false;
}

function killPlayer(game, victim, killer, weapon, head, events) {
  victim.health = 0;
  victim.alive = false;
  victim.deadTime = 0;
  victim.deaths++;
  if (killer && killer.team !== victim.team) {
    killer.kills++;
    if (head) killer.headshots++;
    game.score[killer.team]++;
  }
  events.push({ type: 'kill', killer: killer?.id ?? null, victim: victim.id, weapon, head });
}

// Nur für den Schießstand: Spieler zurück zum Start, Munition voll
export function resetPlayer(game) {
  spawnPlayer(game, game.player);
}
