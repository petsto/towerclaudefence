// WebAudio SFX, synthesised except for the few sounds in SAMPLES, plus the home-screen music. One lazily created
// AudioContext, resumed on the first user gesture; events arriving before that are dropped. Throttled per sound +
// global voice cap, then a compressor so a 40-enemy wave doesn't clip.
import { ENEMIES, POWERS } from '../data';
import type { TowerId } from '../data/types';
import type { SimEvent } from '../sim/types';

export interface Sfx {
  play(events: readonly SimEvent[]): void;
  setMuted(m: boolean): void;
  /** Home-screen music on/off, with fades; starts on the first gesture if autoplay is blocked. */
  setMusic(on: boolean): void;
  readonly muted: boolean;
}

type SoundId =
  | 'gun' | 'mortar' | 'rail' | 'railHeavy' | 'missile' | 'zap' | 'stasis' | 'explosion' | 'shieldHit' | 'shieldBreak'
  | 'squelch' | 'squelchBig' | 'clank' | 'clankBig' | 'leak' | 'klaxon' | 'chime' | 'victory' | 'defeat'
  | 'build' | 'upgrade' | 'sell' | 'siren'
  | 'ready' | 'minePlant' | 'mineTrigger' | 'telegraph' | 'lanceBoom' | 'lanceHum';

const MASTER = 0.4;
/** Samples skip the crush shaper (it would shred them), so they sit at their own level on the master. */
const SAMPLE_GAIN = 0.6; // rail sample ~ matches the synth rail (loudest 93 ms window -18 vs -17 dBFS)
/** Music peak on the master, under the SFX; mute covers it via the shared master. */
const MUSIC = 0.4;
const MUSIC_FADE = 0.8;
/** Loop crossfade: the track is cut mid-phrase at full level, so its end doesn't run into its start. */
const XF = 2;

type SampleId = SoundId | 'music';
// ElevenLabs MP3s in ./samples, named after the SoundId they replace (music: music-<screen>.mp3). One line per file;
// until a file decodes (or if it fails) the synth recipe plays instead.
const SAMPLES: Readonly<Partial<Record<SampleId, string>>> = {
  rail: new URL('./samples/rail.mp3', import.meta.url).href,
  music: new URL('./samples/music-home.mp3', import.meta.url).href,
};
const MAX_VOICES = 18;
/** Min seconds between two plays of the same sound. */
const COOLDOWN: Readonly<Record<SoundId, number>> = {
  gun: 0.045, mortar: 0.12, rail: 0.1, railHeavy: 0.1, missile: 0.08, zap: 0.1, stasis: 0.18, explosion: 0.07,
  shieldHit: 0.07, shieldBreak: 0.1, squelch: 0.06, squelchBig: 0.2, clank: 0.06, clankBig: 0.2,
  leak: 0.5, klaxon: 1, chime: 0.5, victory: 2, defeat: 2, build: 0.05, upgrade: 0.05, sell: 0.05, siren: 2,
  ready: 0.3, minePlant: 0.05, mineTrigger: 0.08, telegraph: 0.5, lanceBoom: 0.5, lanceHum: 0.1,
};
/** UI / game-state cues bypass the voice cap. */
const PRIORITY = new Set<SoundId>([
  'leak', 'klaxon', 'siren', 'chime', 'victory', 'defeat', 'build', 'upgrade', 'sell', 'ready', 'minePlant', 'telegraph', 'lanceBoom',
]);
/** Arc Coil has none: it sounds on its 'chain' event. */
const SHOT: Readonly<Partial<Record<TowerId, SoundId>>> = {
  picket: 'gun', thumper: 'mortar', stasis: 'stasis', longshot: 'rail', breacher: 'missile',
};

type Voice = (ac: AudioContext, out: AudioNode, t: number, noise: AudioBuffer) => number; // returns duration

// ---------------------------------------------------------------- synth helpers

