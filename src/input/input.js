// Tastatur und Maus. Liefert je Zeitschritt ein Kommando für die Spiellogik.

import { VIEW } from '../config.js';

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    yaw: 0,
    pitch: 0,
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
    state.onKey?.(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  state.lock = () => {
    if (!state.locked) canvas.requestPointerLock();
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
    if (!state.locked) keys.clear();
    state.onLockChange?.(state.locked);
  });
  document.addEventListener('mousemove', e => {
    if (!state.locked) return;
    state.yaw -= e.movementX * VIEW.mouseSensitivity;
    state.pitch -= e.movementY * VIEW.mouseSensitivity;
    const limit = Math.PI / 2 - 0.01;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  });

  state.command = () => {
    const down = c => keys.has(c);
    return {
      forward: (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0),
      right: (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0),
      jump: down('Space'),
      crouch: down('ControlLeft') || down('ControlRight') || down('KeyC'),
      walk: down('ShiftLeft') || down('ShiftRight'),
      yaw: state.yaw,
      pitch: state.pitch,
    };
  };

  return state;
}
