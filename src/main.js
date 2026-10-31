import { VIEW, WEAPONS } from './config.js';
import { createGame, stepGame, resetPlayer, DT } from './game/game.js';
import { horizontalSpeed, emptyCommand } from './game/player.js';
import { createInput } from './input/input.js';
import { createRenderer } from './render/renderer.js';
import { createHud } from './render/hud.js';
import testkarte from './maps/testkarte.json';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const info = document.getElementById('info');

const game = createGame(testkarte, Date.now() & 0xffff);
const { player } = game;
const spawn = game.world.spawns[0];
const input = createInput(canvas);
input.yaw = player.yaw;
const view = createRenderer(canvas, game);
const hud = createHud();

let showInfo = true;
input.onLockChange = locked => overlay.classList.toggle('hidden', locked);
overlay.addEventListener('click', input.lock);
input.onKey = code => {
  if (code === 'F3') showInfo = !showInfo;
  if (code === 'KeyF') input.toggleFullscreen();
  if (code === 'Backspace') {
    resetPlayer(game);
    input.yaw = spawn.yaw;
    input.pitch = 0;
  }
};

let acc = 0;
let last = performance.now();
const prev = { x: 0, y: 0, z: 0 };

function frame(now) {
  const frameDt = Math.min((now - last) / 1000, 0.25);
  acc += frameDt;
  last = now;
  while (acc >= DT) {
    prev.x = player.pos.x;
    prev.y = player.pos.y + player.eye;
    prev.z = player.pos.z;
    const cmd = input.locked ? input.command() : { ...emptyCommand(), yaw: input.yaw, pitch: input.pitch };
    const events = stepGame(game, cmd);
    view.events(events);
    hud.events(events);
    acc -= DT;
  }

  const a = player.arms;
  const scope = a.scoped ? WEAPONS[a.current].scope : null;
  const fov = scope ? scope.fov : VIEW.fov;
  input.sensitivityScale = Math.tan((fov * Math.PI) / 360) / Math.tan((VIEW.fov * Math.PI) / 360);

  const t = acc / DT;
  const eyeY = player.pos.y + player.eye;
  const limit = Math.PI / 2 - 0.01;
  view.render({
    x: prev.x + (player.pos.x - prev.x) * t,
    y: prev.y + (eyeY - prev.y) * t,
    z: prev.z + (player.pos.z - prev.z) * t,
    yaw: input.yaw + a.punch.yaw,
    pitch: Math.max(-limit, Math.min(limit, input.pitch + a.punch.pitch)),
    fov,
    speed: horizontalSpeed(player),
    onGround: player.onGround,
  }, frameDt);
  hud.update(player, fov, frameDt);

  info.classList.toggle('hidden', !showInfo);
  if (showInfo) {
    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const state = !player.onGround ? 'in der Luft' : player.crouched ? 'geduckt' : walking ? 'schleichen' : 'laufen';
    info.textContent = `${horizontalSpeed(player).toFixed(1)} m/s · ${state} · Höhe ${player.pos.y.toFixed(2)} m`;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Zum Prüfen im Browser
window.arena = { game, player, input, stepGame };
