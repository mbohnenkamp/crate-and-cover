// Geräusche: Aufnahmen aus public/sounds/ (MotionElements, nicht in Git), wo vorhanden; sonst erzeugt (Web Audio).
// Fremde Geräusche räumlich (HRTF), eigene direkt, dazu Raumhall.

const NOISE_SECONDS = 1;

// Aufnahmen je Geräusch, mehrere Fassungen werden zufällig gewechselt. Fehlt eine Datei, gilt das Rezept.
const SAMPLES = {
  shot_gewehr: { files: ['gewehr_1', 'gewehr_2', 'gewehr_3', 'gewehr_4'], gain: 0.8 },
  shot_pistole: { files: ['pistole_1', 'pistole_2'], gain: 0.75 },
  shot_scharf: { files: ['scharf_1'], gain: 0.9 },
  swing: { files: ['messer'], gain: 0.6 },
  step: { files: ['schritt_1', 'schritt_2', 'schritt_3', 'schritt_4'], gain: 0.5 },
  land: { files: ['landung'], gain: 0.6 },
  reload_gewehr: { files: ['nachladen_gewehr'], gain: 0.6 },
  reload_pistole: { files: ['nachladen_pistole'], gain: 0.6 },
  bolt: { files: ['verschluss'], gain: 0.6 },
};

