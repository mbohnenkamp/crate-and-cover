// Modelle auf den Karten und ihre Kollision bei Drehung 0, relativ zum Fußpunkt. Gemeinsam für Kartenskripte,
// Kartenbauer und Spiel, damit überall dieselben Maße gelten.
// Datei: models/custom/<name>.glb (Blender) bzw. models/<name>.glb, wenn der Name einen Ordner enthält
// (polyhaven/…: Poly Haven, Lizenz CC0, Maße aus den Dateien gelesen am 26.11.2026).
// boxes: [Art, min, max, Farbe]; leer = keine Kollision (flach genug zum Drübersteigen oder nur Schmuck).
// scale: Vergrößerung beim Zeichnen (die Kollision ist schon in Spielgröße angegeben).
// round: rund (Baum, Brunnen, Fass), die Kollision dreht nicht mit (gedreht würde der Kasten nur größer).
// shadow: false = wirft keinen eigenen Schatten (Kleinteile; jeder Schattenwurf ist ein weiterer Zeichenaufruf).

export const PROP_MODELS = {
  baum: { name: 'Baum', round: true, boxes: [['stamm', [-0.25, 0, -0.25], [0.25, 3, 0.25], '#6b4a2f'], ['laub', [-1.5, 2.6, -1.5], [1.5, 5, 1.5], '#4f7d3f']] },
  brunnen: {
    name: 'Brunnen',
    round: true,
    boxes: [['brunnen', [-1.5, 0, -1.5], [1.5, 0.9, 1.5], '#9a958c'], ['brunnen', [-0.25, 0.9, -0.25], [0.25, 2.6, 0.25], '#9a958c'],
      ['dach', [-0.9, 2.6, -0.9], [0.9, 2.8, 0.9], '#8e4a3a']],
  },
  marktstand: {
    name: 'Marktstand',
    boxes: [['kiste', [-1.3, 0, -0.5], [1.3, 1, 0.5]],
      ...[[-1.2, -0.4], [-1.2, 0.4], [1.2, -0.4], [1.2, 0.4]].map(([x, z]) => ['pfosten', [x - 0.05, 0, z - 0.05], [x + 0.05, 2.3, z + 0.05]]),
      ['stoff', [-1.5, 2.3, -1.2], [1.5, 2.4, 1.2]]],
  },
  'polyhaven/barrel_01': { name: 'Ölfass', round: true, boxes: [['stahl', [-0.28, 0, -0.28], [0.28, 0.88, 0.28], '#3f5a6b']] },
  'polyhaven/barrel_03': { name: 'Fass', round: true, boxes: [['stahl', [-0.32, 0, -0.32], [0.32, 0.93, 0.32], '#6b3a2a']] },
  'polyhaven/wine_barrel_01': { name: 'Holzfass', round: true, boxes: [['kiste', [-0.37, 0, -0.37], [0.37, 0.87, 0.37], '#7a5532']] },
  'polyhaven/wooden_crate_02': { name: 'Holzkiste', boxes: [['kiste', [-0.27, 0, -0.58], [0.27, 0.45, 0.58], '#8a6440']] },
  'polyhaven/plastic_crate_02': { name: 'Getränkekiste', boxes: [], shadow: false },
  'polyhaven/old_tyre': { name: 'Reifen', boxes: [] },
  'polyhaven/cement_bag': { name: 'Zementsack', boxes: [], shadow: false },
  'polyhaven/trashbag': { name: 'Müllsack', boxes: [], shadow: false },
  'polyhaven/wooden_bucket_01': { name: 'Holzeimer', boxes: [], shadow: false },
  'polyhaven/weed_plant_02': { name: 'Unkraut', boxes: [], scale: 3.7, shadow: false },
  'polyhaven/shrub_sorrel_01': { name: 'Sauerampfer', boxes: [], scale: 5, shadow: false },
  'polyhaven/street_lamp_02': { name: 'Wandlaterne', boxes: [], shadow: false },
  // KI-Modelle (Meshy über Higgsfield, 28.11.2026), mit blender/ki_requisit.py auf Maß gebracht. Kollision aus den
  // Querschnitten des Modells gemessen. Kran: Ursprung 13,3 m hinter der Mitte der Beine, Ausleger nach −Z in 10 m
  // (Höhe auf Marcos Wunsch so niedrig wie der alte Blockkran, also 0,39-fach gestaucht; in echter Form wären es 25 m).
  'ki/kran': {
    name: 'Containerkran',
    boxes: [
      ...[[-7.84, -7.04], [6.16, 6.96]].flatMap(([x0, x1]) => [7.4, 18.4].map(z => ['kran', [x0, 0, z], [x1, 9.85, z + 0.8], '#d9a92e'])),
      ...[[-8.24, -6.74], [5.86, 7.36]].flatMap(([x0, x1]) => [5.2, 16.2].map(z => ['kran', [x0, 0, z], [x1, 1.4, z + 5.1], '#d9a92e'])),
      ...[7.3, 18.3].map(z => ['kran', [-8.24, 9.85, z], [7.36, 10.65, z + 1], '#d9a92e']),
      ['kran', [-1.94, 10, -25.3], [1.06, 10.65, 25.3], '#d9a92e'],
    ],
  },
  // Baukran: Ursprung 3,4 m neben dem Mast, Ausleger nach +X in 14 m (12 m lang), Gegenausleger nach −X (5 m)
  'ki/baukran': {
    name: 'Baukran',
    boxes: [
      ['kran', [-4.43, 0, -1.53], [-2.4, 0.5, 1.37], '#8a8f94'],
      ['kran', [-4.13, 0, -0.8], [-2.7, 12.3, 0.65], '#d9a92e'],
      ['kran', [-4.9, 12.3, -1.66], [-1.85, 14, 1.63], '#d9a92e'],
      ['kran', [-8.76, 14, -0.97], [8.76, 15, 1], '#d9a92e'],
      ['kran', [-4.04, 15, -0.63], [-3.12, 18.09, 0.32], '#d9a92e'],
    ],
  },
  // Lkw: Ursprung in der Mitte, Fahrerhaus nach −X, Pritsche mit Bordwänden
  'ki/lkw': {
    name: 'Lkw',
    boxes: [
      ['lkw', [-3.45, 0, -1.27], [-1.5, 3.1, 1.27], '#c9c4b8'],
      ['lkw', [-1.5, 0, -1.15], [3.45, 1.45, 1.15], '#5d6670'],
      ['lkw', [-1.5, 1.45, -1.27], [3.45, 1.85, -1.1], '#5d6670'],
      ['lkw', [-1.5, 1.45, 1.1], [3.45, 1.85, 1.27], '#5d6670'],
      ['lkw', [3.3, 1.45, -1.1], [3.45, 1.85, 1.1], '#5d6670'],
    ],
  },
  // Bagger: Ursprung in der Mitte, Arm nach −X
  'ki/bagger': {
    name: 'Bagger',
    boxes: [
      ['bagger', [-0.75, 0, -1.28], [3.1, 1.2, 1.28], '#2b2d30'],
      ['bagger', [-0.4, 1.2, -1.15], [3.2, 2.6, 1.15], '#d9b02e'],
      ['bagger', [-0.4, 2.6, -1], [2.8, 3.2, 1.1], '#d9b02e'],
      ['bagger', [-2.95, 2.6, -0.4], [0.28, 3.77, 0.2], '#d9b02e'],
      ['bagger', [-3.2, 0.9, -0.5], [-2.3, 2.6, 0.33], '#d9b02e'],
      ['bagger', [-3.2, 0, -1.04], [-1.94, 0.9, 0.9], '#5a4f46'],
    ],
  },
};

const round = v => Math.round(v * 1000) / 1000;

export function rotateBox(min, max, yaw, at) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const xs = [];
  const zs = [];
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
    xs.push(x * c + z * s);
    zs.push(-x * s + z * c);
  }
  return {
    min: [round(at[0] + Math.min(...xs)), round(at[1] + min[1]), round(at[2] + Math.min(...zs))],
    max: [round(at[0] + Math.max(...xs)), round(at[1] + max[1]), round(at[2] + Math.max(...zs))],
  };
}

// Kollisionsblöcke eines Modells (nicht gezeichnet, an ihrer Stelle steht das Modell)
export function propBoxes(p) {
  const model = PROP_MODELS[p.model];
  return (model?.boxes ?? []).map(([type, min, max, color]) => ({
    type, ...rotateBox(min, max, model.round ? 0 : p.yaw ?? 0, p.pos), color: p.model === 'marktstand' && type === 'stoff' ? p.color : color, hidden: true,
  }));
}