function env(ac: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}
function osc(ac: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}
function lowpass(ac: AudioContext, out: AudioNode, t: number, f0: number, f1 = f0, dur = 0): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.connect(out);
  return f;
}
function noise(
  ac: AudioContext, buf: AudioBuffer, t: number, dur: number, out: AudioNode,
  type: BiquadFilterType, f0: number, f1 = f0, q = 1,
): void {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  src.connect(f).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}
const jit = (f: number, amt = 0.08) => f * (1 + (Math.random() * 2 - 1) * amt);
function notes(ac: AudioContext, out: AudioNode, t: number, type: OscillatorType, freqs: readonly number[], step: number, len: number, vol: number): number {
  freqs.forEach((f, i) => {
    const g = env(ac, out, t + i * step, vol, 0.005, len);
    osc(ac, type, f, f, t + i * step, len + 0.01, g);
  });
  return freqs.length * step + len;
}

// ---------------------------------------------------------------- sound recipes

const VOICES: Readonly<Record<SoundId, Voice>> = {
  gun: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.05, env(ac, out, t, 0.5, 0.002, 0.05), 'bandpass', jit(1800, 0.15), 900, 1.2);
    osc(ac, 'square', jit(150), 60, t, 0.05, env(ac, out, t, 0.18, 0.002, 0.045));
    return 0.06;
  },
  mortar: (ac, out, t, nb) => {
    osc(ac, 'sine', jit(130), 38, t, 0.3, env(ac, out, t, 0.9, 0.004, 0.3));
    noise(ac, nb, t, 0.18, env(ac, out, t, 0.5, 0.003, 0.17), 'lowpass', 900, 200);
    return 0.32;
  },
  rail: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.04, env(ac, out, t, 0.7, 0.001, 0.04), 'highpass', 3000);
    osc(ac, 'sawtooth', jit(2600, 0.05), 180, t, 0.4, env(ac, out, t, 0.22, 0.002, 0.4));
    osc(ac, 'sine', 70, 40, t, 0.25, env(ac, out, t, 0.6, 0.002, 0.25));
    noise(ac, nb, t + 0.02, 0.45, env(ac, out, t + 0.02, 0.12, 0.01, 0.42), 'bandpass', 5000, 1500, 3);
    return 0.48;
  },
  railHeavy: (ac, out, t, nb) => {
    VOICES.rail(ac, out, t, nb);
    return railPunch(ac, out, t, nb);
  },
  missile: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.45, env(ac, out, t, 0.45, 0.06, 0.38), 'bandpass', 350, jit(2600, 0.15), 2);
    osc(ac, 'sawtooth', 90, 60, t, 0.12, env(ac, out, t, 0.15, 0.003, 0.1));
    return 0.46;
  },
  zap: (ac, out, t, nb) => {
    const g = env(ac, out, t, 0.25, 0.003, 0.22);
    const o = osc(ac, 'sawtooth', 800, 800, t, 0.24, g);
    for (let i = 0; i < 16; i++) o.frequency.setValueAtTime(200 + Math.random() * 1600, t + i * 0.015);
    noise(ac, nb, t, 0.2, env(ac, out, t, 0.25, 0.002, 0.2), 'highpass', 4000);
    return 0.26;
  },
  stasis: (ac, out, t) => {
    const lp = lowpass(ac, env(ac, out, t, 0.16, 0.05, 0.35), t, 400, 2200, 0.2);
    osc(ac, 'sawtooth', 110, 104, t, 0.4, lp);
    osc(ac, 'sawtooth', 111.7, 105, t, 0.4, lp);
    osc(ac, 'sine', 1320, 1180, t, 0.35, env(ac, out, t, 0.05, 0.05, 0.3));
    return 0.42;
  },
  explosion: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.6, env(ac, out, t, 0.9, 0.003, 0.6), 'lowpass', 2400, 140, 0.8);
    osc(ac, 'sine', jit(85), 28, t, 0.5, env(ac, out, t, 0.9, 0.003, 0.5));
    osc(ac, 'square', 55, 30, t, 0.15, env(ac, out, t, 0.2, 0.002, 0.15));
    return 0.62;
  },
  shieldHit: (ac, out, t) => {
    osc(ac, 'triangle', jit(1500, 0.05), 900, t, 0.09, env(ac, out, t, 0.12, 0.002, 0.08));
    return 0.1;
  },
  shieldBreak: (ac, out, t, nb) => {
    osc(ac, 'square', 1400, 260, t, 0.3, env(ac, out, t, 0.18, 0.002, 0.3));
    noise(ac, nb, t, 0.25, env(ac, out, t, 0.3, 0.002, 0.25), 'highpass', 5000, 2500);
    return 0.32;
  },
  squelch: (ac, out, t, nb) => squelch(ac, out, t, nb, 1),
  squelchBig: (ac, out, t, nb) => squelch(ac, out, t, nb, 2.2),
  clank: (ac, out, t, nb) => clank(ac, out, t, nb, 1),
  clankBig: (ac, out, t, nb) => {
    VOICES.explosion(ac, out, t, nb);
    return Math.max(clank(ac, out, t, nb, 0.55), 0.62);
  },
  leak: (ac, out, t) => notes(ac, out, t, 'square', [880, 620, 880, 620], 0.11, 0.1, 0.2),
  klaxon: (ac, out, t) => {
    const lp = lowpass(ac, env(ac, out, t, 0.22, 0.04, 1.3), t, 1400);
    for (let i = 0; i < 3; i++) {
      osc(ac, 'sawtooth', 220, 180, t + i * 0.42, 0.38, lp);
      osc(ac, 'sawtooth', 223, 182, t + i * 0.42, 0.38, lp);
    }
    return 1.35;
  },
  // boss wave: slow rising/falling air-raid wail, twice
  siren: (ac, out, t) => {
    const lp = lowpass(ac, env(ac, out, t, 0.22, 0.15, 2.3), t, 1800);
    for (const det of [1, 1.012]) {
      const o = osc(ac, 'sawtooth', 260 * det, 260 * det, t, 2.4, lp);
      for (let i = 0; i < 2; i++) {
        o.frequency.exponentialRampToValueAtTime(620 * det, t + i * 1.2 + 0.7);
        o.frequency.exponentialRampToValueAtTime(260 * det, t + i * 1.2 + 1.2);
      }
    }
    return 2.45;
  },
  chime: (ac, out, t) => notes(ac, out, t, 'triangle', [660, 880, 1320], 0.09, 0.35, 0.18),
  victory: (ac, out, t) => {
    notes(ac, out, t, 'square', [523, 659, 784, 1047], 0.14, 0.25, 0.1);
    return notes(ac, out, t, 'triangle', [262, 330, 392, 523], 0.14, 0.6, 0.2);
  },
  defeat: (ac, out, t) => {
    const lp = lowpass(ac, out, t, 2000, 200, 1.4);
    return notes(ac, lp, t, 'sawtooth', [392, 311, 262, 196], 0.28, 0.45, 0.2);
  },
  build: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.01, env(ac, out, t, 0.4, 0.001, 0.01), 'highpass', 2000);
    noise(ac, nb, t + 0.07, 0.01, env(ac, out, t + 0.07, 0.4, 0.001, 0.01), 'highpass', 2000);
    osc(ac, 'square', 300, 620, t, 0.09, env(ac, out, t, 0.1, 0.003, 0.09));
    return 0.12;
  },
  upgrade: (ac, out, t) => notes(ac, out, t, 'square', [440, 660, 990], 0.05, 0.06, 0.1),
  // command powers (GDD §14)
  // ready: two-tone console chirp (low-high, twice), square + filtered; distinct from the triangle wave-clear chime
  ready: (ac, out, t) => {
    const lp = lowpass(ac, out, t, 3200);
    return notes(ac, lp, t, 'square', [1175, 1760, 1175, 1760], 0.065, 0.05, 0.13);
  },
  // mine plant: a dull clunk, then a short arming beep
  minePlant: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.06, env(ac, out, t, 0.5, 0.002, 0.06), 'lowpass', 1200, 300, 2);
    osc(ac, 'square', 140, 70, t, 0.07, env(ac, out, t, 0.2, 0.002, 0.07));
    osc(ac, 'sine', 1980, 1980, t + 0.13, 0.06, env(ac, out, t + 0.13, 0.12, 0.003, 0.06));
    return 0.21;
  },
  // mine trigger: sub thump with a warble (slow FM on the body), plus a low rumble
  mineTrigger: (ac, out, t, nb) => {
    const o = osc(ac, 'sine', jit(75, 0.05), 32, t, 0.6, env(ac, out, t, 1, 0.004, 0.6));
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 9;
    depth.gain.value = 12;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.62);
    noise(ac, nb, t, 0.45, env(ac, out, t, 0.4, 0.01, 0.45), 'lowpass', 500, 90, 1);
    return 0.62;
  },
  // Lance telegraph: rising filtered whine over the telegraph, with targeting ticks that speed up
  telegraph: (ac, out, t, nb) => {
    const d = POWERS.lance_strike.telegraph;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + d * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
    g.connect(out);
    const lp = lowpass(ac, g, t, 600, 4000, d);
    osc(ac, 'sawtooth', 220, 1400, t, d, lp);
    osc(ac, 'sine', 440, 2800, t, d, g);
    for (let k = 0, at = 0; at < d - 0.05; k++, at += Math.max(0.06, 0.22 * 0.85 ** k)) {
      noise(ac, nb, t + at, 0.012, env(ac, out, t + at, 0.3, 0.001, 0.012), 'highpass', 4500);
    }
    return d + 0.05;
  },
  // Lance pulse 0: deep boom (sub drop + long filtered blast)
  lanceBoom: (ac, out, t, nb) => {
    osc(ac, 'sine', 70, 22, t, 1.1, env(ac, out, t, 1, 0.004, 1.1));
    noise(ac, nb, t, 1.2, env(ac, out, t, 0.9, 0.003, 1.2), 'lowpass', 3500, 90, 0.8);
    noise(ac, nb, t, 0.5, env(ac, out, t, 0.2, 0.002, 0.5), 'highpass', 5000, 2000);
    return 1.22;
  },
  // later pulses: a sizzling hum (detuned saw drone + crackle)
  lanceHum: (ac, out, t, nb) => {
    const lp = lowpass(ac, env(ac, out, t, 0.14, 0.02, 0.42), t, 1800, 700, 0.44);
    osc(ac, 'sawtooth', 110, 104, t, 0.44, lp);
    osc(ac, 'sawtooth', 165.5, 160, t, 0.44, lp);
    noise(ac, nb, t, 0.4, env(ac, out, t, 0.18, 0.01, 0.38), 'bandpass', 6000, 3500, 4);
    return 0.46;
  },
  sell: (ac, out, t, nb) => {
    noise(ac, nb, t, 0.01, env(ac, out, t, 0.4, 0.001, 0.01), 'highpass', 2000);
    osc(ac, 'square', 620, 280, t, 0.1, env(ac, out, t, 0.1, 0.003, 0.1));
    return 0.12;
  },
};

