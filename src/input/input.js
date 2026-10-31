// Tastatur und Maus. Liefert je Zeitschritt ein Kommando für die Spiellogik.

import { VIEW, WEAPON_ORDER } from '../config.js';

export function createInput(canvas) {
  const keys = new Set();
  const buttons = new Set();
  // Einmalige Eingaben (Waffenwahl, Mausrad, Q, Klicks) bis zum nächsten Zeitschritt sammeln
  let pending = { select: null, wheel: 0, lastWeapon: false, alt: false, fire: false };
  const state = {
    yaw: 0,
    pitch: 0,
    sensitivityScale: 1,
    locked: false,
    onLockChange: null,
    onKey: null,
  };

  // Codes statt Zeichen, damit WASD auch auf deutschen Tastaturen gleich liegt
  window.addEventListener('keydown', e => {
    if (!state.locked) return;
    keys.add(e.code);
    // Strg+W/T/N lässt der Browser nur im Vollbild mit Tastatursperre nicht durch
    if (e.code === 'Space' || e.code === 'Tab' || e.code === 'F3' || e.ctrlKey) e.preventDefault();
    if (e.repeat) return;
    const digit = /^Digit([1-4])$/.exec(e.code);
    if (digit) pending.select = WEAPON_ORDER[digit[1] - 1];
    if (e.code === 'KeyQ') pending.lastWeapon = true;
    state.onKey?.(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); buttons.clear(); });

  canvas.addEventListener('mousedown', e => {
    if (!state.locked) return;
    buttons.add(e.button);
    if (e.button === 0) pending.fire = true; // auch ein Klick kürzer als ein Zeitschritt zählt
    if (e.button === 2) pending.alt = true;
  });
  window.addEventListener('mouseup', e => buttons.delete(e.button));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (!state.locked) return;
    e.preventDefault();
    pending.wheel += Math.sign(e.deltaY);
  }, { passive: false });

  state.lock = () => {
    if (!state.locked) canvas.requestPointerLock()?.catch?.(() => {});
  };
  canvas.addEventListener('click', state.lock);
  state.toggleFullscreen = async () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    await document.documentElement.requestFullscreen();
    await navigator.keyboard?.lock?.().catch(() => {});
    state.lock();
  };
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); buttons.clear(); }
    state.onLockChange?.(state.locked);
  });
  // Abgelehnt (z. B. zu schnell nach Esc erneut geklickt): Spiel muss das zeigen, sonst steht es still
  document.addEventListener('pointerlockerror', () => state.onLockError?.());
  document.addEventListener('mousemove', e => {
    if (!state.locked) return;
    const s = VIEW.mouseSensitivity * state.sensitivityScale;
    state.yaw -= e.movementX * s;
    state.pitch -= e.movementY * s;
    const limit = Math.PI / 2 - 0.01;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  });

  state.isDown = code => keys.has(code);

  // Einmal je Zeitschritt aufrufen: verbraucht die gesammelten einmaligen Eingaben
  state.command = () => {
    const down = c => keys.has(c);
    const once = pending;
    pending = { select: null, wheel: 0, lastWeapon: false, alt: false, fire: false };
    return {
      forward: (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0),
      right: (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0),
      jump: down('Space'),
      crouch: down('ControlLeft') || down('ControlRight') || down('KeyC'),
      walk: down('ShiftLeft') || down('ShiftRight'),
      yaw: state.yaw,
      pitch: state.pitch,
      fire: once.fire || buttons.has(0),
      alt: once.alt || buttons.has(2),
      reload: down('KeyR'),
      select: once.select,
      wheel: once.wheel,
      lastWeapon: once.lastWeapon,
    };
  };

  return state;
}
