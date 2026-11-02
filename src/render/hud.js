// Anzeige über dem Bild: Fadenkreuz nach Streuung, Treffermarke, Munition, Waffenleiste, Zielfernrohr,
// Lebenspunkte, Punktestand und Zeit, Abschussliste, Anzeigetafel, Gefallen-Hinweis, Schadensblitz.

import { WEAPONS, WEAPON_ORDER, MATCH } from '../config.js';
import { currentSpread } from '../game/weapons.js';

const SHORT = { gewehr: 'Sturmgewehr', pistole: 'Pistole', messer: 'Messer', scharf: 'Scharfschütze' };
export const TEAM_NAMES = { A: 'Blau', B: 'Orange' };

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function boardHtml(game) {
  const teams = game.mode === 'schiessstand' ? ['A'] : ['A', 'B'];
  return teams.map(team => {
    const rows = game.players
      .filter(p => p.team === team)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(p => `<tr class="${p === game.player ? 'me' : ''}"><td>${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.headshots}</td></tr>`)
      .join('');
    return `<table class="team-${team}"><thead><tr><th>${TEAM_NAMES[team]} · ${game.score[team]}</th><th>Abschüsse</th><th>Tode</th><th>Kopf</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');
}

function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function createHud() {
  const cross = $('crosshair');
  const lines = [...cross.children];
  const hitmark = $('hitmark');
  const scope = $('scope');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const reloadBar = $('reload-bar');
  const slots = $('slots');
  const feed = $('feed');
  const health = $('health');
  const score = $('score');
  const board = $('board');
  const death = $('death');
  const damage = $('damage');

  slots.innerHTML = WEAPON_ORDER.map((id, i) => `<span data-id="${id}"><b>${i + 1}</b> ${SHORT[id]}</span>`).join('');
  const slotEls = [...slots.children];

  let game = null;
  let hitTime = 99;
  let lastKill = false;
  let lastWeapon = null;
  let hurt = 0;
  let killedBy = null;
  // Schadensrichtung: bis zu vier rote Bögen um die Mitte, zeigen zum Schützen, verblassen in 1,2 s
  const arcs = [...$('hurtdir').children].map(el => ({ el, from: null, age: 99 }));

  function feedLine(html, cls) {
    const line = document.createElement('div');
    line.innerHTML = html;
    if (cls) line.className = cls;
    feed.prepend(line);
    while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => line.remove(), 5000);
  }

  const nameTag = p => `<span class="t${p.team}">${esc(p.name)}</span>`;

  return {
    setGame(g) {
      game = g;
      feed.innerHTML = '';
      lastWeapon = null;
      hurt = 0;
      killedBy = null;
      for (const a of arcs) { a.from = null; a.age = 99; }
      score.classList.toggle('hidden', g.mode === 'schiessstand');
      health.parentElement.classList.toggle('hidden', g.mode === 'schiessstand');
    },
    events(list) {
      const me = game.player;
      for (const e of list) {
        if (e.type === 'hit' && e.by === me.id) {
          hitTime = 0;
          lastKill = e.kill;
          if (game.mode === 'schiessstand') {
            feedLine(`${e.part === 'head' ? 'Kopftreffer' : 'Treffer'} · ${e.damage}${e.kill ? ' · gefallen' : ''}`, e.part === 'head' ? 'head' : '');
          }
        }
        if (e.type === 'damaged' && e.player === me.id) {
          hurt = Math.min(1, hurt + e.damage / 60);
          const arc = arcs.find(a => a.from && a.shooter === e.by) ?? arcs.reduce((a, b) => (a.age > b.age ? a : b));
          Object.assign(arc, { from: e.from, shooter: e.by, age: 0 });
        }
        if (e.type === 'kill') {
          const v = game.players[e.victim];
          const k = e.killer !== null ? game.players[e.killer] : null;
          if (k) feedLine(`${nameTag(k)} <small>${WEAPONS[e.weapon].name}${e.head ? ' · Kopf' : ''}</small> ${nameTag(v)}`, k === me || v === me ? 'mine' : '');
          const fell = e.cause === 'fall' ? 'abgestürzt' : game.world.fallText;
          if (!k) feedLine(`${nameTag(v)} <small>${fell}</small>`);
          if (v === me) killedBy = k ? `${esc(k.name)} · ${WEAPONS[e.weapon].name}${e.head ? ' · Kopftreffer' : ''}` : fell;
        }
      }
    },
    update(fovDeg, dt, showBoard, viewYaw) {
      const player = game.player;
      const a = player.arms;
      const w = WEAPONS[a.current];

      scope.classList.toggle('hidden', !a.scoped || !player.alive);
      cross.classList.toggle('hidden', a.scoped || !player.alive);
      const spread = currentSpread(player);
      const gap = Math.tan(spread) / Math.tan((fovDeg * Math.PI) / 360) * (window.innerHeight / 2);
      const g = Math.round(3 + Math.min(gap, 120));
      const len = w.melee ? 4 : 8;
      lines[0].style.cssText = `width:2px;height:${len}px;left:-1px;top:${-g - len}px`;
      lines[1].style.cssText = `width:2px;height:${len}px;left:-1px;top:${g}px`;
      lines[2].style.cssText = `width:${len}px;height:2px;top:-1px;left:${-g - len}px`;
      lines[3].style.cssText = `width:${len}px;height:2px;top:-1px;left:${g}px`;

      hitTime += dt;
      hitmark.classList.toggle('hidden', hitTime > 0.15);
      hitmark.classList.toggle('kill', lastKill);

      if (lastWeapon !== a.current) {
        lastWeapon = a.current;
        weaponName.textContent = w.name;
        for (const el of slotEls) el.classList.toggle('active', el.dataset.id === a.current);
      }
      if (w.melee) {
        ammo.textContent = '';
      } else {
        const m = a.ammo[a.current];
        ammo.innerHTML = `<span class="${m.mag === 0 ? 'empty' : ''}">${m.mag}</span><small> / ${m.reserve}</small>`;
      }
      const reloading = a.reload > 0 && player.alive;
      reloadBar.parentElement.classList.toggle('hidden', !reloading);
      if (reloading) reloadBar.style.width = `${(1 - a.reload / w.reload) * 100}%`;

      health.textContent = Math.max(0, Math.ceil(player.health));
      health.classList.toggle('low', player.health <= 30);

      if (game.mode === 'deathmatch') {
        score.innerHTML = `<span class="tA">${TEAM_NAMES.A} ${game.score.A}</span> : <span class="tB">${game.score.B} ${TEAM_NAMES.B}</span>`
          + `<small>${fmtTime(game.timeLimit - game.time)} · Ziel ${game.killGoal}</small>`;
      }

      for (const a of arcs) {
        a.age += dt;
        const visible = a.from && a.age < 1.2 && player.alive;
        a.el.style.opacity = visible ? 1 - a.age / 1.2 : 0;
        if (!visible) continue;
        const toShooter = Math.atan2(-(a.from.x - player.pos.x), -(a.from.z - player.pos.z));
        a.el.style.transform = `rotate(${-(toShooter - viewYaw)}rad)`;
      }

      hurt = Math.max(0, hurt - dt * 1.5);
      damage.style.opacity = player.alive ? hurt : 0.55;

      death.classList.toggle('hidden', player.alive);
      if (!player.alive) {
        death.innerHTML = `Gefallen${killedBy ? ` — ${killedBy}` : ''}<small>zurück in ${Math.max(1, Math.ceil(MATCH.respawnTime - player.deadTime))} s</small>`;
      }

      board.classList.toggle('hidden', !showBoard);
      if (showBoard) board.innerHTML = boardHtml(game);
    },
  };
}
