/**
 * The sound of the place (DECISIONS C56), made as it is heard: the sea, the wind, the rain and the
 * thunder, the village's murmur, the night's insects and the dawn's birds; and footsteps, tools at
 * work and animals, one at a time, from where they are.
 *
 * NO RECORDINGS. Everything is made in WebAudio from one buffer of noise and a few oscillators —
 * filtered, shaped and timed — so there is nothing to download, nothing to license, and nothing that
 * sounds the same twice in a row. What each bed's level should be is `mixFor`'s (`lib/soundscape.ts`),
 * read off the world a few times a second; this file only builds the graph and keeps the time.
 *
 * SILENT UNTIL ASKED. A browser will not play sound before a person has touched the page, so the
 * graph is built on the first key or click, and muting is the person's (`setMuted`, kept in this
 * browser). A world with no WebAudio (the tests, a server) is a world with no sound, and nothing else
 * changes.
 *
 * WHERE THINGS ARE HEARD FROM: a footstep is the stranger's own, under them; a blow on an anvil, a hen,
 * a gull is heard from where it is, louder near, and to the left or the right as the camera faces.
 * Indoors, the outside comes through the walls — lower, and duller — and the fire is in the room.
 */

import { timeOfDay, weatherAt, worldDayIndex, type WorldClock } from "@echo/planet";
import * as THREE from "three";

import { atDistance, CALL_EVERY, groundAt, mixFor, TOOL_RHYTHM, toolOf, toolOfPose, type Call, type Ground, type Mix, type Tool } from "@/lib/soundscape";
import type { AnimalsLayer } from "./animalsLayer";
import type { InteriorLayer } from "./interiorLayer";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { PlayerLayer } from "./playerLayer";
import type { SettlementLayer } from "./settlementLayer";
import type { SkyLayer } from "./skyLayer";
import type { VillagersLayer } from "./villagersLayer";
import type { WeatherLayer } from "./weatherLayer";

export interface SoundLayer extends WorldLayer {
  setMuted(muted: boolean): void;
  muted(): boolean;
  /** For tests and the page: whether the graph exists, the levels now, and how many one-shots played. */
  debug(): { started: boolean; mix: Mix | null; shots: number; steps: number; state: string | null; seaM: number | null; ground: Ground | null; level: number };
}

const STORE_KEY = "echo.sound";

/**
 * Each bed's gain at a mix of 1, set by ear against what each filter leaves of the noise: a lowpass
 * at 420 Hz keeps a fiftieth of its power and a highpass at 1.9 kHz nearly all of it, so the sea is
 * turned up and the rain down. On the page's own meter, Senstrand at noon: the dock with people on
 * it −22 dBFS, the green −27, a calm day's wind inland −40, the coast on a dry night −30 (C56). The
 * rain's gain is the filter's arithmetic only: no downpour has been heard on the page yet.
 */
const LEVEL = { sea: 1.2, wind: 0.7, rain: 0.11, murmur: 0.9, insects: 0.15 };

type Bed = { gain: GainNode; filter: BiquadFilterNode; pan?: StereoPannerNode };

