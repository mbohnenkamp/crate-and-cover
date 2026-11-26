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
