// Prüft die Bewegung ohne Grafik auf der Testkarte. Aufruf: npm test

import { readFileSync } from 'node:fs';
import { TICK_RATE, MOVE } from '../src/config.js';
import { createWorld } from '../src/game/world.js';
import { createPlayer, stepPlayer, emptyCommand, horizontalSpeed } from '../src/game/player.js';

const map = JSON.parse(readFileSync(new URL('../src/maps/testkarte.json', import.meta.url)));
const world = createWorld(map);
const dt = 1 / TICK_RATE;

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

function at(x, y, z, yaw = 0) {
  const p = createPlayer({ pos: [x, y, z], yaw });
  run(p, {}, 30);
  return p;
}

function run(p, cmd, ticks, each) {
  for (let i = 0; i < ticks; i++) {
    stepPlayer(p, { ...emptyCommand(), yaw: p.yaw, ...cmd }, world, dt);
    each?.(p, i);
  }
}

// Richtung als Blickwinkel: yaw 0 = −Z, π/2 = −X, −π/2 = +X, π = +Z
const toMinusX = Math.PI / 2;
const toPlusX = -Math.PI / 2;
const toPlusZ = Math.PI;

{
  const p = createPlayer({ pos: [0, 5, 12] });
  run(p, {}, 120);
  check('fällt auf den Boden', p.onGround && Math.abs(p.pos.y) < 1e-3, `y=${p.pos.y.toFixed(3)}`);
}

for (const [name, cmd, speed] of [
  ['Laufen', {}, MOVE.runSpeed],
  ['Schleichen', { walk: true }, MOVE.walkSpeed],
  ['Geduckt', { crouch: true }, MOVE.crouchSpeed],
]) {
  const p = at(-15, 0, 14, toPlusX);
  let reached = -1;
  run(p, { forward: 1, ...cmd }, 90, (q, i) => {
    if (reached < 0 && horizontalSpeed(q) > speed * 0.95) reached = i;
  });
  const v = horizontalSpeed(p);
  check(`${name}: Endgeschwindigkeit ${speed} m/s`, Math.abs(v - speed) < 0.05, `${v.toFixed(2)} m/s nach ${(reached / TICK_RATE).toFixed(2)} s`);
}

{
  const p = at(-15, 0, 12, toPlusX);
  run(p, { forward: 1, right: 1 }, 60);
  const v = horizontalSpeed(p);
  check('schräg nicht schneller', v < MOVE.runSpeed + 0.05, `${v.toFixed(2)} m/s`);
  run(p, {}, 30);
  check('bremst in 0,5 s auf null', horizontalSpeed(p) < 0.01, `${horizontalSpeed(p).toFixed(3)} m/s`);
}

{
  const p = at(0, 0, 13, toPlusZ);
  run(p, { forward: 1 }, 120);
  check('Außenwand hält auf', p.pos.z < 16 - 0.39 && p.pos.z > 15, `z=${p.pos.z.toFixed(3)}`);
}

{
  const g = at(-6, 0, 8.5, 0);
  run(g, { forward: 1, right: 1 }, 40);
  check('gleitet schräg an der Wand entlang', g.pos.z > 7.5 && g.pos.z < 8 && g.pos.x > -4, `x=${g.pos.x.toFixed(2)} z=${g.pos.z.toFixed(2)}`);
  const q = at(-5, 0, 12);
  run(q, { forward: 1 }, 120);
  check('Wand mit Durchgang hält stehend auf', q.pos.z > 7.5, `z=${q.pos.z.toFixed(3)}`);
  const c = at(0, 0, 12);
  run(c, { forward: 1, crouch: true }, 400);
  check('geduckt durch den Durchgang', c.pos.z < 7, `z=${c.pos.z.toFixed(3)}`);
  const under = createPlayer({ pos: [0, 0, 7.25] });
  run(under, { crouch: true }, 30);
  run(under, {}, 30);
  check('unter dem Sturz kein Aufstehen', under.crouched === true, `crouched=${under.crouched}`);
  check('neben dem Sturz wieder aufstehen', (() => { const v = createPlayer({ pos: [0, 0, 9] }); run(v, { crouch: true }, 30); run(v, {}, 5); return !v.crouched; })());
}

