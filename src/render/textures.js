// Oberflächen je Blockart: Putz, Stein, Ziegel, Pflaster, Bretter, Dachziegel, Wellblech, Stahl …
// Erst im Code gemalt, dann durch ein KI-Bild ersetzt (siehe unten). Alle Bilder sind fast weiß und werden mit
// der Blockfarbe getönt. Ein Bild deckt `tile` Meter ab,
// die Texturkoordinaten der Blöcke sind in Metern (siehe boxGeometry im Renderer).

import * as THREE from 'three';

const SIZE = 256;

// Blockart → Oberfläche. Karten können je Art (map.looks) oder je Block (b.look) abweichen.
export const DEFAULT_LOOK = {
  boden: 'beton', wand: 'putz', plattform: 'stahl', balken: 'stahl', treppe: 'beton', kiste: 'kiste',
  pfeiler: 'beton', kante: 'beton', poller: 'stahl', container: 'wellblech', steg: 'stahl', kran: 'stahl',
  regal: 'stahl', dach: 'dachziegel', pfosten: 'bretter', decke: 'bretter', stoff: 'stoff', hecke: 'laub',
  stamm: 'rinde', laub: 'laub', bank: 'bretter', brunnen: 'stein', spundwand: 'wellblech', bretterwand: 'bretter',
  beton: 'beton', stahl: 'stahl', ziegel: 'ziegel', geruest: 'bretter', rohr: 'stahl', klo: 'glatt', lkw: 'glatt',
  sand: 'sand', mischer: 'stahl', bagger: 'glatt', erde: 'erde', glas: 'glatt', holz: 'bretter',
};

export function lookFor(box, world) {
  return box.look ?? world.looks?.[box.type] ?? DEFAULT_LOOK[box.type] ?? 'glatt';
}

// Deterministischer Zufall, damit die Bilder bei jedem Laden gleich aussehen
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

function start(fill) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.fillStyle = gray(fill);
  g.fillRect(0, 0, SIZE, SIZE);
  return [c, g];
}

// Feine Körnung: viele kleine Punkte
function speckle(g, r, count, lo, hi, alpha, size = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = gray(lo + r() * (hi - lo), alpha);
    g.fillRect(r() * SIZE, r() * SIZE, size, size);
  }
}