/** Longshot L3 layer over the rail crack (synth or sample): a sub punch, a bright descending zap and a long ionised sizzle. */
function railPunch(ac: AudioContext, out: AudioNode, t: number, nb: AudioBuffer): number {
  osc(ac, 'sine', 55, 24, t, 0.55, env(ac, out, t, 0.9, 0.003, 0.55));
  osc(ac, 'square', jit(4200, 0.04), 140, t, 0.22, lowpass(ac, env(ac, out, t, 0.14, 0.001, 0.22), t, 6000, 900, 0.22));
  noise(ac, nb, t, 0.06, env(ac, out, t, 0.6, 0.001, 0.06), 'bandpass', 1800, 600, 1.5);
  noise(ac, nb, t + 0.05, 0.85, env(ac, out, t + 0.05, 0.1, 0.03, 0.8), 'bandpass', 7000, 2500, 5);
  return 0.9;
}

function squelch(ac: AudioContext, out: AudioNode, t: number, nb: AudioBuffer, size: number): number {
  const d = 0.25 * size;
  noise(ac, nb, t, d, env(ac, out, t, 0.5, 0.004, d), 'lowpass', jit(1400 / Math.sqrt(size)), 120, 6);
  const g = env(ac, out, t, 0.3, 0.004, d);
  const o = osc(ac, 'sawtooth', jit(220 / size), 50, t, d, g);
  const lfo = ac.createOscillator();
  const depth = ac.createGain();
  lfo.frequency.value = 28;
  depth.gain.value = 40 / size;
  lfo.connect(depth).connect(o.frequency);
  lfo.start(t);
  lfo.stop(t + d + 0.02);
  return d + 0.02;
}
function clank(ac: AudioContext, out: AudioNode, t: number, nb: AudioBuffer, pitch: number): number {
  noise(ac, nb, t, 0.02, env(ac, out, t, 0.5, 0.001, 0.02), 'highpass', 2500);
  for (const [f, v, d] of [[420, 0.2, 0.3], [1130, 0.12, 0.2], [1870, 0.08, 0.14], [2650, 0.06, 0.1]] as const) {
    osc(ac, 'square', jit(f * pitch, 0.05), f * pitch * 0.97, t, d, env(ac, out, t, v, 0.001, d));
  }
  return 0.3;
}

