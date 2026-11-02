// Minikarte wie das Radar in CS: dreht sich mit dem Blick, du in der Mitte mit Pfeil nach oben,
// Teamkameraden immer, Gegner nur, wenn du sie siehst oder sie gerade geschossen haben.

import { lineOfSight } from '../game/nav.js';

const SIZE = 170;
const SCALE = 4; // Pixel je Meter
const SPOT_EVERY = 0.2;
const SHOT_VISIBLE = 1.5;

const COLORS = { A: '#5b9bff', B: '#ff9a4a' };

export function createMinimap(canvas) {
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = canvas.height = SIZE * dpr;
  canvas.style.width = canvas.style.height = `${SIZE}px`;
  const g = canvas.getContext('2d');
  let mapImage = null;
  let bounds = null;
  let game = null;
  let spotTimer = 0;
  const spotted = new Set();

  // Karte einmal von oben zeichnen: höhere Blöcke heller
  function drawMap(world) {
    const boxes = world.boxes.filter(b => b.type !== 'boden');
    const floor = world.boxes.find(b => b.type === 'boden');
    bounds = { x: floor.min[0], z: floor.min[2], w: floor.max[0] - floor.min[0], d: floor.max[2] - floor.min[2] };
    const c = document.createElement('canvas');
    c.width = bounds.w * SCALE * dpr;
    c.height = bounds.d * SCALE * dpr;
    const m = c.getContext('2d');
    m.scale(SCALE * dpr, SCALE * dpr);
    m.fillStyle = '#3a3f47';
    m.fillRect(0, 0, bounds.w, bounds.d);
    for (const b of boxes.sort((a, c2) => a.max[1] - c2.max[1])) {
      const shade = Math.round(95 + Math.min(1, b.max[1] / 6) * 110);
      m.fillStyle = `rgb(${shade},${shade + 4},${shade + 10})`;
      m.fillRect(b.min[0] - bounds.x, b.min[2] - bounds.z, b.max[0] - b.min[0], b.max[2] - b.min[2]);
    }
    mapImage = c;
  }

  return {
    setGame(gm) {
      game = gm;
      spotted.clear();
      if (!mapImage) drawMap(gm.world);
    },
    update(dt, yaw) {
      const me = game.player;
      spotTimer -= dt;
      if (spotTimer <= 0) {
        spotTimer = SPOT_EVERY;
        spotted.clear();
        const eye = { x: me.pos.x, y: me.pos.y + me.eye, z: me.pos.z };
        for (const e of game.players) {
          if (!e.alive || e.team === me.team || !me.alive) continue;
          if (lineOfSight(game.world, eye, { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z })) spotted.add(e.id);
        }
      }

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      g.save();
      g.beginPath();
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#20242a';
      g.fillRect(0, 0, SIZE, SIZE);

      // Welt so drehen und verschieben, dass du in der Mitte stehst und vorne oben ist
      g.translate(SIZE / 2, SIZE / 2);
      g.rotate(yaw);
      g.scale(SCALE, SCALE);
      g.translate(-me.pos.x, -me.pos.z);
      g.globalAlpha = 0.92;
      g.drawImage(mapImage, bounds.x, bounds.z, bounds.w, bounds.d);
      g.globalAlpha = 1;

      for (const p of game.players) {
        if (p === me || !p.alive) continue;
        const show = p.team === me.team || spotted.has(p.id) || p.arms.sinceShot < SHOT_VISIBLE;
        if (!show) continue;
        g.fillStyle = COLORS[p.team];
        g.beginPath();
        g.arc(p.pos.x, p.pos.z, 2.2 / SCALE * 2, 0, Math.PI * 2);
        g.fill();
        // Höhenunterschied: Ring um den Punkt, wenn oben auf Plattform oder Brücke
        if (Math.abs(p.pos.y - me.pos.y) > 1.5) {
          g.strokeStyle = '#fff';
          g.lineWidth = 0.35;
          g.stroke();
        }
      }
      g.restore();

      // Du: Pfeil in der Mitte
      g.setTransform(dpr, 0, 0, dpr, SIZE / 2 * dpr, SIZE / 2 * dpr);
      g.fillStyle = me.alive ? '#ffffff' : '#888';
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(0, 2);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      g.stroke();
    },
  };
}
