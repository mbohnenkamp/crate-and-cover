// Erzeugte Geräusche (Web Audio), ohne Aufnahmen. Fremde Geräusche räumlich (HRTF), eigene direkt.
// Echte Aufnahmen aus MotionElements kommen später und ersetzen einzelne Rezepte.

const NOISE_SECONDS = 1;

export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let volume = 0.7;

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
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

  // Ausgang für ein Geräusch: direkt oder räumlich an pos
  function output(pos, gain) {
    const g = ctx.createGain();
    g.gain.value = gain;
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
  function burst(out, { type = 'bandpass', freq = 1000, q = 0.8, decay = 0.2, gain = 1, at = 0, sweepTo = null }) {
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
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
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

  const RECIPES = {
    shot_gewehr: o => { burst(o, { freq: 1300, q: 0.6, decay: 0.22, gain: 0.65 }); tone(o, { from: 110, to: 45, decay: 0.12, gain: 0.55 }); },
    shot_pistole: o => { burst(o, { freq: 2100, q: 0.7, decay: 0.14, gain: 0.8 }); tone(o, { from: 160, to: 70, decay: 0.08, gain: 0.5 }); },
    shot_scharf: o => {
      burst(o, { type: 'lowpass', freq: 2200, sweepTo: 300, q: 0.5, decay: 0.7, gain: 0.7 });
      tone(o, { from: 80, to: 35, decay: 0.3, gain: 0.7 });
    },
    swing: o => burst(o, { type: 'highpass', freq: 1500, sweepTo: 5000, q: 0.5, decay: 0.16, gain: 0.35 }),
    empty: o => tone(o, { wave: 'square', from: 1800, decay: 0.03, gain: 0.25 }),
    click: o => tone(o, { wave: 'square', from: 1200, to: 800, decay: 0.04, gain: 0.3 }),
    step: o => burst(o, { type: 'lowpass', freq: 380 + Math.random() * 120, q: 1, decay: 0.09, gain: 1.6 }),
    land: o => { burst(o, { type: 'lowpass', freq: 260, q: 1, decay: 0.16, gain: 0.8 }); tone(o, { from: 70, to: 45, decay: 0.12, gain: 0.5 }); },
    hit: o => tone(o, { wave: 'triangle', from: 1900, decay: 0.05, gain: 0.35 }),
    head: o => { tone(o, { wave: 'triangle', from: 2600, decay: 0.3, gain: 0.4 }); tone(o, { wave: 'sine', from: 3900, decay: 0.2, gain: 0.15 }); },
    kill: o => { tone(o, { wave: 'triangle', from: 880, decay: 0.09, gain: 0.3 }); tone(o, { wave: 'triangle', from: 1320, decay: 0.14, gain: 0.3, at: 0.08 }); },
    hurt: o => { tone(o, { from: 140, to: 60, decay: 0.18, gain: 0.7 }); burst(o, { type: 'lowpass', freq: 600, decay: 0.12, gain: 0.4 }); },
  };

  function play(name, pos = null, gain = 1) {
    if (!ctx || volume <= 0 || ctx.state !== 'running') return;
    RECIPES[name](output(pos, gain));
  }

  // Nachladen: Magazin raus, Magazin rein, Verschluss
  function reload(time, pos = null) {
    if (!ctx || volume <= 0 || ctx.state !== 'running') return;
    const o = output(pos, 0.8);
    tone(o, { wave: 'square', from: 900, to: 600, decay: 0.05, gain: 0.25, at: 0.15 });
    tone(o, { wave: 'square', from: 700, to: 500, decay: 0.06, gain: 0.3, at: time * 0.6 });
    tone(o, { wave: 'square', from: 1300, to: 900, decay: 0.05, gain: 0.3, at: time * 0.9 });
  }

  return { unlock, setVolume, setListener, play, reload };
}