function soundFor(ev: SimEvent): SoundId | null {
  switch (ev.type) {
    case 'shot': return SHOT[ev.defId] ?? null;
    case 'chain': return 'zap';
    case 'explosion': return 'explosion';
    case 'hit': return ev.shield > 0 ? 'shieldHit' : null;
    case 'shieldBreak': return 'shieldBreak';
    case 'death': {
      const d = ENEMIES[ev.defId];
      const big = d.isBoss || d.size === 'heavy';
      return d.faction === 'chorus' ? (big ? 'squelchBig' : 'squelch') : big ? 'clankBig' : 'clank';
    }
    case 'leak': return 'leak';
    case 'waveStart': return ev.boss ? 'siren' : 'klaxon';
    case 'waveClear': return 'chime';
    case 'gameOver': return ev.result === 'victory' ? 'victory' : 'defeat';
    case 'build': return 'build';
    case 'upgrade': return 'upgrade';
    case 'sell': return 'sell';
    case 'spawn': return null;
    case 'powerReady': return ev.charges === 1 ? 'ready' : null; // cue only when it just became usable
    case 'minePlanted': return 'minePlant';
    case 'mineTriggered': return 'mineTrigger';
    case 'strikeTelegraph': return 'telegraph';
    case 'strikePulse': return ev.index === 0 ? 'lanceBoom' : 'lanceHum';
  }
}

