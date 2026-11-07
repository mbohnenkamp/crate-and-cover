// Schmuckblöcke ohne Kollision für die Kartenwerkzeuge: Container-Details, Fenster, Farben abdunkeln.
// Maße in Metern. `push(type, min, max, color, look)` ist die Schmuck-Funktion des jeweiligen Werkzeugs.
// Schmuck steht immer ein paar Zentimeter aus der Fläche, nie bündig, sonst flimmert es.

export function darker(hex, k = 0.65) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

export const GLAS = '#2f3f4f';

// Container: Eckpfosten, Rahmen oben und unten, Türriegel an beiden Stirnseiten.
// Bürocontainer (windows): Fenster an den Längsseiten und eine Tür an einer Stirnseite.
export function containerDeko(push, min, max, color, { windows = false } = {}) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const dark = darker(color, 0.6);
  const alongX = x1 - x0 >= z1 - z0;
  const W = 0.14;
  for (const [a, b] of [[x0 - 0.05, x0 + W], [x1 - W, x1 + 0.05]]) {
    for (const [c, d] of [[z0 - 0.05, z0 + W], [z1 - W, z1 + 0.05]]) push('deko', [a, y0, c], [b, y1, d], dark, 'stahl');
  }
  for (const [ya, yb] of [[y0, y0 + 0.12], [y1 - 0.12, y1]]) {
    push('deko', [x0, ya, z0 - 0.03], [x1, yb, z0], dark, 'stahl');
    push('deko', [x0, ya, z1], [x1, yb, z1 + 0.03], dark, 'stahl');
    push('deko', [x0 - 0.03, ya, z0], [x0, yb, z1], dark, 'stahl');
    push('deko', [x1, ya, z0], [x1 + 0.03, yb, z1], dark, 'stahl');
  }
  const ends = alongX ? [[x0 - 0.04, x0, 'x'], [x1, x1 + 0.04, 'x']] : [[z0 - 0.04, z0, 'z'], [z1, z1 + 0.04, 'z']];
  const across = alongX ? [z0, z1] : [x0, x1];
  const cc = (across[0] + across[1]) / 2;
  const rod = (end, c0, c1, ya, yb, col) => {
    const [e0, e1, axis] = end;
    if (axis === 'x') push('deko', [e0, ya, c0], [e1, yb, c1], col, 'stahl');
    else push('deko', [c0, ya, e0], [c1, yb, e1], col, 'stahl');
  };
  if (!windows) {
    for (const end of ends) {
      for (const off of [-0.85, -0.35, 0.35, 0.85]) rod(end, cc + off - 0.03, cc + off + 0.03, y0 + 0.15, y1 - 0.15, dark);
      rod(end, cc + 0.38, cc + 0.62, y0 + 1.15, y1 - 1.35, '#2b2d30');
      rod(end, cc - 0.62, cc - 0.38, y0 + 1.15, y1 - 1.35, '#2b2d30');
    }
    return;
  }
  // Bürocontainer: zwei Fenster je Längsseite, Tür an der ersten Stirnseite
  const long = alongX ? [x0, x1] : [z0, z1];
  for (const c of [long[0] + 1.5, long[1] - 1.5]) {
    for (const [f0, f1] of alongX ? [[z0 - 0.02, z0], [z1, z1 + 0.02]] : [[x0 - 0.02, x0], [x1, x1 + 0.02]]) {
      if (alongX) push('deko', [c - 0.5, y0 + 1.0, f0], [c + 0.5, y0 + 1.8, f1], GLAS, 'glatt');
      else push('deko', [f0, y0 + 1.0, c - 0.5], [f1, y0 + 1.8, c + 0.5], GLAS, 'glatt');
    }
  }
  rod(ends[0], cc - 0.45, cc + 0.45, y0 + 0.12, y0 + 2.1, darker(color, 0.8));
  rod([ends[0][0] - 0.01, ends[0][1] + 0.01, ends[0][2]], cc + 0.25, cc + 0.35, y0 + 1.0, y0 + 1.08, '#2b2d30');
}

// Fahrzeugräder: dunkle Scheiben an beiden Längsseiten (Seiten bei z0 und z1), an den Stellen xs
export function wheels(push, xs, y0, z0, z1, radius = 0.45) {
  for (const x of xs) {
    push('deko', [x - radius, y0, z0 - 0.06], [x + radius, y0 + radius * 2, z0], '#1f2022', 'glatt');
    push('deko', [x - radius, y0, z1], [x + radius, y0 + radius * 2, z1 + 0.06], '#1f2022', 'glatt');
  }
}
