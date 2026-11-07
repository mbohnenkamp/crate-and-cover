// Baut src/maps/hafen.json: Containerhafen, spiegelgleich für beide Teams (Blau im Westen, Orange im Osten).
// Danach Wegpunkte erzeugen: node tools/wegpunkte.mjs hafen
// Aufbau von Nord nach Süd: Hafenbecken (Wasser, wer reinfällt, ist raus), Kai mit Pollern, Containerreihe,
// Mittelgang mit Kran und Brücke in 5,2 m Höhe zwischen zwei Containertürmen, zweite Containerreihe, Lagerhalle.

import { writeFileSync } from 'node:fs';
import { containerDeko, GLAS } from './schmuck.mjs';

const C = { len: 6, h: 2.6, w: 2.4 };
const COLORS = ['#a83a2c', '#3f7a4a', '#2d6e73', '#8c8f93', '#7a3046', '#c9a43a', '#5a4f8a'];
const HALLE = '#aab1b8';
const boxes = [];
const deko = []; // Schmuck ohne Kollision: Container-Details, Torrahmen, Fenster, Kaikante
const stairs = [];

function entry(type, min, max, color, look) {
  const b = { type, min: min.map((v, i) => +Math.min(v, max[i]).toFixed(3)), max: max.map((v, i) => +Math.max(v, min[i]).toFixed(3)) };
  if (color) b.color = color;
  if (look) b.look = look;
  return b;
}
const box = (type, min, max, color, look) => boxes.push(entry(type, min, max, color, look));
const trim = (type, min, max, color, look) => deko.push(entry(type, min, max, color, look));

// Spiegeln: a ist der Abstand zur Mitte, s = −1 (Westen) oder +1 (Osten)
function both(build) {
  for (const s of [-1, 1]) build(a => s * a, s);
}

// Container mit der langen Seite entlang x (along 'x') oder z, Mitte (x, z), Ebene 0, 1, 2 …
function container(x, z, level, color, along = 'x', opts = {}) {
  const [hx, hz] = along === 'x' ? [C.len / 2, C.w / 2] : [C.w / 2, C.len / 2];
  const min = [x - hx, level * C.h, z - hz];
  const max = [x + hx, (level + 1) * C.h, z + hz];
  box('container', min, max, color);
  containerDeko(trim, min, max, color, opts);
}

function stair(start, dir, height, width) {
  stairs.push({ start, dir, steps: 9, rise: +(height / 9).toFixed(4), depth: 0.5, width });
}

// Treppenrichtung wie im Osten angegeben, im Westen gespiegelt
const flip = (dir, s) => (dir[1] === 'x' && s < 0 ? (dir[0] === '-' ? '+x' : '-x') : dir);

// Boden mit Kaimauer zum Wasser (z < −20), Außenmauern im Westen, Osten und Süden
box('boden', [-36, -3, -20], [36, 0, 26]);
box('wand', [-37, 0, -20], [-36, 6, 27]);
box('wand', [36, 0, -20], [37, 6, 27]);
box('wand', [-36, 0, 26], [36, 6, 27]);
// Kaikante: dunkler Betonrand zum Wasser
trim('deko', [-36, -0.5, -20.12], [36, 0.06, -20], '#6a6f75', 'beton');

