// Vergleichsaufnahmen: je Karte dieselben fünf Blicke, als PNG nach aufnahmen/<name>/ (über den Dev-Server, siehe
// vite.config.js), dazu die Bildrate je Karte in bericht.json. Start: http://localhost:5181/?aufnahmen=vorher
// (optional &effekte=aus|leicht|voll, Standard voll). Vergleich danach: /aufnahmen/vergleich.html?a=vorher&b=nachher

const MAPS = ['hafen', 'altstadt', 'baustelle'];
const VIEWS = ['ueberblick', 'start-blau', 'start-orange', 'mitte', 'figuren'];
const WIDTH = 1280;
const HEIGHT = 720;

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function runAufnahmen(arena, name, effekte) {
  const status = document.createElement('div');
  Object.assign(status.style, { position: 'fixed', right: '10px', bottom: '10px', zIndex: 99, color: '#fff', font: '13px system-ui', background: 'rgba(0,0,0,.6)', padding: '6px 10px', borderRadius: '6px' });
  document.body.append(status);
  const say = t => { status.textContent = `Aufnahmen „${name}“: ${t}`; };

  // Feste Bildgröße, damit vorher und nachher vergleichbar sind
  const canvas = document.getElementById('game');
  Object.assign(canvas.style, { width: `${WIDTH}px`, height: `${HEIGHT}px` });
  window.dispatchEvent(new Event('resize'));
  arena.sound.setVolume(0);
  arena.setEffects(effekte);

  // Welche Grafik zeichnet? „SwiftShader“ = ohne Grafikkarte, Bildraten dann wertlos
  const gl = canvas.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const grafik = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unbekannt';
  const bericht = { name, effekte, datum: new Date().toISOString(), groesse: [WIDTH, HEIGHT], browser: navigator.userAgent, grafik, karten: {} };
  say('Modelle laden …');
  await wait(4000);

  for (const map of MAPS) {
    say(map);
    arena.loadMap(map);
    await wait(2500); // Modelle der Karte (Baum, Brunnen …) kommen nach
    const game = arena.game;
    const views = viewsFor(game);
    for (const [i, view] of VIEWS.entries()) {
      placePlayers(game, view === 'figuren' ? views.figuren : null);
      const shot = { ...views[view], fov: 74, overview: true };
      await arena.shoot(shot, 45);
      const png = await arena.shoot(shot, 1, true);
      await post(`${name}/${map}-${i + 1}-${view}.jpg`, png);
    }
    // Bildrate: Blick vom Start Blau, 4 s
    placePlayers(game, null);
    const frames = await arena.measure({ ...views['start-blau'], fov: 74, overview: true }, 4000);
    // Ausgeblendete Fenster drosselt der Browser, dann ist die Zahl wertlos
    bericht.karten[map] = { fps: Math.round(frames / 4), sichtbar: !document.hidden };
  }
  await post(`${name}/bericht.json`, new Blob([JSON.stringify(bericht, null, 1)], { type: 'application/json' }));
  await post('vergleich.html', new Blob([VERGLEICH], { type: 'text/html' }));
  say(`fertig — ${Object.entries(bericht.karten).map(([k, v]) => `${k} ${v.fps} fps`).join(', ')}`);
  window.aufnahmenFertig = bericht;
}

async function post(datei, blob) {
  const res = await fetch(`/__aufnahme?datei=${encodeURIComponent(datei)}`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`Speichern ging nicht: ${datei}`);
}