/** First/last frame above -50 dBFS, in seconds: skips leading silence and MP3 encoder padding. */
function bounds(b: AudioBuffer): { start: number; end: number } {
  const d = b.getChannelData(0); // ponytail: channel 0 only; fine for the stereo-ish ElevenLabs renders
  let i = 0;
  let j = d.length - 1;
  while (i < j && Math.abs(d[i]!) < 0.003) i++;
  while (j > i && Math.abs(d[j]!) < 0.003) j--;
  return { start: i / b.sampleRate, end: (j + 1) / b.sampleRate };
}
/** Equal-power crossfade curves. */
const FADE_IN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((i / 63) * Math.PI * 0.5));
const FADE_OUT = FADE_IN.slice().reverse();

/** Soft-clip curve with amplitude quantisation: the "gritty retro" bus. */
function crushCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(Math.tanh(x * 2.2) * 24) / 24;
  }
  return c;
}

export function createSfx(): Sfx {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: AudioNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  const samples = new Map<SampleId, { buf: AudioBuffer; start: number; end: number }>();
  let wantMusic = false;
  type Music = { gain: GainNode; srcs: AudioBufferSourceNode[]; timer: number };
  let music: Music | null = null;
  const last = new Map<SoundId, number>();
  const level3 = new Set<number>(); // tower ids at L3, from upgrade/build/sell events (shot events carry no level)
  const ends: number[] = [];

  function unlock(): void {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = muted ? 0 : MASTER;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 8;
      const shaper = ac.createWaveShaper();
      shaper.curve = crushCurve();
      shaper.connect(master).connect(comp).connect(ac.destination);
      bus = shaper;
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ctx = ac;
      for (const [id, url] of Object.entries(SAMPLES) as [SampleId, string][]) {
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .then((buf) => {
            samples.set(id, { buf, ...bounds(buf) });
            if (id === 'music') syncMusic();
          })
          .catch((e: unknown) => console.warn(`sfx: sample '${id}' unavailable, using the synth`, e));
      }
    }
    if (ac.state === 'suspended') void ac.resume();
  }
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlock, { capture: true });

  function trigger(id: SoundId): void {
    if (!ac || !bus || !noiseBuf || muted || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (now - (last.get(id) ?? -1) < COOLDOWN[id]) return;
    // drop finished voices
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i]! <= now) ends.splice(i, 1);
    if (ends.length >= MAX_VOICES && !PRIORITY.has(id)) return;
    last.set(id, now);
    const t = now + 0.005;
    ends.push(now + (sampled(id, t) ?? VOICES[id](ac, bus, t, noiseBuf)));
  }

  /** Sample-backed voices; null = no sample loaded, use the synth. */
  function sampled(id: SoundId, t: number): number | null {
    if (id !== 'railHeavy') return playSample(id, t, jit(1, 0.04));
    // Longshot L3: the rail sample a touch lower and heavier, plus the synth punch on the crush bus
    const d = playSample('rail', t, jit(0.9, 0.03));
    return d === null ? null : Math.max(d, railPunch(ac!, bus!, t, noiseBuf!));
  }
  function playSample(id: SampleId, t: number, rate: number): number | null {
    const s = samples.get(id);
    if (!s || !ac || !master) return null;
    const src = ac.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = SAMPLE_GAIN;
    src.connect(g).connect(master);
    src.start(t, s.start);
    return (s.buf.duration - s.start) / rate;
  }

  /** Starts or fades out the music to match `wantMusic`; one session at a time, each with its own fade gain. */
  function syncMusic(): void {
    const s = samples.get('music');
    if (!ac || !master) return;
    const ctx = ac;
    if (wantMusic && !music && s) {
      const gain = ctx.createGain();
      gain.connect(master);
      const t0 = ctx.currentTime + 0.05;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(MUSIC, t0 + MUSIC_FADE);
      const m: Music = { gain, srcs: [], timer: 0 };
      const len = s.end - s.start;
      // each pass fades out over its last XF seconds while the next fades in; scheduled a few seconds ahead
      const pass = (at: number): void => {
        const src = ctx.createBufferSource();
        src.buffer = s.buf;
        const g = ctx.createGain();
        if (at > t0) g.gain.setValueCurveAtTime(FADE_IN, at, XF);
        g.gain.setValueCurveAtTime(FADE_OUT, at + len - XF, XF);
        src.connect(g).connect(gain);
        src.start(at, s.start, len);
        m.srcs = [...m.srcs.slice(-1), src];
        m.timer = window.setTimeout(() => pass(at + len - XF), (at + len - XF - 3 - ctx.currentTime) * 1000);
      };
      pass(t0);
      music = m;
    } else if (!wantMusic && music) {
      const t = ctx.currentTime;
      const g = music.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + MUSIC_FADE);
      clearTimeout(music.timer);
      for (const src of music.srcs) src.stop(t + MUSIC_FADE);
      music = null;
    }
  }

  return {
    play(events) {
      for (const ev of events) {
        if (ev.type === 'upgrade' && ev.level === 3) level3.add(ev.towerId);
        else if (ev.type === 'build' || ev.type === 'sell') level3.delete(ev.towerId);
        const id = ev.type === 'shot' && ev.defId === 'longshot' && level3.has(ev.towerId) ? 'railHeavy' : soundFor(ev);
        if (id) trigger(id);
      }
    },
    setMuted(m) {
      muted = m;
      if (master && ac) master.gain.setTargetAtTime(m ? 0 : MASTER, ac.currentTime, 0.02);
    },
    setMusic(on) {
      wantMusic = on;
      if (on) unlock(); // try autoplay now; the gesture listeners resume it otherwise
      syncMusic();
    },
    get muted() {
      return muted;
    },
  };
}

