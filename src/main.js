import { VIEW, WEAPONS, MATCH } from './config.js';
import { createGame, stepGame, resetPlayer, DT } from './game/game.js';
import { horizontalSpeed } from './game/player.js';
import { createInput } from './input/input.js';
import { createRenderer } from './render/renderer.js';
import { createHud, boardHtml, TEAM_NAMES } from './render/hud.js';
import { createWorld } from './game/world.js';
import testkarte from './maps/testkarte.json';

const $ = id => document.getElementById(id);
const canvas = $('game');
const overlay = $('overlay');
const info = $('info');
const screens = { menu: $('menu'), pause: $('pause'), end: $('end') };

const SETTINGS_KEY = 'arena-shooter.einstellungen';
const settings = loadSettings();

const input = createInput(canvas);
const view = createRenderer(canvas, createWorld(testkarte));
const hud = createHud();

let game = null;
let screen = 'menu';
let prev = [];
let showInfo = true;

// Einstellungen: fehlende oder ungültige Felder bekommen den Standardwert
function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch {}
  const s = { ...MATCH.defaults };
  if (['deathmatch', 'schiessstand'].includes(stored.mode)) s.mode = stored.mode;
  if (['leicht', 'mittel', 'schwer'].includes(stored.difficulty)) s.difficulty = stored.difficulty;
  if (MATCH.killGoals.includes(stored.killGoal)) s.killGoal = stored.killGoal;
  if (MATCH.timeLimits.includes(stored.timeLimit)) s.timeLimit = stored.timeLimit;
  return s;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function showScreen(name) {
  screen = name;
  overlay.classList.toggle('hidden', name === null);
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

for (const group of document.querySelectorAll('.opt')) {
  const key = group.dataset.key;
  const mark = () => {
    for (const b of group.children) b.classList.toggle('on', b.dataset.v === String(settings[key]));
  };
  group.addEventListener('click', e => {
    const v = e.target.dataset?.v;
    if (!v) return;
    settings[key] = typeof MATCH.defaults[key] === 'number' ? Number(v) : v;
    saveSettings();
    mark();
  });
  mark();
}

function newGame() {
  game = createGame(testkarte, { ...settings, seed: (Math.random() * 1e9) | 0 });
  view.setGame(game);
  hud.setGame(game);
  input.yaw = game.player.yaw;
  input.pitch = 0;
  prev = game.players.map(p => ({ ...p.pos }));
}

function startMatch() {
  newGame();
  showScreen(null);
  input.lock();
}

$('btn-start').addEventListener('click', startMatch);
$('btn-again').addEventListener('click', startMatch);
$('btn-resume').addEventListener('click', () => input.lock());
$('btn-quit').addEventListener('click', () => showScreen('menu'));
$('btn-menu').addEventListener('click', () => showScreen('menu'));

input.onLockChange = locked => {
  if (locked) showScreen(null);
  else if (screen === null) showScreen(game.state === 'ended' ? 'end' : 'pause');
};
input.onLockError = () => {
  if (screen === null) showScreen(game.state === 'ended' ? 'end' : 'pause');
};
input.onKey = code => {
  if (code === 'F3') showInfo = !showInfo;
  if (code === 'KeyF') input.toggleFullscreen();
  if (code === 'Backspace' && game.mode === 'schiessstand') {
    resetPlayer(game);
    input.yaw = game.player.yaw;
    input.pitch = 0;
  }
};

function endMatch(winner) {
  $('end-title').textContent = winner
    ? `${winner === game.player.team ? 'Gewonnen' : 'Verloren'} — Team ${TEAM_NAMES[winner]} ${game.score.A}:${game.score.B}`
    : `Unentschieden ${game.score.A}:${game.score.B}`;
  $('end-board').innerHTML = boardHtml(game);
  document.exitPointerLock();
  showScreen('end');
}

newGame();
showScreen('menu');

let acc = 0;
let last = performance.now();

function frame(now) {
  const frameDt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const me = game.player;
  // Gespielt wird nur mit gefangener Maus; im Menü und in der Pause steht die Partie
  const running = input.locked && screen === null && game.state === 'running';
  if (running) acc += frameDt;
  else acc = 0;

  while (acc >= DT) {
    game.players.forEach((p, i) => Object.assign(prev[i], p.pos, { eye: p.eye }));
    const events = stepGame(game, input.command());
    view.events(events);
    hud.events(events);
    for (const e of events) {
      if (e.type === 'spawn' && e.player === me.id) {
        input.yaw = me.yaw;
        input.pitch = 0;
      }
      if (e.type === 'end') endMatch(e.winner);
    }
    acc -= DT;
  }

  const a = me.arms;
  const scope = a.scoped && me.alive ? WEAPONS[a.current].scope : null;
  const fov = scope ? scope.fov : VIEW.fov;
  input.sensitivityScale = Math.tan((fov * Math.PI) / 360) / Math.tan((VIEW.fov * Math.PI) / 360);

  const t = acc / DT;
  const lerp = (p, i) => {
    const q = prev[i] ?? p.pos;
    return { x: q.x + (p.pos.x - q.x) * t, y: q.y + (p.pos.y - q.y) * t, z: q.z + (p.pos.z - q.z) * t };
  };
  const positions = game.players.map(lerp);
  const mine = positions[me.id];
  const limit = Math.PI / 2 - 0.01;

  let camera;
  if (screen === 'menu') {
    // Überblick über die Karte, langsam kreisend
    const r = now / 1000 * 0.05;
    camera = { x: Math.sin(r) * 13, y: 14, z: Math.cos(r) * 13, yaw: r, pitch: -0.75, fov: VIEW.fov, speed: 0, onGround: true, overview: true };
  } else {
    camera = {
      x: mine.x,
      y: mine.y + (me.alive ? me.eye : 0.5),
      z: mine.z,
      yaw: input.yaw + a.punch.yaw,
      pitch: Math.max(-limit, Math.min(limit, input.pitch + a.punch.pitch)),
      fov,
      speed: horizontalSpeed(me),
      onGround: me.onGround,
    };
  }
  view.render(camera, positions, running ? frameDt : 0);
  document.body.classList.toggle('in-menu', screen === 'menu');
  hud.update(fov, frameDt, input.isDown('Tab') && running);

  info.classList.toggle('hidden', !showInfo || screen !== null);
  if (showInfo) {
    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const state = !me.onGround ? 'in der Luft' : me.crouched ? 'geduckt' : walking ? 'schleichen' : 'laufen';
    info.textContent = `${horizontalSpeed(me).toFixed(1)} m/s · ${state} · Höhe ${me.pos.y.toFixed(2)} m`;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Zum Prüfen im Browser
window.arena = { get game() { return game; }, input, stepGame, startMatch, showScreen };
