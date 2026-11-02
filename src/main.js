import { VIEW, WEAPONS, MATCH } from './config.js';
import { createGame, stepGame, resetPlayer, DT } from './game/game.js';
import { horizontalSpeed } from './game/player.js';
import { createInput } from './input/input.js';
import { createRenderer } from './render/renderer.js';
import { createHud, boardHtml, TEAM_NAMES } from './render/hud.js';
import { createWorld } from './game/world.js';
import { createSound } from './audio/sound.js';
import { createMinimap } from './render/minimap.js';
import testkarte from './maps/testkarte.json';
import hafen from './maps/hafen.json';

// Schießstand gibt es nur auf der Testkarte (dort stehen die Zielscheiben)
const MAPS = { hafen, testkarte };
const mapFor = s => (s.mode === 'schiessstand' ? testkarte : MAPS[s.map]);

const $ = id => document.getElementById(id);
const canvas = $('game');
const overlay = $('overlay');
const info = $('info');
const screens = { menu: $('menu'), pause: $('pause'), end: $('end') };

const SETTINGS_KEY = 'arena-shooter.einstellungen';
const BEST_KEY = 'arena-shooter.bestenliste';
const DIFFICULTY_NAMES = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
const settings = loadSettings();

const input = createInput(canvas);
const view = createRenderer(canvas, createWorld(mapFor(settings)));
const hud = createHud();
const sound = createSound();
const minimap = createMinimap($('minimap'));

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
  if (stored.map in MAPS) s.map = stored.map;
  if (['leicht', 'mittel', 'schwer'].includes(stored.difficulty)) s.difficulty = stored.difficulty;
  if (MATCH.killGoals.includes(stored.killGoal)) s.killGoal = stored.killGoal;
  if (MATCH.timeLimits.includes(stored.timeLimit)) s.timeLimit = stored.timeLimit;
  if (stored.sensitivity >= 0.3 && stored.sensitivity <= 3) s.sensitivity = stored.sensitivity;
  if (stored.volume >= 0 && stored.volume <= 100) s.volume = stored.volume;
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
    // Im Menü zeigt der Hintergrund gleich die gewählte Karte
    if ((key === 'map' || key === 'mode') && screen === 'menu') newGame();
  });
  mark();
}

// Regler für Maus und Lautstärke, im Startmenü und in der Pause
const sliderText = { sensitivity: v => `${v.toFixed(2)}×`, volume: v => `${v} %` };
function showSliders() {
  for (const el of document.querySelectorAll('[data-setting]')) el.value = settings[el.dataset.setting];
  for (const el of document.querySelectorAll('output[data-for]')) el.textContent = sliderText[el.dataset.for](settings[el.dataset.for]);
  sound.setVolume(settings.volume / 100);
}
for (const el of document.querySelectorAll('[data-setting]')) {
  el.addEventListener('input', () => {
    settings[el.dataset.setting] = Number(el.value);
    saveSettings();
    showSliders();
for (const el of document.querySelectorAll('.demo')) el.addEventListener('click', () => { sound.unlock(); sound.demo(); });
  });
}
showSliders();

// Bestenliste: die letzten 50 Partien Team-Deathmatch, angezeigt die zehn mit den meisten Abschüssen
function loadBest() {
  try {
    const list = JSON.parse(localStorage.getItem(BEST_KEY));
    return Array.isArray(list) ? list.filter(r => r && Number.isFinite(r.kills)) : [];
  } catch { return []; }
}

function showBest() {
  const top = loadBest().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 10);
  $('best').innerHTML = top.length
    ? `<table>${top.map(r => `<tr><td>${r.date}</td><td>${r.map ?? 'Testkarte'}</td><td>${DIFFICULTY_NAMES[r.difficulty] ?? ''}</td><td>${r.result} ${r.score}</td><td>${r.kills} Abschüsse</td><td>${r.deaths} Tode</td><td>${r.headshots} Kopf</td></tr>`).join('')}</table>`
    : '<p>Noch keine Partie gespielt.</p>';
}
showBest();

