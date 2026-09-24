/** Every sound is synthesized here; nothing is loaded. Levels come from src/audio/mix.ts. */
export interface AudioFrame {
  listener: { x: number; z: number; yaw: number };
  hum: number;
  whisper: number;
  smilers: readonly { id: number; x: number; z: number }[];
  howler: { x: number; z: number; moving: boolean } | null;
  paused: boolean;
}

export interface AudioEngine {
  unlock(): void;
  toggleMute(): boolean;
  setFrame(f: AudioFrame): void;
  footstep(level: number, sprint: boolean): void;
  echoStep(x: number, z: number): void;
  howl(): void;
  click(): void;
  staticBurst(): void;
}

const EAR_HEIGHT = 1.6;
const SMOOTH = 0.08;

export function createAudioEngine(debug: boolean): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let noise: AudioBuffer;
  let humGain: GainNode;
  let whisperGain: GainNode;
  let muted = false;
  let howlerNextStep = 0;
  const smilerVoices = new Map<number, { panner: PannerNode; gain: GainNode }>();

  const panner = (x: number, z: number, ref: number, rolloff: number): PannerNode => {
    const p = ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'exponential';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 60;
    p.positionX.value = x;
    p.positionY.value = EAR_HEIGHT;
    p.positionZ.value = z;
    return p;
  };

  const noiseSource = (loop = false): AudioBufferSourceNode => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    s.loop = loop;
    return s;
  };

  /** A filtered noise burst: carpet thud, heavy step, or static. */
  const burst = (dest: AudioNode, level: number, cutoff: number, decay: number) => {
    const t = ctx!.currentTime;
    const src = noiseSource();
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(lp).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, decay + 0.05);
  };

  function build(): void {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp).connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Fluorescent hum: mains hum + a thin high buzz.
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);
    for (const [freq, level] of [[120, 0.5], [240, 0.2], [360, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(humGain);
      o.start();
    }
    const buzz = noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 7000;
    bp.Q.value = 8;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.15;
    buzz.connect(bp).connect(buzzGain).connect(humGain);
    buzz.start();

    // Whispers: two breathy bands, swaying between the ears.
    whisperGain = ctx.createGain();
    whisperGain.gain.value = 0;
    const sway = ctx.createStereoPanner();
    whisperGain.connect(sway).connect(master);
    const swayLfo = ctx.createOscillator();
    swayLfo.frequency.value = 0.13;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = 0.8;
    swayLfo.connect(swayDepth).connect(sway.pan);
    swayLfo.start();
    for (const [freq, rate] of [[900, 0.4], [1800, 0.7]] as const) {
      const src = noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 5;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(g.gain);
      src.connect(f).connect(g).connect(whisperGain);
      src.start();
      lfo.start();
    }
    if (debug) console.info('[backrooms] audio', ctx.state);
  }

  function smilerVoice(id: number, x: number, z: number) {
    let v = smilerVoices.get(id);
    if (!v) {
      const p = panner(x, z, 2, 1.5);
      const gain = ctx!.createGain();
      gain.gain.value = 0.05;
      const tone = ctx!.createOscillator();
      tone.frequency.value = 2200 + id * 37;
      const trem = ctx!.createOscillator();
      trem.frequency.value = 6;
      const tremDepth = ctx!.createGain();
      tremDepth.gain.value = 0.03;
      trem.connect(tremDepth).connect(gain.gain);
      tone.connect(gain).connect(p).connect(master);
      tone.start();
      trem.start();
      v = { panner: p, gain };
      smilerVoices.set(id, v);
    }
    return v;
  }

  return {
    unlock() {
      if (!ctx) build();
      else void ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
      return muted;
    },
    setFrame(f) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const L = ctx.listener;
      L.positionX.value = f.listener.x;
      L.positionY.value = EAR_HEIGHT;
      L.positionZ.value = f.listener.z;
      L.forwardX.value = -Math.sin(f.listener.yaw);
      L.forwardY.value = 0;
      L.forwardZ.value = -Math.cos(f.listener.yaw);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
      const quiet = f.paused ? 0.25 : 1;
      humGain.gain.setTargetAtTime(Math.min(1, f.hum * quiet), t, SMOOTH);
      whisperGain.gain.setTargetAtTime(f.paused ? 0 : Math.min(1, f.whisper), t, SMOOTH * 4);
      for (const s of f.smilers) {
        const v = smilerVoice(s.id, s.x, s.z);
        v.panner.positionX.setTargetAtTime(s.x, t, SMOOTH);
        v.panner.positionZ.setTargetAtTime(s.z, t, SMOOTH);
      }
      if (f.howler && f.howler.moving && !f.paused && t >= howlerNextStep) {
        howlerNextStep = t + 0.55;
        const p = panner(f.howler.x, f.howler.z, 3, 1.2);
        p.connect(master);
        burst(p, 0.9, 180, 0.35);
      }
    },
    footstep(level, sprint) {
      if (!ctx) return;
      burst(master, Math.min(1, level), sprint ? 800 : 500, sprint ? 0.1 : 0.14);
    },
    echoStep(x, z) {
      if (!ctx) return;
      const p = panner(x, z, 2, 1);
      p.connect(master);
      burst(p, 0.35, 380, 0.16);
    },
    howl() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(85, t + 2.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      for (const formant of [650, 1100]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = formant;
        bp.Q.value = 6;
        o.connect(bp).connect(lp);
      }
      lp.connect(g).connect(master);
      o.start(t);
      o.stop(t + 3);
    },
    click() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.05);
    },
    staticBurst() {
      if (!ctx) return;
      burst(master, 0.5, 9000, 1.2);
    },
  };
}