export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let reverb = null;
  let volume = 0.7;
  const buffers = {};

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      reverb = createReverb();
      loadSamples();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function loadSamples() {
    const base = import.meta.env?.BASE_URL ?? '/';
    for (const name of new Set(Object.values(SAMPLES).flatMap(s => s.files))) {
      fetch(`${base}sounds/${name}.m4a`)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then(data => ctx.decodeAudioData(data))
        .then(buf => { buffers[name] = buf; })
        .catch(() => {});
    }
  }

  // Aufnahme abspielen, leicht verstimmt, damit Wiederholungen nicht gleich klingen. false, wenn keine geladen ist.
  function sample(name, pos, gain, at = 0) {
    const def = SAMPLES[name];
    const loaded = def?.files.filter(f => buffers[f]) ?? [];
    if (!loaded.length) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffers[loaded[Math.floor(Math.random() * loaded.length)]];
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    src.connect(output(pos, gain * def.gain, 0.12));
    src.start(ctx.currentTime + at);
    return true;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }

  function setListener(pos, yaw, pitch) {
    if (!ctx) return;
    const l = ctx.listener;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // Raumhall einer Halle aus Beton: abklingendes Rauschen, Höhen werden schneller leiser als Tiefen.
  // Ohne Hall klingt alles trocken wie aus der Dose.
  function createReverb() {
    const seconds = 1.1;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let low = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        low += 0.12 * ((Math.random() * 2 - 1) - low); // weiches Rauschen
        d[i] = low * Math.exp(-t * 4.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const out = ctx.createGain();
    out.gain.value = 1.6;
    conv.connect(out).connect(master);
    return conv;
  }

  // Ausgang für ein Geräusch: direkt oder räumlich an pos, dazu ein Anteil in den Hall.
  // Der Hall hängt nicht an der Entfernung — ferne Geräusche klingen dadurch hallig, nahe trocken.
  function output(pos, gain, wet = 0.22) {
    const g = ctx.createGain();
    g.gain.value = gain;
    const send = ctx.createGain();
    send.gain.value = wet * (pos ? 0.6 : 1);
    g.connect(send);
    send.connect(reverb);
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5;
      p.rolloffFactor = 1.1;
      p.maxDistance = 80;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p).connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  // Rauschstoß durch einen Filter, mit schnellem Anschlag und Abklingen
  function burst(out, { type = 'bandpass', freq = 1000, q = 0.8, decay = 0.2, gain = 1, at = 0, sweepTo = null, attack = 0.003 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * (NOISE_SECONDS - decay - 0.05));
    src.stop(t + decay + 0.05);
  }

  // Ton mit Tonhöhenverlauf (Knall-Bauch, Klick, Signalton)
  function tone(out, { wave = 'sine', from = 120, to = from, decay = 0.15, gain = 1, at = 0 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(env).connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  // Schüsse aus fünf Schichten: Knall (hell, sehr kurz), Körper (mittel), Schlag (150–300 Hz, den auch
  // Laptop-Lautsprecher spielen), Tiefe (nur mit Kopfhörer zu spüren), Nachklang (dumpf)
  function gunshot(o, { crack, body, punch, boom, tail, gain }) {
    burst(o, { type: 'highpass', freq: crack, q: 0.5, decay: 0.04, gain: 1.1 * gain, attack: 0.001 });
    burst(o, { type: 'lowpass', freq: body, q: 0.6, decay: 0.14, gain: 0.7 * gain, attack: 0.002 });
    burst(o, { type: 'bandpass', freq: punch, q: 1.1, decay: 0.12, gain: 1.6 * gain, attack: 0.002 });
    tone(o, { from: punch * 1.2, to: punch * 0.6, decay: 0.1, gain: 0.5 * gain });
    tone(o, { from: boom, to: boom * 0.5, decay: 0.2, gain: 0.5 * gain });
    burst(o, { type: 'lowpass', freq: 500, q: 0.5, decay: tail, gain: 0.3 * gain, attack: 0.01 });
  }

  // Metallklick ohne Pieps: sehr kurzes Rauschen durch einen engen Filter
  function clack(o, freq, gain, at = 0) {
    burst(o, { type: 'bandpass', freq, q: 6, decay: 0.03, gain: gain * 3, at, attack: 0.001 });
    burst(o, { type: 'lowpass', freq: 500, q: 1, decay: 0.05, gain: gain * 1.8, at, attack: 0.001 });
  }

  const RECIPES = {
    shot_gewehr: o => gunshot(o, { crack: 2600, body: 1100, punch: 190, boom: 80, tail: 0.45, gain: 0.7 }),
    shot_pistole: o => gunshot(o, { crack: 3200, body: 1500, punch: 260, boom: 110, tail: 0.3, gain: 0.6 }),
    shot_scharf: o => gunshot(o, { crack: 2000, body: 800, punch: 150, boom: 55, tail: 0.9, gain: 0.8 }),
    swing: o => burst(o, { type: 'bandpass', freq: 700, sweepTo: 2600, q: 1.2, decay: 0.18, gain: 0.5, attack: 0.04 }),
    empty: o => clack(o, 2400, 0.45),
    click: o => clack(o, 1800, 0.45),
    step: o => {
      burst(o, { type: 'lowpass', freq: 220 + Math.random() * 80, q: 1.2, decay: 0.1, gain: 1.8, attack: 0.002 });
      burst(o, { type: 'bandpass', freq: 1800 + Math.random() * 800, q: 2, decay: 0.04, gain: 0.25, attack: 0.001 });
    },
    land: o => {
      burst(o, { type: 'lowpass', freq: 200, q: 1, decay: 0.18, gain: 1.4 });
      tone(o, { from: 65, to: 40, decay: 0.14, gain: 0.6 });
    },
    hit: o => tone(o, { from: 1500, to: 1300, decay: 0.06, gain: 0.3 }),
    head: o => { tone(o, { from: 2100, decay: 0.25, gain: 0.3 }); tone(o, { from: 1050, decay: 0.12, gain: 0.2 }); },
    kill: o => { tone(o, { from: 660, decay: 0.1, gain: 0.3 }); tone(o, { from: 990, decay: 0.16, gain: 0.3, at: 0.08 }); },
    hurt: o => { tone(o, { from: 110, to: 55, decay: 0.2, gain: 0.8 }); burst(o, { type: 'lowpass', freq: 350, decay: 0.14, gain: 0.7 }); },
  };

  // Rückmeldungen (Treffer, Abschuss, eigener Schaden) ohne Hall, damit sie klar bleiben
  const DRY = new Set(['hit', 'head', 'kill', 'hurt']);

  function play(name, pos = null, gain = 1) {
    if (!ctx || volume <= 0 || ctx.state !== 'running') return;
    if (sample(name, pos, gain)) return;
    RECIPES[name](output(pos, gain, DRY.has(name) ? 0 : undefined));
  }

  // Nachladen: Aufnahme je Waffe (Scharfschütze: Magazin, dann Verschluss am Ende), sonst erzeugte Klicks
  function reload(time, pos = null, weapon = 'gewehr') {
    if (!ctx || volume <= 0 || ctx.state !== 'running') return;
    if (weapon === 'pistole' ? sample('reload_pistole', pos, 1) : sample('reload_gewehr', pos, 1)) {
      if (weapon === 'scharf') sample('bolt', pos, 1, time * 0.85);
      return;
    }
    const o = output(pos, 0.9);
    clack(o, 1400, 0.4, 0.15);
    clack(o, 1100, 0.5, time * 0.6);
    clack(o, 2000, 0.5, time * 0.88);
    clack(o, 1600, 0.4, time * 0.88 + 0.08);
  }

  // Zum Probehören im Menü: alle Geräusche nacheinander, Gegner 10 m links
  function demo() {
    if (!ctx) return;
    const seq = ['shot_gewehr', 'shot_gewehr', 'shot_gewehr', 'shot_pistole', 'shot_scharf', 'swing', 'step', 'step', 'land',
      'hit', 'head', 'kill', 'hurt', 'fern:shot_gewehr', 'fern:step', 'fern:step', 'reload', 'reload_scharf'];
    let at = 0;
    for (const item of seq) {
      const far = item.startsWith('fern:');
      const name = item.replace('fern:', '');
      setTimeout(() => {
        setListener({ x: 0, y: 1.6, z: 0 }, 0, 0);
        if (name === 'reload') reload(1.6);
        else if (name === 'reload_scharf') reload(3.6, null, 'scharf');
        else play(name, far ? { x: -10, y: 1, z: 0 } : null);
      }, at * 1000);
      at += name.startsWith('shot') ? 0.5 : name === 'reload' ? 2 : 0.32;
    }
  }

  return { unlock, setVolume, setListener, play, reload, demo };
}