both((X, s) => {
  // Kai: Poller an der Kante, ein Container und Kisten als Deckung, die lange Sichtlinie bleibt frei
  for (const a of [4, 12, 20, 28]) box('poller', [X(a - 0.25), 0, -19.8], [X(a + 0.25), 0.7, -19.3]);
  container(X(17), -15, 0, COLORS[0]);
  box('kiste', [X(5), 0, -15.5], [X(6.5), 1.5, -14]);
  box('kiste', [X(6.5), 0, -15.2], [X(7.5), 1, -14.2]);

  // Nördliche Containerreihe
  container(X(25), -10.4, 0, COLORS[1]);
  container(X(25), -10.4, 1, COLORS[2]);
  container(X(25), -8, 0, COLORS[3]);
  stair([X(24), 0, -2.3], '-z', C.h, 1.4); // vom Mittelgang auf den vorderen Container
  stair([X(23), C.h, -8.4], flip('+x', s), C.h, 1.6); // weiter auf den oberen
  container(X(16), -10.4, 0, COLORS[4]);
  container(X(16), -8, 0, COLORS[5]);
  container(X(6), -10.4, 0, COLORS[6]);
  container(X(6), -10.4, 1, COLORS[0]);
  container(X(6), -10.4, 2, COLORS[3]);

  // Kranturm: zwei Container hoch, davor einer, Treppe in einem Zug bis oben
  container(X(15), 0, 0, COLORS[2]);
  container(X(15), 0, 1, COLORS[5]);
  container(X(15), 2.4, 0, COLORS[0]);
  stair([X(22.5), 0, 2.1], flip('-x', s), C.h, 1.6);
  stair([X(17.5), C.h, 2.1], flip('-x', s), C.h, 1.6);
  box('steg', [X(12), C.h, 1.2], [X(13), 2 * C.h, 2.9]); // Podest oben, damit niemand neben der letzten Stufe abstürzt
  // Geländer an den offenen Kanten oben: Podest zur Mitte hin, Kranturm nach Norden und außen
  box('balken', [X(12), 5.2, 1.05], [X(12.05), 6.2, 2.9]);
  box('balken', [X(12), 5.2, -1.25], [X(18), 6.2, -1.2]);
  box('balken', [X(18), 5.2, -1.2], [X(18.05), 6.2, 1.2]);

  // Kran: Beine, Querträger oben in 10 m
  for (const z of [-5.5, 5.5]) box('kran', [X(6.6), 0, z - 0.4], [X(7.4), 10, z + 0.4]);
  box('kran', [X(6.6), 10, -5.9], [X(7.4), 11, 5.9]);
  // Querstreben zwischen den Kranbeinen, über Kopfhöhe
  for (const y of [3.5, 7]) trim('deko', [X(6.7), y, -5.1], [X(7.3), y + 0.3, 5.1], '#b8891f', 'stahl');

  // Deckung im Mittelgang bei den Spawns
  box('kiste', [X(27), 0, 3], [X(28.5), 1.5, 4.5]);
  box('kiste', [X(27.2), 1.5, 3.2], [X(28.2), 2.5, 4.2]);
  box('kiste', [X(9), 0, -4], [X(10.5), 1.2, -2.5]);

  // Südliche Containerreihe, niedriger und mit mehr Lücken
  container(X(6), 8, 0, COLORS[4]);
  container(X(15), 10.4, 0, COLORS[6]);
  container(X(15), 10.4, 1, COLORS[1]);
  container(X(15), 8, 0, COLORS[3]);
  container(X(25), 9, 0, COLORS[5], 'z');

  // Bürocontainer bei den Spawns, Treppe aufs Dach
  container(X(29), 16.2, 0, '#d8d4c8', 'x', { windows: true });
  stair([X(21.5), 0, 16.2], flip('+x', s), C.h, 1.6);
  box('kiste', [X(14), 0, 18.5], [X(15.5), 1.5, 20]);

  // Lagerhalle: Seitenwand mit Tor, Nordwand mit Tor, Regale innen
  box('wand', [X(9.6), 0, 14], [X(10), 6, 18], HALLE, 'wellblech');
  box('wand', [X(9.6), 0, 21.5], [X(10), 6, 25.4], HALLE, 'wellblech');
  box('wand', [X(9.6), 3.4, 18], [X(10), 6, 21.5], HALLE, 'wellblech');
  box('wand', [X(7), 0, 14], [X(9.6), 6, 14.4], HALLE, 'wellblech');
  box('wand', [X(4), 3.4, 14], [X(7), 6, 14.4], HALLE, 'wellblech');
  // Torrahmen an beiden Toren (Seite und Nordwand), außen
  const sideFace = s < 0 ? [X(10) - 0.08, X(10)] : [X(10), X(10) + 0.08];
  trim('deko', [sideFace[0], 0, 17.85], [sideFace[1], 3.55, 18], '#3c4248', 'stahl');
  trim('deko', [sideFace[0], 0, 21.5], [sideFace[1], 3.55, 21.65], '#3c4248', 'stahl');
  trim('deko', [sideFace[0], 3.4, 17.85], [sideFace[1], 3.55, 21.65], '#3c4248', 'stahl');
  const [nx0, nx1] = [Math.min(X(3.85), X(7.15)), Math.max(X(3.85), X(7.15))];
  trim('deko', [nx0, 0, 13.92], [nx0 + 0.15, 3.55, 14], '#3c4248', 'stahl');
  trim('deko', [nx1 - 0.15, 0, 13.92], [nx1, 3.55, 14], '#3c4248', 'stahl');
  trim('deko', [nx0, 3.4, 13.92], [nx1, 3.55, 14], '#3c4248', 'stahl');
  box('regal', [X(2.5), 0, 17.5], [X(7.5), 2.8, 18.5]);
  box('regal', [X(2.5), 0, 21], [X(7.5), 2.8, 22]);
  box('kiste', [X(4), 0, 19.3], [X(5.2), 1.2, 20.3]);
});

