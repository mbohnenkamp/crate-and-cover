// Trefferzonen einer Figur: Kopf und Körper als Boxen. Gilt für Zielscheiben und später für Spieler und Bots.
const BODY_HW = 0.3;
const HEAD_HW = 0.15;

export function hitboxes(pos, crouched = false) {
  const h = crouched ? 1.2 : 1.8;
  const neck = h - 0.32;
  return [
    { part: 'head', min: [pos.x - HEAD_HW, pos.y + neck, pos.z - HEAD_HW], max: [pos.x + HEAD_HW, pos.y + h, pos.z + HEAD_HW] },
    { part: 'body', min: [pos.x - BODY_HW, pos.y, pos.z - BODY_HW], max: [pos.x + BODY_HW, pos.y + neck, pos.z + BODY_HW] },
  ];
}