export function soundLayer(options: { clock: WorldClock }): SoundLayer {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let outside: GainNode | null = null;
  let walls: BiquadFilterNode | null = null;
  let noise: AudioBuffer | null = null;
  const beds: Partial<Record<"sea" | "wind" | "rain" | "murmur" | "insects", Bed>> = {};
  let insectOsc: OscillatorNode | null = null;
  const lfos: OscillatorNode[] = [];
  let meter: AnalyserNode | null = null;
  let meterBuf: Float32Array<ArrayBuffer> | null = null;
  let mix: Mix | null = null;
  let muted = false;
  let shots = 0;
  let steps = 0;
  let since = 1;
  let seaClock = 2;
  let seaM: number | null = null;
  let seaAngle = 0;
  let ground: Ground | null = null;
  let lastFalls: number | null = null;
  let lastJump = -1;
  let snowing = false;
  let toolClock = 0;
  let lastThunder = 0;
  let lastCall = 0;
  let syllable = 0;
  const nextBlow = new Map<string, number>();
  let onGesture: (() => void) | null = null;
  let onVisibility: (() => void) | null = null;
  let hush: ReturnType<typeof setTimeout> | null = null;
  const facing = new THREE.Vector3();
  let t = 0;
  try {
    muted = typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY) === "off";
  } catch {
    muted = false;
  }

  const start = () => {
    if (ac || typeof window === "undefined") return;
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const limit = ac.createDynamicsCompressor();
    master.connect(limit).connect(ac.destination);
    // What is actually coming out, for the page's own check that the place is not silent.
    meter = ac.createAnalyser();
    meter.fftSize = 1024;
    meterBuf = new Float32Array(meter.fftSize);
    limit.connect(meter);
    walls = ac.createBiquadFilter();
    walls.type = "lowpass";
    walls.frequency.value = 18000;
    outside = ac.createGain();
    outside.connect(walls).connect(master);
    // Two seconds of noise, looped, is every bed's raw material.
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const bed = (type: BiquadFilterType, freq: number, q: number, panned = false): Bed => {
      const src = ac!.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.loopStart = Math.random();
      const filter = ac!.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ac!.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain);
      let pan: StereoPannerNode | undefined;
      if (panned && "createStereoPanner" in ac!) {
        pan = ac!.createStereoPanner();
        gain.connect(pan).connect(outside!);
      } else gain.connect(outside!);
      src.start();
      return { gain, filter, pan };
    };
    beds.sea = bed("lowpass", 420, 0.5, true);
    beds.wind = bed("bandpass", 380, 0.6);
    beds.rain = bed("highpass", 1900, 0.3);
    beds.murmur = bed("bandpass", 520, 1.3);
    // Crickets: a high tone chopped into chirps (fourteen a second) in trains (a little under one a
    // second), each chop a square wave on a gain — so it pulses as crickets do, not whines.
    const insects = ac.createGain();
    insects.gain.value = 0;
    insectOsc = ac.createOscillator();
    insectOsc.type = "triangle";
    insectOsc.frequency.value = 4400;
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 4400;
    band.Q.value = 6;
    const chop = (hz: number) => {
      const g = ac!.createGain();
      g.gain.value = 0.5;
      const lfo = ac!.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = hz;
      const depth = ac!.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(g.gain);
      lfo.start();
      lfos.push(lfo);
      return g;
    };
    insectOsc.connect(band).connect(chop(14)).connect(chop(0.8)).connect(insects).connect(outside);
    insectOsc.start();
    beds.insects = { gain: insects, filter: band };
  };

  /** A short shaped burst of noise through a filter: steps, crackle, clacks, rain on a roof. */
  const burst = (at: number, len: number, type: BiquadFilterType, freq: number, vol: number, pan = 0, dest: AudioNode | null = null, q = 0.8) => {
    if (!ac || !noise || !master || vol <= 0.001) return;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    src.connect(f).connect(g);
    const p = "createStereoPanner" in ac ? ac.createStereoPanner() : null;
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(dest ?? master);
    } else g.connect(dest ?? master);
    src.start(at, Math.random() * 1.5, len + 0.05);
    shots++;
  };
  /** A tone with a pitch glide and a quick decay: anvils, birds, barks, bleats. */
  const tone = (at: number, len: number, type: OscillatorType, f0: number, f1: number, vol: number, pan = 0, dest: AudioNode | null = null, vibrato = 0) => {
    if (!ac || !master || vol <= 0.001) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + len);
    if (vibrato > 0) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 7;
      const depth = ac.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + len + 0.05);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    o.connect(g);
    const p = "createStereoPanner" in ac ? ac.createStereoPanner() : null;
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(dest ?? master);
    } else g.connect(dest ?? master);
    o.start(at);
    o.stop(at + len + 0.05);
    shots++;
  };

  const step = (g: Ground, vol: number) => {
    if (!ac) return;
    steps++;
    const at = ac.currentTime;
    if (g === "wood") {
      burst(at, 0.07, "lowpass", 1400, vol * 0.5);
      tone(at, 0.08, "sine", 140, 90, vol * 0.4);
    } else if (g === "water") burst(at, 0.2, "bandpass", 900, vol * 0.6, 0, null, 0.6);
    else if (g === "sand") burst(at, 0.09, "lowpass", 700, vol * 0.55);
    else if (g === "snow") {
      burst(at, 0.13, "lowpass", 1100, vol * 0.45);
      burst(at + 0.02, 0.08, "bandpass", 3200, vol * 0.15, 0, null, 1.5);
    }
    else burst(at, 0.06, "bandpass", 2200, vol * 0.35, 0, null, 0.9);
  };

  const blow = (tool: Tool, vol: number, pan: number) => {
    if (!ac || !outside) return;
    const at = ac.currentTime;
    switch (tool) {
      case "anvil":
        tone(at, 0.45, "sine", 1820, 1800, vol * 0.35, pan, outside);
        tone(at, 0.3, "sine", 2690, 2660, vol * 0.2, pan, outside);
        burst(at, 0.03, "highpass", 3000, vol * 0.3, pan, outside);
        break;
      case "hammer":
        burst(at, 0.06, "lowpass", 900, vol * 0.5, pan, outside);
        tone(at, 0.07, "sine", 210, 150, vol * 0.4, pan, outside);
        break;
      case "hoe":
        burst(at, 0.13, "lowpass", 600, vol * 0.5, pan, outside);
        break;
      case "pick":
        burst(at, 0.05, "bandpass", 2600, vol * 0.45, pan, outside, 2);
        tone(at, 0.16, "sine", 950, 900, vol * 0.18, pan, outside);
        break;
      case "axe":
        burst(at, 0.1, "lowpass", 1200, vol * 0.55, pan, outside);
        tone(at, 0.1, "sine", 150, 110, vol * 0.4, pan, outside);
        break;
      case "loom":
        burst(at, 0.03, "bandpass", 1600, vol * 0.3, pan, outside, 3);
        burst(at + 0.09, 0.03, "bandpass", 1400, vol * 0.25, pan, outside, 3);
        break;
    }
  };

  const call = (kind: Call, vol: number, pan: number) => {
    if (!ac || !outside) return;
    const at = ac.currentTime;
    switch (kind) {
      case "hen":
        for (let k = 0; k < 3; k++) tone(at + k * 0.11, 0.08, "square", 520 + k * 60, 760, vol * 0.08, pan, outside);
        break;
      case "goat":
        tone(at, 0.55, "sawtooth", 330, 300, vol * 0.08, pan, outside, 18);
        break;
      case "dog":
        tone(at, 0.12, "sawtooth", 290, 180, vol * 0.14, pan, outside);
        burst(at, 0.1, "bandpass", 700, vol * 0.2, pan, outside, 2);
        tone(at + 0.22, 0.12, "sawtooth", 280, 170, vol * 0.12, pan, outside);
        break;
      case "gull":
        tone(at, 0.35, "sine", 1350, 780, vol * 0.12, pan, outside, 40);
        tone(at + 0.42, 0.25, "sine", 1250, 820, vol * 0.1, pan, outside, 40);
        break;
      case "crow":
        tone(at, 0.22, "sawtooth", 460, 380, vol * 0.08, pan, outside);
        tone(at + 0.3, 0.2, "sawtooth", 440, 360, vol * 0.07, pan, outside);
        break;
    }
  };

  const thunder = (vol: number) => {
    if (!ac || !outside) return;
    const at = ac.currentTime + 0.4 + Math.random() * 1.6;
    burst(at, 2.6, "lowpass", 140, vol, 0, outside, 0.5);
    burst(at + 0.15, 1.6, "lowpass", 320, vol * 0.5, 0, outside, 0.5);
  };

  return {
    name: "sound",

    async build() {
      if (typeof window === "undefined") return;
      onGesture = () => {
        start();
        if (!muted) void ac?.resume?.();
      };
      window.addEventListener("pointerdown", onGesture);
      window.addEventListener("keydown", onGesture);
      // A hidden tab draws no frames, so nothing would turn the beds down: the sea would go on
      // breaking in a tab nobody is looking at. Hidden, the whole graph stops; shown, it goes on.
      if (typeof document !== "undefined") {
        onVisibility = () => {
          if (!ac) return;
          if (document.hidden) void ac.suspend?.();
          else if (!muted) void ac.resume?.();
        };
        document.addEventListener("visibilitychange", onVisibility);
      }
    },

    update(dt, ctx: LayerContext) {
      if (!ac || !master || !outside || !walls) return;
      t += dt;
      since += dt;
      seaClock += dt;
      const village = ctx.region.village ?? null;
      const sky = ctx.layer<SkyLayer>("sky");
      const hour = sky ? sky.timeOfDay() : timeOfDay(options.clock, Date.now());
      const villagers = ctx.layer<VillagersLayer>("villagers");
      const player = ctx.layer<WorldLayer & PlayerLayer>("player");
      const settlement = ctx.layer<SettlementLayer>("settlement");
      const me = villagers?.playerPosition() ?? null;
      if (!me || !player) return;
      const frame = ctx.frame;
      // How far the water is, and which way: a ring of samples, once a second.
      if (seaClock > 1) {
        seaClock = 0;
        seaM = null;
        for (let r = 4; r <= 124 && seaM === null; r += 10) {
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const [tx, ty] = frame.fromLocalM(me.x + Math.cos(a) * r, me.y + Math.sin(a) * r);
            if (frame.heightAtTile(tx, ty) < 0) {
              seaM = r;
              seaAngle = a;
              break;
            }
          }
        }
      }
      const inside = settlement?.houseAt(me.x, me.y) ?? null;
      const room = ctx.layer<InteriorLayer>("interior")?.inside() ?? null;
      // Scene x is east and scene z is south, so the camera faces atan2(−z, x) in local metres.
      const look = ctx.camera.getWorldDirection(facing);
      const camDir = Math.atan2(-look.z, look.x);
      const panOf = (x: number, y: number) => Math.sin(Math.atan2(y - me.y, x - me.x) - camDir) * -0.8;

      // The beds, a few times a second.
      if (since > 0.25) {
        since = 0;
        const geo = ctx.region.geography;
        const w = geo ? weatherAt(ctx.seed, ctx.region.cell, geo, worldDayIndex(options.clock, Date.now()), hour, village?.settlement ?? null) : null;
        snowing = w?.kind === "snow";
        const ear = villagers?.earshot(me.x, me.y, 30) ?? { people: 0, talking: 0, working: [] };
        mix = mixFor({ hour, seaM, weather: w, inside: inside !== null && room !== null, fire: room !== null && !room.room.empty, people: ear.people, talking: ear.talking, coastal: village?.plan.dock !== null && village?.plan.dock !== undefined });
        const at = ac.currentTime;
        beds.rain?.gain.gain.setTargetAtTime(mix.rain * LEVEL.rain, at, 0.8);
        beds.insects?.gain.gain.setTargetAtTime(mix.insects * LEVEL.insects, at, 1);
        walls.frequency.setTargetAtTime(mix.through < 1 ? 650 : 18000, at, 0.2);
        outside.gain.setTargetAtTime(mix.through, at, 0.2);
        if (beds.sea?.pan) beds.sea.pan.pan.setTargetAtTime(Math.sin(seaAngle - camDir) * -0.6, at, 0.5);
        // The people near and the tools they work with.
        for (const wk of ear.working.slice(0, 4)) {
          const tool = toolOf(wk.occupation, wk.activity);
          if (!tool) continue;
          const due = nextBlow.get(wk.id) ?? t + Math.random() * TOOL_RHYTHM[tool];
          if (due <= t) {
            blow(tool, atDistance(Math.hypot(wk.x - me.x, wk.y - me.y), 24) * 0.9, panOf(wk.x, wk.y));
            nextBlow.set(wk.id, t + TOOL_RHYTHM[tool] * (0.9 + Math.random() * 0.25));
          } else nextBlow.set(wk.id, due);
        }
        // Animals call now and then; one at a time.
        const beasts = ctx.layer<AnimalsLayer>("animals")?.audible(me.x, me.y, 35) ?? [];
        for (const b of beasts) {
          const kind: Call | null = b.kind === "hen" ? "hen" : b.kind === "goat" ? "goat" : b.kind === "dog" ? "dog" : b.kind === "bird" ? (b.coastal && b.id.startsWith("bird:0") ? "gull" : "crow") : null;
          if (!kind || t - lastCall < 0.6) continue;
          if (Math.random() < 0.25 / CALL_EVERY[kind]) {
            call(kind, atDistance(b.d, 35), panOf(b.x, b.y));
            lastCall = t;
          }
        }
        // Thunder after lightning.
        const flashes = ctx.layer<WeatherLayer>("weather")?.lightning() ?? 0;
        if (flashes > lastThunder) {
          lastThunder = flashes;
          thunder(0.9 * mix.through + 0.1);
        }
      }
      if (!mix) return;
      // The sea breathes in waves, the wind in gusts, the murmur in syllables.
      const wave = 0.55 + 0.45 * Math.sin(t * 0.85) * Math.sin(t * 0.31 + 1);
      beds.sea?.gain.gain.setTargetAtTime(mix.sea * LEVEL.sea * wave, ac.currentTime, 0.3);
      const gust = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 2);
      beds.wind?.gain.gain.setTargetAtTime(mix.wind * LEVEL.wind * gust, ac.currentTime, 0.4);
      beds.wind?.filter.frequency.setTargetAtTime(280 + 320 * gust * mix.wind, ac.currentTime, 0.4);
      syllable += dt;
      if (syllable > 0.13) {
        syllable = 0;
        beds.murmur?.gain.gain.setTargetAtTime(mix.murmur * LEVEL.murmur * (0.3 + Math.random() * 0.7), ac.currentTime, 0.04);
        beds.murmur?.filter.frequency.setTargetAtTime(380 + Math.random() * 520, ac.currentTime, 0.05);
      }
      // The dawn chorus and the hearth, as one-shots at the beds' rates.
      if (Math.random() < mix.dawn * dt * 3) tone(ac.currentTime, 0.12, "sine", 2600 + Math.random() * 1500, 3400 + Math.random() * 1200, 0.03 * mix.through, (Math.random() - 0.5) * 1.4, outside);
      if (Math.random() < mix.hearth * dt * 9) burst(ac.currentTime, 0.02, "highpass", 3200, 0.12);

      // The stranger's own feet, as the gait puts them down: a step is heard when a foot is drawn
      // landing, not on a clock of its own, so a run is quicker because the legs are; the oars dip
      // every third stroke of the same count; a jump lands with a thud.
      const mv = player.mover();
      const speed = Math.hypot(mv.vx, mv.vy) * frame.tileM;
      const [tx, ty] = frame.fromLocalM(me.x, me.y);
      const dock = village?.plan.dock ?? null;
      const onDock = dock !== null && distToSegment(me, dock.root, dock.tip) < 1.4;
      ground = groundAt({ heightM: frame.heightAtTile(tx, ty), onDock, inside: inside !== null, nearSea: seaM !== null && seaM < 40, snow: snowing });
      const falls = player.footfalls();
      const aboard = player.aboard();
      if (lastFalls !== null && falls !== lastFalls && !mv.activity) {
        if (aboard) {
          if (falls % 3 === 0) step("water", 0.35);
        } else step(ground, speed > 3 ? 0.7 : 0.5);
      }
      lastFalls = falls;
      if (lastJump >= 0 && mv.jumpT < 0 && !aboard) step(ground, 0.9);
      lastJump = mv.jumpT;
      const ownTool = toolOfPose(mv.activity ?? null);
      if (ownTool) {
        toolClock += dt;
        if (toolClock >= TOOL_RHYTHM[ownTool]) {
          toolClock = 0;
          blow(ownTool, 0.8, 0);
        }
      } else toolClock = 0;
    },

    setMuted(m) {
      muted = m;
      try {
        localStorage.setItem(STORE_KEY, m ? "off" : "on");
      } catch {
        // a private window keeps it for the page
      }
      if (!ac || !master) return;
      // Fade, then stop the graph (a muted page spends nothing on sound); unmuting starts it again.
      if (hush) clearTimeout(hush);
      hush = null;
      master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.05);
      if (m) {
        const fading = ac;
        hush = setTimeout(() => void fading.suspend?.(), 400);
      } else void ac.resume?.();
    },
    muted: () => muted,
    debug: () => {
      let level = 0;
      if (meter && meterBuf) {
        meter.getFloatTimeDomainData(meterBuf);
        for (const v of meterBuf) level += v * v;
        level = Math.sqrt(level / meterBuf.length);
      }
      return { started: ac !== null, mix, shots, steps, state: ac?.state ?? null, seaM, ground, level };
    },

    dispose() {
      if (onGesture && typeof window !== "undefined") {
        window.removeEventListener("pointerdown", onGesture);
        window.removeEventListener("keydown", onGesture);
      }
      if (onVisibility && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (hush) clearTimeout(hush);
      insectOsc?.stop();
      for (const l of lfos) l.stop();
      void ac?.close?.();
      ac = null;
      master = null;
    },
  };
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}