// Grobe Flecken: weiche Kreise
function blotch(g, r, count, lo, hi, alpha, radius) {
  for (let i = 0; i < count; i++) {
    const x = r() * SIZE;
    const y = r() * SIZE;
    const rad = radius * (0.5 + r());
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = lo + r() * (hi - lo);
    grad.addColorStop(0, gray(v, alpha));
    grad.addColorStop(1, gray(v, 0));
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// Rechteck mit Fuge rundum, wie bei Steinen und Ziegeln. Nahtlos: wird an den Rändern umgebrochen.
function wrappedRect(g, x, y, w, h) {
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) g.fillRect(x + dx, y + dy, w, h);
}

const PAINTERS = {
  glatt(r) {
    const [c, g] = start(250);
    speckle(g, r, 300, 225, 255, 0.5);
    return [c, 1];
  },
  putz(r) {
    const [c, g] = start(246);
    blotch(g, r, 40, 205, 255, 0.18, 50);
    speckle(g, r, 2500, 200, 255, 0.35, 1);
    return [c, 1];
  },
  beton(r) {
    const [c, g] = start(238);
    blotch(g, r, 30, 190, 250, 0.2, 60);
    speckle(g, r, 4000, 170, 255, 0.3, 1);
    speckle(g, r, 60, 150, 200, 0.5, 3);
    // Schalungsfugen alle 2 m
    g.fillStyle = gray(205);
    g.fillRect(0, 0, SIZE, 2);
    g.fillRect(0, 0, 2, SIZE);
    return [c, 2];
  },
  erde(r) {
    const [c, g] = start(232);
    blotch(g, r, 60, 170, 250, 0.3, 40);
    speckle(g, r, 5000, 150, 255, 0.4, 2);
    speckle(g, r, 80, 130, 180, 0.7, 4);
    return [c, 2];
  },
  sand(r) {
    const [c, g] = start(246);
    blotch(g, r, 30, 215, 255, 0.25, 50);
    speckle(g, r, 5000, 200, 255, 0.4, 1);
    speckle(g, r, 40, 170, 210, 0.7, 3);
    return [c, 1];
  },
  // Quadermauerwerk: Reihen 0,5 m, Steine 1 m, versetzt. Bild deckt 2 m ab.
  stein(r) {
    const [c, g] = start(150);
    const rowH = SIZE / 4;
    const stoneW = SIZE / 2;
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? stoneW / 2 : 0;
      for (let i = -1; i < 3; i++) {
        const x = i * stoneW + off + 3;
        const y = row * rowH + 3;
        g.fillStyle = gray(222 + r() * 30);
        wrappedRect(g, x, y, stoneW - 6, rowH - 6);
      }
    }
    speckle(g, r, 3000, 180, 255, 0.3, 1);
    blotch(g, r, 20, 190, 240, 0.2, 40);
    return [c, 2];
  },
  // Ziegel 0,25 × 0,075 m im Läuferverband, Bild deckt 1 m ab
  ziegel(r) {
    const [c, g] = start(185);
    const rows = 13;
    const rowH = SIZE / rows;
    const brickW = SIZE / 4;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? brickW / 2 : 0;
      for (let i = -1; i < 5; i++) {
        g.fillStyle = gray(215 + r() * 40);
        wrappedRect(g, i * brickW + off + 1.5, row * rowH + 1.5, brickW - 3, rowH - 3);
      }
    }
    speckle(g, r, 2500, 170, 255, 0.3, 1);
    return [c, 1];
  },
  // Kopfsteinpflaster: Steine etwa 0,2 m mit unregelmäßigen Fugen, Bild deckt 2 m ab
  pflaster(r) {
    const [c, g] = start(140);
    const n = 10;
    const cell = SIZE / n;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const jx = (r() - 0.5) * 4;
        const jy = (r() - 0.5) * 4;
        const w = cell - 4 + (r() - 0.5) * 4;
        const h = cell - 4 + (r() - 0.5) * 4;
        const x = col * cell + 2 + jx;
        const y = row * cell + 2 + jy;
        const v = 195 + r() * 60;
        g.fillStyle = gray(v);
        g.beginPath();
        g.roundRect(x, y, w, h, 5);
        g.fill();
        // helle Kante oben links, dunkle unten rechts
        g.fillStyle = gray(255, 0.25);
        g.fillRect(x + 1, y + 1, w - 2, 2);
        g.fillStyle = gray(80, 0.25);
        g.fillRect(x + 1, y + h - 3, w - 2, 2);
      }
    }
    speckle(g, r, 2500, 150, 255, 0.25, 1);
    return [c, 2];
  },
  // Bretter 0,2 m breit, waagerecht, mit Maserung und dunkler Fuge, Bild deckt 1 m ab
  bretter(r) {
    const [c, g] = start(130);
    const n = 5;
    const h = SIZE / n;
    for (let i = 0; i < n; i++) {
      const y = i * h;
      g.fillStyle = gray(210 + r() * 40);
      g.fillRect(0, y + 2, SIZE, h - 4);
      for (let k = 0; k < 12; k++) {
        g.fillStyle = gray(150 + r() * 60, 0.25);
        g.fillRect(0, y + 3 + r() * (h - 6), SIZE, 1);
      }
      for (let k = 0; k < 3; k++) {
        g.fillStyle = gray(120, 0.3);
        g.fillRect(r() * SIZE, y + 3 + r() * (h - 6), 10 + r() * 40, 1);
      }
    }
    speckle(g, r, 1500, 170, 255, 0.2, 1);
    return [c, 1];
  },
  // Kiste: Bretter mit Rahmen am Rand und Nägeln
  kiste(r) {
    const [c] = PAINTERS.bretter(r);
    const g = c.getContext('2d');
    g.fillStyle = gray(175);
    g.fillRect(0, 0, SIZE, 14);
    g.fillRect(0, SIZE - 14, SIZE, 14);
    g.fillRect(0, 0, 14, SIZE);
    g.fillRect(SIZE - 14, 0, 14, SIZE);
    g.fillStyle = gray(200);
    g.fillRect(3, 3, SIZE - 6, 8);
    g.fillRect(3, SIZE - 11, SIZE - 6, 8);
    g.fillRect(3, 3, 8, SIZE - 6);
    g.fillRect(SIZE - 11, 3, 8, SIZE - 6);
    g.fillStyle = gray(90);
    for (const [x, y] of [[7, 7], [SIZE - 9, 7], [7, SIZE - 9], [SIZE - 9, SIZE - 9]]) g.fillRect(x, y, 3, 3);
    return [c, 1];
  },
  // Dachziegel: Reihen 0,33 m, jede Reihe wirft unten einen Schatten, Ziegel 0,25 m versetzt
  dachziegel(r) {
    const [c, g] = start(235);
    const rows = 3;
    const rowH = SIZE / rows;
    const tileW = SIZE / 4;
    for (let row = 0; row < rows; row++) {
      const y = row * rowH;
      const off = row % 2 ? tileW / 2 : 0;
      for (let i = -1; i < 5; i++) {
        g.fillStyle = gray(215 + r() * 40);
        wrappedRect(g, i * tileW + off + 1, y, tileW - 2, rowH);
      }
      const grad = g.createLinearGradient(0, y + rowH - 22, 0, y + rowH);
      grad.addColorStop(0, gray(120, 0));
      grad.addColorStop(1, gray(120, 0.75));
      g.fillStyle = grad;
      g.fillRect(0, y + rowH - 22, SIZE, 22);
      g.fillStyle = gray(255, 0.35);
      g.fillRect(0, y, SIZE, 2);
    }
    speckle(g, r, 1500, 170, 255, 0.2, 1);
    return [c, 1];
  },
  // Wellblech: senkrechte Rippen, 4 je Meter, rund schattiert
  wellblech(r) {
    const [c, g] = start(235);
    for (let x = 0; x < SIZE; x++) {
      const v = 212 + 38 * Math.sin((x / SIZE) * Math.PI * 2 * 4);
      g.fillStyle = gray(v);
      g.fillRect(x, 0, 1, SIZE);
    }
    speckle(g, r, 800, 180, 255, 0.2, 1);
    blotch(g, r, 10, 160, 230, 0.15, 40);
    return [c, 1];
  },
  // Stahl: gebürstet, mit Nieten alle 0,5 m
  stahl(r) {
    const [c, g] = start(236);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = gray(190 + r() * 65, 0.3);
      g.fillRect(r() * SIZE, r() * SIZE, 10 + r() * 60, 1);
    }
    blotch(g, r, 12, 180, 240, 0.2, 40);
    for (const x of [16, 144]) {
      for (const y of [16, 144]) {
        g.fillStyle = gray(150);
        g.beginPath();
        g.arc(x, y, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = gray(255, 0.6);
        g.beginPath();
        g.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    return [c, 1];
  },
  // Laub und Hecken: dichte Blattbüschel
  laub(r) {
    const [c, g] = start(170);
    for (let i = 0; i < 700; i++) {
      const rad = 4 + r() * 10;
      g.fillStyle = gray(150 + r() * 105, 0.85);
      g.beginPath();
      g.arc(r() * SIZE, r() * SIZE, rad, 0, Math.PI * 2);
      g.fill();
    }
    return [c, 1];
  },
  // Rinde: senkrechte Riefen
  rinde(r) {
    const [c, g] = start(200);
    let x = 0;
    while (x < SIZE) {
      const w = 3 + r() * 10;
      g.fillStyle = gray(150 + r() * 100);
      g.fillRect(x, 0, w, SIZE);
      x += w;
    }
    for (let i = 0; i < 200; i++) {
      g.fillStyle = gray(90, 0.4);
      g.fillRect(r() * SIZE, r() * SIZE, 2, 10 + r() * 50);
    }
    return [c, 1];
  },
  // Markisenstoff: Streifen 0,25 m und feines Gewebe
  stoff(r) {
    const [c, g] = start(248);
    for (let i = 0; i < 4; i += 2) {
      g.fillStyle = gray(200);
      g.fillRect(i * (SIZE / 4), 0, SIZE / 4, SIZE);
    }
    speckle(g, r, 4000, 200, 255, 0.25, 1);
    return [c, 1];
  },
};

// KI-Bilder (tools/texturen.py → public/textures/): Oberfläche → [Meter je Bild, Relieftiefe in Metern].
// Dieselben Werte stehen in tools/texturen.py (RELIEF). Mit ?flaechen=alt bleiben die im Code gemalten Flächen,
// mit ?tiefe=aus fällt nur die Tiefenwirkung weg.
const query = new URLSearchParams(location.search);
const KI_LOOKS = query.get('flaechen') === 'alt' ? {} : {
  beton: [4, 0.008], putz: [3, 0.006], erde: [4, 0.035], sand: [2.5, 0.03], stein: [2, 0.05], ziegel: [1, 0.02],
  pflaster: [2, 0.04], bretter: [1.25, 0.02], kiste: [1, 0], dachziegel: [1.33, 0.045], stahl: [3, 0.003],
  laub: [1.5, 0.1], wellblech: [2, 0.03],
};
const KI = Object.fromEntries(Object.entries(KI_LOOKS).map(([k, v]) => [k, v[0]]));
const DEPTH = query.get('tiefe') === 'aus' ? 0 : 1;
const loader = new THREE.TextureLoader();

const cache = {};

// Sofort die im Code gemalte Fläche; das KI-Bild ersetzt sie, sobald es geladen ist.
export function textureFor(look) {
  if (cache[look]) return cache[look];
  const painter = PAINTERS[look] ?? PAINTERS.glatt;
  const [canvas, tile] = painter(rng(look.length * 7919 + look.charCodeAt(0) * 131));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tile);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache[look] = tex;
  if (KI[look]) {
    loader.load(`${import.meta.env.BASE_URL}textures/${look}.webp`, loaded => swap(tex, loaded, KI[look]));
  }
  return tex;
}