{
  const p = at(-6, 0, 4.5, toMinusX);
  let maxY = 0;
  run(p, { forward: 1 }, 240, q => { maxY = Math.max(maxY, q.pos.y); });
  check('Treppe hinauf auf 3 m', Math.abs(p.pos.y - 3) < 1e-3 && p.onGround, `y=${p.pos.y.toFixed(3)}`);
  const back = at(-15, 3, 4.5, toPlusX);
  let lowestAir = 0;
  run(back, { forward: 1 }, 240, q => { if (!q.onGround) lowestAir++; });
  check('Treppe hinab ohne Abheben', back.pos.y < 1e-3 && lowestAir < 5, `y=${back.pos.y.toFixed(3)}, ${lowestAir} Schritte in der Luft`);
}

{
  const p = at(-15, 3, 0, toPlusX);
  run(p, { forward: 1 }, 400);
  check('über die Brücke zur anderen Plattform', p.pos.x > 13 && Math.abs(p.pos.y - 3) < 1e-3, `x=${p.pos.x.toFixed(2)} y=${p.pos.y.toFixed(2)}`);
}

{
  const p = at(14, 0, 13, 0);
  let up = false;
  run(p, { forward: 1 }, 50, q => { if (q.onGround && Math.abs(q.pos.y - 0.35) < 1e-3) up = true; });
  check('Kante 0,35 m wird hinaufgestiegen', up);
}

// Anlauf, Absprung, kurz nach der Landung loslassen. Gemessen: stand er je oben auf der Kiste?
function jumpOnto(start, yaw, top, crouchJump) {
  const p = at(...start, yaw);
  let landed = false;
  run(p, { forward: 1 }, 15);
  run(p, { forward: 1, jump: true, crouch: crouchJump }, 1);
  run(p, { forward: 1, crouch: crouchJump }, 50, q => {
    if (q.onGround && Math.abs(q.pos.y - top) < 1e-3) landed = true;
  });
  return landed;
}

{
  // Kiste 1 m bei x 3..4, z −4..−3; Kiste 1,5 m bei x 1.5..3, z −4.5..−3; Anlauf von +Z
  check('Sprung auf 1-m-Kiste', jumpOnto([3.5, 0, -0.5], 0, 1, false));
  check('1,5-m-Kiste nicht im normalen Sprung', !jumpOnto([2.25, 0, -0.5], 0, 1.5, false));
  check('1,5-m-Kiste mit Ducksprung (gleichzeitig gedrückt)', jumpOnto([2.25, 0, -0.5], 0, 1.5, true));
  const late = at(2.25, 0, -0.5, 0);
  let landed = false;
  run(late, { forward: 1 }, 15);
  run(late, { forward: 1, jump: true }, 6);
  run(late, { forward: 1, crouch: true }, 50, q => { if (q.onGround && Math.abs(q.pos.y - 1.5) < 1e-3) landed = true; });
  check('1,5-m-Kiste mit Ducksprung (Ducken 0,1 s nach Absprung)', landed);
  const ledge = at(-15, 3, -4, toPlusX);
  let bump = 0;
  run(ledge, { forward: 1, crouch: true }, 200, q => { bump = Math.max(bump, q.pos.y); });
  check('geduckt von der Plattform: kein Hochrucken', bump <= 3 + 1e-3, `max y=${bump.toFixed(3)}`);
  check('2,5-m-Stapel auch mit Ducksprung nicht', !jumpOnto([5.5, 0, 6.5], 0, 2.5, true));
}

{
  const p = at(0, 0, 12);
  let peak = 0;
  run(p, { jump: true }, 1);
  run(p, {}, 90, q => { peak = Math.max(peak, q.pos.y); });
  check(`Sprunghöhe ${MOVE.jumpHeight} m`, Math.abs(peak - MOVE.jumpHeight) < 0.05, `${peak.toFixed(3)} m`);
  let takeoffs = 0;
  let wasGround = true;
  run(p, { jump: true }, 180, q => { if (wasGround && !q.onGround) takeoffs++; wasGround = q.onGround; });
  check('Gedrückte Leertaste springt nur einmal', takeoffs === 1, `${takeoffs} Absprünge in 3 s`);
}

{
  const p = at(-0.5, 0, 0);
  run(p, { jump: true }, 1);
  run(p, {}, 60);
  check('Kopf stößt unter der Brücke nicht durch', p.pos.y < 0.01 && p.onGround);
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
