// Prüft die Waffen ohne Grafik und misst Zeit bis zum Fall je Waffe und Entfernung. Aufruf: npm test

import { readFileSync } from 'node:fs';
import { WEAPONS, TICK_RATE } from '../src/config.js';
import { createGame, stepGame } from '../src/game/game.js';
import { emptyCommand } from '../src/game/player.js';
import { currentSpread } from '../src/game/weapons.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// Schießstand: nur der Boden der Testkarte. Spieler bei (0,0,12) mit Blick nach −Z,
// eine feste Zielscheibe im Abstand dist vor ihm
function setup(dist, { weapon = 'gewehr', seed = 1 } = {}) {
  const m = { ...map, boxes: map.boxes.filter(b => b.type === 'boden'), stairs: [], targets: [{ pos: [0, 0, 12 - dist] }] };
  const g = createGame(m, { mode: 'schiessstand', seed });
  g.player.pos = { x: 0, y: 0, z: 12 };
  g.player.arms.current = weapon;
  g.player.arms.draw = 0;
  run(g, {}, 10);
  return g;
}

function run(g, cmd, ticks, each) {
  const all = [];
  for (let i = 0; i < ticks; i++) {
    const p = g.player;
    const ev = stepGame(g, { ...emptyCommand(), yaw: p.yaw, pitch: p.pitch, ...(typeof cmd === 'function' ? cmd(i) : cmd) });
    all.push(...ev);
    each?.(ev, i);
  }
  return all;
}

const count = (ev, type) => ev.filter(e => e.type === type).length;
const pitchTo = (dist, height) => Math.atan2(height - 1.65, dist);

{
  const g = setup(10);
  const ev = run(g, { fire: true }, TICK_RATE);
  check('Sturmgewehr feuert 10 Schuss je Sekunde', count(ev, 'shot') === 10, `${count(ev, 'shot')} Schuss`);
}

{
  const g = setup(10, { weapon: 'pistole' });
  let ev = run(g, { fire: true }, TICK_RATE);
  check('Pistole: gehaltene Taste = ein Schuss', count(ev, 'shot') === 1);
  ev = run(g, i => ({ fire: i % 12 >= 6 }), TICK_RATE + 6);
  check('Pistole: fünf Klicks = fünf Schuss', count(ev, 'shot') === 5, `${count(ev, 'shot')}`);
}

{
  const g = setup(10);
  run(g, { fire: true }, 4 * TICK_RATE);
  const a = g.player.arms.ammo.gewehr;
  check('Magazin leer nach 30 Schuss, dann Nachladen', a.mag + a.reserve <= 90 && a.mag < 30, `Magazin ${a.mag}, Reserve ${a.reserve}`);
  run(g, {}, 3 * TICK_RATE);
  check('nach dem Nachladen voll, Reserve 60', a.mag === 30 && a.reserve === 60, `Magazin ${a.mag}, Reserve ${a.reserve}`);
  run(g, { fire: true }, 5);
  run(g, { reload: true }, 1);
  const during = run(g, { fire: true }, Math.floor(2.4 * TICK_RATE));
  check('während des Nachladens kein Schuss', count(during, 'shot') === 0);
}

{
  const g = setup(8);
  g.player.pitch = pitchTo(8, 1.65);
  const ev = run(g, { fire: true }, 1);
  const hit = ev.find(e => e.type === 'hit');
  check('Kopftreffer Sturmgewehr = 120 Schaden', hit?.part === 'head' && hit.damage === 120 && hit.kill, JSON.stringify(hit));
}

{
  const g = setup(15, { weapon: 'scharf' });
  g.player.pitch = pitchTo(15, 1.0);
  g.player.arms.wantScope = true;
  run(g, {}, 2);
  const ev = run(g, { fire: true }, 1);
  const hit = ev.find(e => e.type === 'hit');
  check('Scharfschütze: ein Körpertreffer reicht', hit?.part === 'body' && hit.kill, JSON.stringify(hit));
}

{
  const g = setup(1.2, { weapon: 'messer' });
  g.player.pitch = pitchTo(1.2, 1.0);
  const ev = run(g, { fire: true }, TICK_RATE);
  check('Messer trifft auf 1,2 m', count(ev, 'hit') >= 2, `${count(ev, 'hit')} Treffer`);
  const far = setup(2.5, { weapon: 'messer' });
  far.player.pitch = pitchTo(2.5, 1.0);
  check('Messer trifft auf 2,5 m nicht', count(run(far, { fire: true }, TICK_RATE), 'hit') === 0);
}

{
  // Zielscheibe hinter der Mauer bei z 7..7.5
  const m = { ...map, targets: [{ pos: [-5, 0, 4] }] };
  const g = createGame(m, { mode: 'schiessstand', seed: 1 });
  g.player.pos = { x: -5, y: 0, z: 12 };
  g.player.arms.draw = 0;
  g.player.pitch = pitchTo(8, 1.0);
  run(g, {}, 5);
  const ev = run(g, { fire: true }, 30);
  check('Mauer hält Schüsse auf', count(ev, 'hit') === 0 && ev.some(e => e.hit === 'wall'));
}

