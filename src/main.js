import { TICK_RATE } from './config.js';
import { createWorld } from './game/world.js';
import { createPlayer, stepPlayer, horizontalSpeed, respawn } from './game/player.js';
import { createInput } from './input/input.js';
import { createRenderer } from './render/renderer.js';
import testkarte from './maps/testkarte.json';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const info = document.getElementById('info');

const world = createWorld(testkarte);
const spawn = world.spawns[0];
const player = createPlayer(spawn);
const input = createInput(canvas);
input.yaw = player.yaw;
const view = createRenderer(canvas, world);

let showInfo = true;
input.onLockChange = locked => overlay.classList.toggle('hidden', locked);
overlay.addEventListener('click', input.lock);
input.onKey = code => {
  if (code === 'F3') showInfo = !showInfo;
  if (code === 'KeyF') input.toggleFullscreen();
  if (code === 'KeyR') {
    respawn(player, spawn);
    input.yaw = spawn.yaw;
    input.pitch = 0;
  }
};

const dt = 1 / TICK_RATE;
let acc = 0;
let last = performance.now();
const prev = { x: 0, y: 0, z: 0 };

function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= dt) {
    prev.x = player.pos.x;
    prev.y = player.pos.y + player.eye;
    prev.z = player.pos.z;
    stepPlayer(player, input.locked ? input.command() : { ...idle, yaw: input.yaw, pitch: input.pitch }, world, dt);
    acc -= dt;
  }
  const t = acc / dt;
  const eyeY = player.pos.y + player.eye;
  view.render({
    x: prev.x + (player.pos.x - prev.x) * t,
    y: prev.y + (eyeY - prev.y) * t,
    z: prev.z + (player.pos.z - prev.z) * t,
    yaw: input.yaw,
    pitch: input.pitch,
  });

  info.classList.toggle('hidden', !showInfo);
  if (showInfo) {
    const state = !player.onGround ? 'in der Luft' : player.crouched ? 'geduckt' : input.command().walk ? 'schleichen' : 'laufen';
    info.textContent = `${horizontalSpeed(player).toFixed(1)} m/s · ${state} · Höhe ${player.pos.y.toFixed(2)} m`;
  }
  requestAnimationFrame(frame);
}

const idle = { forward: 0, right: 0, jump: false, crouch: false, walk: false };
requestAnimationFrame(frame);

// Zum Prüfen im Browser
window.arena = { player, world, input };
