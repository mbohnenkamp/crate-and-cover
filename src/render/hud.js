// Anzeige über dem Bild: Fadenkreuz nach Streuung, Treffermarke, Munition, Waffenleiste, Zielfernrohr.

import { WEAPONS, WEAPON_ORDER } from '../config.js';
import { currentSpread } from '../game/weapons.js';

const SHORT = { gewehr: 'Sturmgewehr', pistole: 'Pistole', messer: 'Messer', scharf: 'Scharfschütze' };

export function createHud() {
  const $ = id => document.getElementById(id);
  const cross = $('crosshair');
  const lines = [...cross.children];
  const hitmark = $('hitmark');
  const scope = $('scope');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const reloadBar = $('reload-bar');
  const slots = $('slots');
  const feed = $('feed');

  slots.innerHTML = WEAPON_ORDER.map((id, i) => `<span data-id="${id}"><b>${i + 1}</b> ${SHORT[id]}</span>`).join('');
  const slotEls = [...slots.children];

  let hitTime = 99;
  let lastKill = false;
  let lastWeapon = null;

  return {
    events(list) {
      for (const e of list) {
        if (e.type !== 'hit') continue;
        hitTime = 0;
        lastKill = e.kill;
        const line = document.createElement('div');
        line.textContent = `${e.part === 'head' ? 'Kopftreffer' : 'Treffer'} · ${e.damage}${e.kill ? ' · gefallen' : ''}`;
        if (e.part === 'head') line.className = 'head';
        feed.prepend(line);
        while (feed.children.length > 5) feed.lastChild.remove();
        setTimeout(() => line.remove(), 3000);
      }
    },
    update(player, fovDeg, dt) {
      const a = player.arms;
      const w = WEAPONS[a.current];

      scope.classList.toggle('hidden', !a.scoped);
      cross.classList.toggle('hidden', a.scoped);
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
      const reloading = a.reload > 0;
      reloadBar.parentElement.classList.toggle('hidden', !reloading);
      if (reloading) reloadBar.style.width = `${(1 - a.reload / w.reload) * 100}%`;
    },
  };
}
