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

export const MATCH = {
  health: 100,
  respawnTime: 3,
  teamSize: 4,
  killGoals: [25, 50],
  timeLimits: [5, 10], // Minuten
  defaults: { mode: 'deathmatch', map: 'hafen', difficulty: 'mittel', killGoal: 50, timeLimit: 10, sensitivity: 1, volume: 70 },
  names: {
    A: ['Anna', 'Ben', 'Clara', 'David'],
    B: ['Emma', 'Finn', 'Greta', 'Hannes'],
  },
};

// Bots je Schwierigkeitsgrad. reaction: so lange muss ein Gegner sichtbar sein, bevor geschossen wird.
// aimError: Zielfehler in Bogenmaß, wird kleiner, je länger der Bot ein Ziel verfolgt, aber nie unter errFloor.
// turnSpeed: wie schnell der Blick schwenkt (rad/s). fireCone: so nah muss das Ziel am Fadenkreuz sein.
// stopToShoot: bleibt zum Schießen stehen (genauer). recoilComp: wie gut der Rückstoß ausgeglichen wird.
export const BOTS = {
  leicht: { name: 'Leicht', reaction: 1.0, sight: 20, fov: 90, turnSpeed: 2.8, aimError: 0.09, settle: 1.5, errFloor: 0.6, headChance: 0.03, fireCone: 0.1, stopToShoot: 0, recoilComp: 0.3, burst: 3 },
  mittel: { name: 'Mittel', reaction: 0.6, sight: 32, fov: 110, turnSpeed: 4.5, aimError: 0.05, settle: 1.0, errFloor: 0.4, headChance: 0.1, fireCone: 0.06, stopToShoot: 0.3, recoilComp: 0.5, burst: 5 },
  schwer: { name: 'Schwer', reaction: 0.35, sight: 50, fov: 130, turnSpeed: 7, aimError: 0.024, settle: 0.7, errFloor: 0.25, headChance: 0.25, fireCone: 0.04, stopToShoot: 0.7, recoilComp: 0.75, burst: 7 },
};

// Schritte: ab diesem Tempo hörbar (Schleichen 2,9 m/s und geduckt 1,9 m/s bleiben leise), Schrittlänge,
// ab welcher Fallgeschwindigkeit eine Landung zu hören ist. Bots hören Schritte bis hearSteps Meter.
export const STEPS = { minSpeed: 3.3, length: 2.1, landSpeed: 4.5, hearShots: 20, hearSteps: 12 };
