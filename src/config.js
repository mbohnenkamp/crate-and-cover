// Alle Spielzahlen an einer Stelle. Einheiten: Meter, Sekunden.

export const TICK_RATE = 60;

export const MOVE = {
  runSpeed: 5.6,
  walkSpeed: 2.9, // Schleichen (Shift)
  crouchSpeed: 1.9,
  groundAccel: 10,
  airAccel: 1.6,
  airMaxSpeed: 5.6,
  friction: 6,
  stopSpeed: 2.5,
  gravity: 20,
  jumpHeight: 1.1, // reicht auf eine 1-m-Kiste, für 1,5 m braucht es den Ducksprung
  stepHeight: 0.45,
  maxFallSpeed: 40,
};

export const BODY = {
  halfWidth: 0.4,
  standHeight: 1.8,
  crouchHeight: 1.2,
  standEye: 1.65,
  crouchEye: 1.05,
  eyeLerp: 14, // wie schnell die Augenhöhe beim Ducken nachzieht, je Sekunde
};

export const VIEW = {
  fov: 74, // senkrecht, entspricht etwa 90° waagerecht bei 4:3
  mouseSensitivity: 0.0022, // Bogenmaß je Pixel
};

// Waffen. Winkel in Bogenmaß (0,01 rad ≈ 10 cm Abweichung auf 10 m), Zeiten in Sekunden.
// Streuung: base im Stand, + bloom je Schuss (bis max), + move bei vollem Lauftempo, + air im Sprung,
// geduckt mal crouch. Rückstoß: kick hebt den Blick je Schuss, erholt sich nach dem Feuern.
export const WEAPONS = {
  gewehr: {
    name: 'Sturmgewehr', slot: 1, auto: true,
    damage: 30, headMult: 4, interval: 0.1, magazine: 30, reserve: 90, reload: 2.5, draw: 0.6,
    spread: { base: 0.004, bloom: 0.006, max: 0.07, move: 0.09, air: 0.25, crouch: 0.7 },
    recoil: { kick: 0.011, max: 0.12, jitter: 0.004 },
    moveFactor: 0.9,
  },
  pistole: {
    name: 'Pistole', slot: 2, auto: false,
    damage: 34, headMult: 4, interval: 0.15, magazine: 12, reserve: 48, reload: 2.2, draw: 0.4,
    spread: { base: 0.006, bloom: 0.012, max: 0.05, move: 0.04, air: 0.2, crouch: 0.7 },
    recoil: { kick: 0.02, max: 0.08, jitter: 0.003 },
    moveFactor: 1,
  },
  messer: {
    name: 'Messer', slot: 3, melee: true, auto: true,
    damage: 40, headMult: 1.5, interval: 0.45, range: 1.6, draw: 0.3,
    moveFactor: 1,
  },
  scharf: {
    name: 'Scharfschützengewehr', slot: 4, auto: false,
    damage: 115, headMult: 2, interval: 1.5, magazine: 5, reserve: 20, reload: 3.6, draw: 1.0,
    spread: { base: 0.06, scoped: 0.0008, bloom: 0, max: 0, move: 0.15, air: 0.4, crouch: 0.8 },
    recoil: { kick: 0.04, max: 0.04, jitter: 0 },
    moveFactor: 0.8,
    scope: { fov: 22, moveFactor: 0.6 },
  },
};

export const WEAPON_ORDER = ['gewehr', 'pistole', 'messer', 'scharf'];

export const COMBAT = {
  range: 200,
  recoilRecover: 8, // je Sekunde, sobald nicht mehr gefeuert wird
  bloomRecover: 5,
  targetHealth: 100,
  respawnTime: 3,
};