function recordMatch(winner) {
  const me = game.player;
  const list = loadBest();
  const before = Math.max(0, ...list.filter(r => r.difficulty === game.difficulty).map(r => r.kills));
  list.push({
    date: new Date().toLocaleDateString('de-DE'),
    difficulty: game.difficulty,
    map: game.world.name,
    result: winner === null ? 'Unentschieden' : winner === me.team ? 'Sieg' : 'Niederlage',
    score: `${game.score.A}:${game.score.B}`,
    kills: me.kills,
    deaths: me.deaths,
    headshots: me.headshots,
  });
  try { localStorage.setItem(BEST_KEY, JSON.stringify(list.slice(-50))); } catch {}
  showBest();
  return me.kills > before ? `Neue Bestmarke auf ${DIFFICULTY_NAMES[game.difficulty]}: ${me.kills} Abschüsse` : '';
}

function newGame() {
  game = createGame(mapFor(settings), { ...settings, seed: (Math.random() * 1e9) | 0 });
  view.setWorld(game.world);
  view.setGame(game);
  hud.setGame(game);
  minimap.setGame(game);
  input.yaw = game.player.yaw;
  input.pitch = 0;
  prev = game.players.map(p => ({ ...p.pos }));
}

function startMatch() {
  sound.unlock();
  newGame();
  showScreen(null);
  input.lock();
}

$('btn-start').addEventListener('click', startMatch);
$('btn-again').addEventListener('click', startMatch);
$('btn-resume').addEventListener('click', () => { sound.unlock(); input.lock(); });
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
  $('end-record').textContent = game.mode === 'deathmatch' ? recordMatch(winner) : '';
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
    playSounds(events);
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
  input.sensitivityScale = settings.sensitivity * Math.tan((fov * Math.PI) / 360) / Math.tan((VIEW.fov * Math.PI) / 360);

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
    const far = game.world.name === 'Hafen' ? 1.9 : 1;
    camera = { x: Math.sin(r) * 13 * far, y: 14 * far, z: Math.cos(r) * 13 * far, yaw: r, pitch: -0.75, fov: VIEW.fov, speed: 0, onGround: true, overview: true };
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
  hud.update(fov, frameDt, input.isDown('Tab') && running, camera.yaw);
  if (screen !== 'menu') minimap.update(frameDt, camera.yaw);
  sound.setListener(camera, camera.yaw, camera.pitch);

  info.classList.toggle('hidden', !showInfo || screen !== null);
  if (showInfo) {
    const walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const state = !me.onGround ? 'in der Luft' : me.crouched ? 'geduckt' : walking ? 'schleichen' : 'laufen';
    info.textContent = `${horizontalSpeed(me).toFixed(1)} m/s · ${state} · Höhe ${me.pos.y.toFixed(2)} m`;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Eigene Geräusche direkt, fremde räumlich an der Stelle, wo sie entstehen
function playSounds(events) {
  const me = game.player;
  const at = id => {
    const p = game.players[id];
    return { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z };
  };
  for (const e of events) {
    const own = (e.shooter ?? e.player) === me.id;
    switch (e.type) {
      case 'shot': sound.play(`shot_${e.weapon}`, own ? null : e.origin); break;
      case 'swing': sound.play('swing', own ? null : e.origin, own ? 1 : 0.6); break;
      case 'empty': if (own) sound.play('empty'); break;
      case 'reload': sound.reload(e.time, own ? null : at(e.player), e.weapon); break;
      case 'step': sound.play('step', own ? null : { ...e.pos, y: e.pos.y + 0.1 }, own ? 0.25 : 1); break;
      case 'land': sound.play('land', own ? null : e.pos, own ? 0.6 : 1); break;
      case 'damaged': if (e.player === me.id) sound.play('hurt'); break;
      case 'hit':
        if (e.by === me.id) {
          sound.play(e.part === 'head' ? 'head' : 'hit');
          if (e.part === 'head' && e.kill) sound.play('headshot');
          if (e.kill) sound.play('kill');
        }
        break;
    }
  }
}

// Zum Prüfen im Browser
window.arena = { get game() { return game; }, input, stepGame, startMatch, showScreen, sound, settings };
