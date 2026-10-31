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
