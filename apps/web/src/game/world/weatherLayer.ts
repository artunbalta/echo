/**
 * The weather, drawn (DECISIONS C48): rain, snow, fog, a grey sky and lightning, over the parcel.
 *
 * WHAT IT DRAWS IS THE PLANET'S. `weatherAt` (`@echo/planet`) decides the sky for this cell, day and
 * hour — the same answer every browser and the server get — and this layer only shows it: it leans
 * the sky toward grey and pulls the fog in (`sky.setWeather`), and it falls rain or snow in a box that
 * travels with the camera, so what is seen is a downpour without a downpour's worth of particles.
 *
 * THE HOUR IS THE SKY'S, as in every layer: a frozen sky (screenshots) freezes the weather with it.
 * Lightning is presentation and only presentation: a flash every so often in a storm, from this
 * browser's own clock, never the same flash in two browsers and never a fact about the world.
 *
 * COST: one draw call while it rains or snows, none when it does not.
 */

import * as THREE from "three";
import { weatherAt, worldDayIndex, type Weather, type WorldClock } from "@echo/planet";

import type { LayerContext, WorldLayer } from "./PlanetWorld";
import type { SkyLayer } from "./skyLayer";

export interface WeatherLayer extends WorldLayer {
  /** What is falling and blowing now, for tests and the HUD. */
  weather(): Weather | null;
}

/** How many streaks a downpour is, in the box round the camera. */
const RAIN_MAX = 1800;
const SNOW_MAX = 1400;
/** The box, metres: half its width, and its height. */
const BOX_HALF = 18;
const BOX_H = 16;

export function weatherLayer(options: { clock: WorldClock }): WeatherLayer {
  let current: Weather | null = null;
  let since = Infinity;
  let rain: THREE.LineSegments | null = null;
  let snow: THREE.Points | null = null;
  let flash = 0;
  let nextFlash = 4;
  let elapsed = 0;
  const rainPos = new Float32Array(RAIN_MAX * 6);
  const snowPos = new Float32Array(SNOW_MAX * 3);
  const seeds = new Float32Array(Math.max(RAIN_MAX, SNOW_MAX) * 3);

  return {
    name: "weather",

    async build(ctx, signal) {
      if (signal.aborted) return;
      for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
      const rg = new THREE.BufferGeometry();
      rg.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
      rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc9d3de, transparent: true, opacity: 0.6, depthWrite: false }));
      rain.name = "weather:rain";
      rain.frustumCulled = false;
      rain.visible = false;
      ctx.scene.add(rain);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
      snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xf6f7fb, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
      snow.name = "weather:snow";
      snow.frustumCulled = false;
      snow.visible = false;
      ctx.scene.add(snow);
    },

    update(dt, ctx: LayerContext) {
      const sky = ctx.layer<SkyLayer>("sky");
      if (!sky || !rain || !snow) return;
      elapsed += dt;
      since += dt;
      // The planet's weather, a few times a second: it changes over minutes, not frames.
      if (since > 0.25) {
        since = 0;
        const geo = ctx.region.geography;
        if (geo) {
          const s = ctx.region.village?.settlement ?? null;
          current = weatherAt(ctx.seed, ctx.region.cell, geo, worldDayIndex(options.clock, Date.now()), sky.timeOfDay(), s);
        }
      }
      const w = current;
      if (!w) return;

      // Lightning, in a storm only: this browser's own, never the world's.
      if (w.kind === "storm") {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          flash = 1;
          nextFlash = 5 + Math.random() * 11;
        }
      }
      flash = Math.max(0, flash - dt * 4);
      sky.setWeather({ cloud: w.cloud, fog: w.fog, flash: flash > 0.6 || (flash > 0.2 && flash < 0.35) ? flash : 0 });

      const cam = ctx.camera.position;
      const falling = w.fall > 0.02;
      const isSnow = w.kind === "snow";
      rain.visible = falling && !isSnow;
      snow.visible = falling && isSnow;
      if (!falling) return;

      const lean = 0.35 * w.wind;
      if (!isSnow) {
        const n = Math.round(RAIN_MAX * w.fall);
        for (let i = 0; i < RAIN_MAX; i++) {
          const o = i * 6;
          if (i >= n) {
            rainPos.fill(0, o, o + 6);
            continue;
          }
          const sx = seeds[i * 3];
          const sz = seeds[i * 3 + 1];
          const sp = seeds[i * 3 + 2];
          const fallM = ((elapsed * (11 + 4 * sp) + sp * BOX_H) % BOX_H);
          const x = cam.x + (sx - 0.5) * 2 * BOX_HALF + lean * fallM;
          const z = cam.z + (sz - 0.5) * 2 * BOX_HALF;
          const y = cam.y + BOX_H / 2 - fallM;
          rainPos[o] = x;
          rainPos[o + 1] = y;
          rainPos[o + 2] = z;
          rainPos[o + 3] = x - lean * 0.9;
          rainPos[o + 4] = y - 0.9;
          rainPos[o + 5] = z;
        }
        rain.geometry.attributes.position.needsUpdate = true;
      } else {
        const n = Math.round(SNOW_MAX * w.fall);
        for (let i = 0; i < SNOW_MAX; i++) {
          const o = i * 3;
          if (i >= n) {
            snowPos.fill(0, o, o + 3);
            continue;
          }
          const sx = seeds[i * 3];
          const sz = seeds[i * 3 + 1];
          const sp = seeds[i * 3 + 2];
          const fallM = ((elapsed * (0.8 + 0.6 * sp) + sp * BOX_H) % BOX_H);
          snowPos[o] = cam.x + (sx - 0.5) * 2 * BOX_HALF + Math.sin(elapsed * 0.7 + sp * 9) * 0.6 + lean * fallM;
          snowPos[o + 1] = cam.y + BOX_H / 2 - fallM;
          snowPos[o + 2] = cam.z + (sz - 0.5) * 2 * BOX_HALF + Math.cos(elapsed * 0.6 + sx * 9) * 0.6;
        }
        snow.geometry.attributes.position.needsUpdate = true;
      }
    },

    weather: () => current,

    dispose() {
      for (const o of [rain, snow]) {
        if (!o) continue;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      rain = null;
      snow = null;
    },
  };
}