{
  const g = setup(10);
  const still = currentSpread(g.player);
  run(g, { forward: 1, yaw: Math.PI }, 30);
  const moving = currentSpread(g.player);
  g.player.pos = { x: 0, y: 0, z: 12 };
  run(g, {}, 60);
  run(g, { crouch: true }, 30);
  const crouched = currentSpread(g.player);
  run(g, { jump: true }, 5);
  const air = currentSpread(g.player);
  check('Streuung: Laufen > Stehen > Ducken, Sprung am größten', moving > still && crouched < still && air > moving,
    `Stand ${still.toFixed(4)} · Lauf ${moving.toFixed(4)} · geduckt ${crouched.toFixed(4)} · Luft ${air.toFixed(4)}`);
}

{
  const g = setup(10);
  run(g, { select: 'scharf' }, 1);
  const ev = run(g, { fire: true }, Math.floor(0.9 * TICK_RATE));
  check('nach dem Wechsel erst nach Ziehzeit feuern', count(ev, 'shot') === 0);
  run(g, { wheel: 1 }, 1);
  check('Mausrad nach Scharfschütze → Sturmgewehr', g.player.arms.current === 'gewehr');
  run(g, { lastWeapon: true }, 1);
  check('Q wechselt zur letzten Waffe', g.player.arms.current === 'scharf');
  run(g, { select: 'gewehr' }, 1);
  run(g, { fire: true }, 2 * TICK_RATE);
  check('Rückstoß hebt den Blick im Dauerfeuer', g.player.arms.punch.pitch > 0.08, `${g.player.arms.punch.pitch.toFixed(3)} rad`);
  run(g, {}, TICK_RATE);
  check('Rückstoß erholt sich nach 1 s', g.player.arms.punch.pitch < 0.005, `${g.player.arms.punch.pitch.toFixed(4)} rad`);
}

{
  const g2 = setup(8);
  g2.player.pitch = pitchTo(8, 1.65);
  run(g2, { fire: true }, 1);
  run(g2, {}, 1);
  const dead = !g2.targets[0].alive;
  run(g2, {}, 3 * TICK_RATE + 1);
  check('gefallene Zielscheibe steht nach 3 s wieder', dead && g2.targets[0].alive && g2.targets[0].health === 100);
}

{
  const g = setup(10);
  g.player.arms.current = 'scharf';
  const speed = [];
  run(g, { forward: 1, yaw: Math.PI }, 60);
  speed.push(Math.hypot(g.player.vel.x, g.player.vel.z));
  check('mit Scharfschützengewehr langsamer (0,8)', Math.abs(speed[0] - 5.6 * 0.8) < 0.05, `${speed[0].toFixed(2)} m/s`);
}

// Zeit bis zum Fall: Brust anvisieren, im Stand, Dauerfeuer bzw. so schnell wie möglich klicken.
// Einmal ohne Gegenziehen, einmal mit vollem Rückstoßausgleich (Maus zieht den Rückstoß genau zurück).
function timeToKill(weapon, dist, seed, compensate) {
  const g = setup(dist, { weapon, seed });
  const aim = pitchTo(dist, 1.2);
  if (weapon === 'scharf') { g.player.arms.wantScope = true; run(g, { pitch: aim }, 2); }
  let result = null;
  let shots = 0;
  run(g, i => ({
    fire: WEAPONS[weapon].auto ? true : i % 2 === 0,
    pitch: compensate ? aim - g.player.arms.punch.pitch : aim,
  }), 5 * TICK_RATE, (ev, i) => {
    shots += ev.filter(e => e.type === 'shot').length;
    if (result === null && ev.some(e => e.type === 'hit' && e.kill)) result = { t: i / TICK_RATE, shots };
  });
  return result;
}

for (const compensate of [false, true]) {
  console.log(`\nZeit bis zum Fall, Brust, im Stand, 20 Seeds — ${compensate ? 'mit Rückstoßausgleich' : 'ohne Gegenziehen'}:`);
  for (const weapon of ['gewehr', 'pistole', 'scharf']) {
    const row = [];
    for (const dist of [5, 15, 30]) {
      const res = [];
      for (let seed = 1; seed <= 20; seed++) res.push(timeToKill(weapon, dist, seed, compensate));
      const ok = res.filter(Boolean);
      const avg = k => ok.reduce((s, r) => s + r[k], 0) / ok.length;
      row.push(`${String(dist).padStart(2)} m: ${ok.length ? `${avg('t').toFixed(2)} s, ${avg('shots').toFixed(1)} Schuss` : '—'}${ok.length < 20 ? ` (${20 - ok.length}× nicht)` : ''}`);
    }
    console.log(`  ${WEAPONS[weapon].name.padEnd(21)} ${row.join(' · ')}`);
  }
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