// Mitte: Nordwand der Halle zwischen den Toren, Südwand, Dach, Paletten
box('wand', [-4, 0, 14], [4, 6, 14.4], HALLE, 'wellblech');
box('wand', [-10, 0, 25], [10, 6, 25.4], HALLE, 'wellblech');
box('dach', [-10, 6, 14], [10, 6.3, 25.4]);
// Fensterband oben an der Nordwand der Halle und Dachkante
for (const x of [-3.2, -1.2, 0.8]) trim('deko', [x, 4.4, 13.97], [x + 1.6, 5.2, 14], GLAS, 'glatt');
trim('deko', [-10.06, 5.9, 13.94], [10.06, 6.36, 14], '#5d6670', 'stahl');
trim('deko', [-10.06, 5.9, 25.4], [10.06, 6.36, 25.46], '#5d6670', 'stahl');
box('kiste', [-1, 0, 19], [1, 1.2, 20.5]);

// Brücke zwischen den Kranturm-Spitzen, mit Geländer
box('steg', [-12, 5, -1], [12, 5.2, 1]);
box('balken', [-12, 5.2, -1.05], [12, 6.2, -1]);
box('balken', [-12, 5.2, 1], [12, 6.2, 1.05]);

// Kranträger längs und Ausleger übers Wasser, Gegengewicht, ein Container hängt am Haken
for (const z of [-5.5, 5.5]) box('kran', [-7.4, 10, z - 0.4], [7.4, 11, z + 0.4]);
box('kran', [-0.6, 10, -32], [0.6, 11, -5.9]);
box('kran', [-1.5, 9.5, 9], [1.5, 11.5, 13]);
box('kran', [-0.6, 10, 5.9], [0.6, 11, 9]);
box('balken', [-0.05, 5.2, -26.05], [0.05, 10, -25.95]);
box('container', [-3, 2.6, -27.2], [3, 5.2, -24.8], COLORS[0]);
containerDeko(trim, [-3, 2.6, -27.2], [3, 5.2, -24.8], COLORS[0]);

// Mittelgang: Kisten unter der Brücke
box('kiste', [-1, 0, -3.5], [0.5, 1.5, -2]);
box('kiste', [-0.5, 0, 2], [1, 1.5, 3.5]);

const spawns = [];
for (const [team, s, yaw] of [['A', -1, -Math.PI / 2], ['B', 1, Math.PI / 2]]) {
  for (const z of [-4, -1.3, 1.3, 4]) spawns.push({ team, pos: [s * 32, 0, z], yaw: +yaw.toFixed(5) });
}

const map = {
  name: 'Hafen',
  killY: -2.2,
  fallText: 'ins Hafenbecken',
  water: { y: -1.2, min: [-80, -80], max: [80, -20] },
  boxes,
  stairs,
  spawns,
  // Wegpunkte vor und hinter den Toren der Lagerhalle, damit die Bots hinein- und hinausfinden
  navHints: [-1, 1].flatMap(s => [[s * 5.5, 0, 13], [s * 5.5, 0, 15.6], [s * 8.4, 0, 19.75], [s * 11.2, 0, 19.75]]),
  looks: { boden: 'beton', wand: 'beton', dach: 'wellblech', treppe: 'stahl' },
  licht: 'morgen',
  deko,
};
writeFileSync(new URL('../src/maps/hafen.json', import.meta.url), JSON.stringify(map, null, 1));
console.log(`Hafen: ${boxes.length} Blöcke, ${deko.length} Schmuckblöcke, ${stairs.length} Treppen`);