// Blicke aus der Karte selbst: Überblick, an beiden Starts Richtung Mitte, aus der Mitte, zwei Soldaten vor der Kamera
function viewsFor(game) {
  const w = game.world;
  const floor = w.boxes.find(b => b.type === 'boden');
  const size = Math.max(floor.max[0] - floor.min[0], floor.max[2] - floor.min[2]);
  const eye = (pos, yaw, pitch = -0.04) => ({ x: pos[0], y: pos[1] + 1.65, z: pos[2], yaw, pitch });
  const toward = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
  const sA = w.spawns.find(s => s.team === 'A');
  const sB = w.spawns.find(s => s.team === 'B');
  const ground = game.nav.nodes.filter(n => Math.abs(n.y) < 0.5);
  const c = ground.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
  const mid = [c.x, c.y, c.z];
  const yawF = toward(mid, sB.pos);
  const dist = size * 0.8;
  const over = { yaw: 0.6, pitch: -0.75 };
  return {
    ueberblick: { x: Math.sin(over.yaw) * Math.cos(over.pitch) * dist, y: -Math.sin(over.pitch) * dist, z: Math.cos(over.yaw) * Math.cos(over.pitch) * dist, ...over },
    'start-blau': eye(sA.pos, toward(sA.pos, mid)),
    'start-orange': eye(sB.pos, toward(sB.pos, mid)),
    mitte: eye(mid, toward(mid, sA.pos)),
    figuren: { ...eye(mid, yawF, -0.08), stand: mid, yawF },
  };
}

// Alle Spieler aus dem Bild; für den Figuren-Blick zwei Gegner 4 m vor die Kamera, Blick zur Kamera
function placePlayers(game, view) {
  for (const p of game.players) Object.assign(p.pos, { x: 0, y: -1000, z: 0 });
  if (!view) return;
  const fx = -Math.sin(view.yawF);
  const fz = -Math.cos(view.yawF);
  const bots = game.players.filter(p => p.isBot && p.team === 'B').slice(0, 2);
  bots.forEach((p, i) => {
    const side = i === 0 ? -0.9 : 0.9;
    Object.assign(p.pos, { x: view.stand[0] + fx * 4 + fz * side, y: view.stand[1], z: view.stand[2] + fz * 4 - fx * side });
    p.yaw = view.yawF + Math.PI;
    p.pitch = 0;
  });
}

const VERGLEICH = `<!doctype html><meta charset="utf-8"><title>Vergleich</title>
<style>body{margin:0;background:#15181d;color:#eef1f5;font:14px system-ui;padding:16px}h2{margin:24px 0 8px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}img{width:100%;display:block;border-radius:4px}
small{color:#aab4c0}table{border-collapse:collapse;margin:8px 0}td,th{padding:3px 12px;text-align:left}</style>
<h1>Vergleichsaufnahmen</h1><div id="fps"></div><div id="list"></div>
<script>
const q = new URLSearchParams(location.search);
const a = q.get('a') || 'vorher', b = q.get('b') || 'nachher';
const maps = ${JSON.stringify(MAPS)}, views = ${JSON.stringify(VIEWS)};
Promise.all([a, b].map(n => fetch(n + '/bericht.json').then(r => r.ok ? r.json() : null))).then(([ra, rb]) => {
  document.getElementById('fps').innerHTML = '<table><tr><th>Bilder je Sekunde</th><th>' + a + '</th><th>' + b + '</th></tr>' +
    maps.map(m => '<tr><td>' + m + '</td><td>' + (ra?.karten[m]?.fps ?? '–') + '</td><td>' + (rb?.karten[m]?.fps ?? '–') + '</td></tr>').join('') +
    '</table><small>Effekte: ' + (ra?.effekte ?? '–') + ' / ' + (rb?.effekte ?? '–') + '. Gemessen im Browser, in dem die Aufnahmen liefen.</small>';
});
document.getElementById('list').innerHTML = maps.map(m => views.map((v, i) => {
  const f = m + "-" + (i + 1) + "-" + v + ".jpg";
  return '<h2>' + m + ' · ' + v + '</h2><div class="row"><div><small>' + a + '</small><img src="' + a + '/' + f + '"></div><div><small>' + b + '</small><img src="' + b + '/' + f + '"></div></div>';
}).join('')).join('');
</script>`;
