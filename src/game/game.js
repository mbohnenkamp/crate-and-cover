// Ein Spielstand: Karte, Spieler, Zielscheiben, Zufall, Zeit. Ein Zeitschritt liefert Ereignisse für Bild und Ton.

import { TICK_RATE } from '../config.js';
import { createWorld } from './world.js';
import { createPlayer, stepPlayer, respawn } from './player.js';
import { createArms, stepWeapon, refillArms } from './weapons.js';
import { createTargets, stepTargets } from './targets.js';
import { createRng } from './rng.js';

export const DT = 1 / TICK_RATE;

export function createGame(map, seed = 1) {
  const world = createWorld(map);
  const player = createPlayer(world.spawns[0]);
  player.arms = createArms();
  return {
    world,
    player,
    targets: createTargets(map),
    rng: createRng(seed),
    time: 0,
  };
}

export function stepGame(game, cmd) {
  const events = [];
  // Blick zuerst übernehmen, sonst schießt die Waffe in die Richtung des vorigen Schritts
  game.player.yaw = cmd.yaw;
  game.player.pitch = cmd.pitch;
  stepWeapon(game.player, cmd, game, DT, events);
  stepPlayer(game.player, cmd, game.world, DT);
  stepTargets(game.targets, game.time, DT);
  game.time += DT;
  return events;
}

export function resetPlayer(game) {
  respawn(game.player, game.world.spawns[0]);
  refillArms(game.player.arms);
}