// Andere Bildgröße: Speicher der Grafikkarte neu anlegen
function swap(tex, loaded, tile) {
  tex.dispose();
  tex.image = loaded.image;
  tex.repeat.set(1 / tile, 1 / tile);
  tex.needsUpdate = true;
}

const reliefCache = {};

// Reliefkarte (Normal Map) zur Oberfläche: erst eben, dann das Bild aus tools/texturen.py. Ohne KI-Bild keine.
export function reliefFor(look) {
  if (!KI[look]) return null;
  if (reliefCache[look]) return reliefCache[look];
  const flat = document.createElement('canvas');
  flat.width = flat.height = 1;
  const g = flat.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, 1, 1);
  const tex = new THREE.CanvasTexture(flat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  reliefCache[look] = tex;
  loader.load(`${import.meta.env.BASE_URL}textures/${look}_n.webp`, loaded => swap(tex, loaded, KI[look]));
  return tex;
}

// Tiefenwirkung (Parallax Occlusion Mapping): Der Blickstrahl wird in Schritten in die Fläche verfolgt, bis er
// die Höhe aus dem Blaukanal der Reliefkarte trifft; Farbe und Neigung kommen von dieser Stelle. Fugen verschieben
// sich dadurch beim Vorbeigehen. Die Blöcke liegen an den Weltachsen und ihre Texturkoordinaten sind die Weltlage
// (boxGeometry im Renderer), deshalb reicht die Flächenrichtung, um den Blick in die Fläche umzurechnen.
// Ab 18 m klingt die Wirkung aus, ab 30 m wird nichts mehr gerechnet.
function addDepth(material, tile, depth) {
  material.onBeforeCompile = shader => {
    shader.uniforms.reliefTile = { value: tile };
    shader.uniforms.reliefDepth = { value: depth };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vWPos;\nvarying vec3 vWNrm;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\nvWNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
        varying vec3 vWPos;
        varying vec3 vWNrm;
        uniform float reliefTile;
        uniform float reliefDepth;
        void main() {
          vec2 pDx = dFdx( vMapUv );
          vec2 pDy = dFdy( vMapUv );
          vec2 pOff = vec2( 0.0 );
          float pHeight = 1.0;
          float pFade = 0.0;
          {
            vec3 toEye = cameraPosition - vWPos;
            float dist = length( toEye );
            toEye /= dist;
            vec3 an = abs( vWNrm );
            vec2 along = an.x > 0.5 ? toEye.zy : an.y > 0.5 ? toEye.xz : toEye.xy;
            float into = an.x > 0.5 ? abs( toEye.x ) : an.y > 0.5 ? abs( toEye.y ) : abs( toEye.z );
            float fade = 1.0 - smoothstep( 18.0, 30.0, dist );
            pFade = fade;
            if ( fade > 0.0 ) {
              float steps = mix( 20.0, 6.0, into );
              vec2 full = - along / max( into, 0.3 ) * reliefDepth * fade / reliefTile;
              vec2 uv = vNormalMapUv;
              vec2 stepUv = full / steps;
              float stepD = 1.0 / steps;
              float d = 0.0;
              float surf = 1.0 - textureGrad( normalMap, uv, pDx, pDy ).b;
              float prev = surf;
              for ( int i = 0; i < 20; i ++ ) {
                if ( d >= surf ) break;
                prev = surf;
                uv += stepUv;
                d += stepD;
                surf = 1.0 - textureGrad( normalMap, uv, pDx, pDy ).b;
              }
              float after = d - surf;
              float before = prev - ( d - stepD );
              float w = after / max( after + before, 0.0001 );
              pOff = uv - stepUv * w - vNormalMapUv;
              pHeight = 1.0 - mix( surf, prev, w );
            }
          }
      `)
      .replace('#include <map_fragment>', `
        diffuseColor *= textureGrad( map, vMapUv + pOff, pDx, pDy );
        diffuseColor.rgb *= mix( 1.0, mix( 0.62, 1.0, smoothstep( 0.0, 0.45, pHeight ) ), pFade );
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = textureGrad( normalMap, vNormalMapUv + pOff, pDx, pDy ).xyz * 2.0 - 1.0;
        mapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
      `);
  };
  material.customProgramCacheKey = () => 'relief';
}

// Licht seit V4.33: physikalische Materialien mit Umgebungslicht aus dem Himmel und Farbabstimmung.
// Zum Vergleich ?licht=alt hinter die Adresse: flaches Streulicht wie bis V4.32.
export const OLD_LIGHT = query.get('licht') === 'alt';

// Rauheit und Metallanteil je Oberfläche; was hier fehlt, ist matt und nicht metallisch
const SHINE = { stahl: [0.45, 0.6], wellblech: [0.55, 0.45], glatt: [0.55, 0], kiste: [0.8, 0] };

// Material einer Oberfläche: Farbbild, Reliefkarte und (wo die Texturkoordinaten die Weltlage sind) Tiefenwirkung.
export function surfaceMaterial(look) {
  const maps = { map: textureFor(look), normalMap: reliefFor(look), vertexColors: true };
  const [roughness, metalness] = SHINE[look] ?? [0.92, 0];
  const material = OLD_LIGHT ? new THREE.MeshLambertMaterial(maps) : new THREE.MeshStandardMaterial({ ...maps, roughness, metalness });
  if (KI_LOOKS[look]) addDepth(material, KI_LOOKS[look][0], KI_LOOKS[look][1] * DEPTH);
  return material;
}
