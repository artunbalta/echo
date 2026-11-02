/**
 * The weather, and the year's turn (DECISIONS C48): a pure function of the planet, the place and the
 * time, like everything else that is the same for everyone.
 *
 * NOTHING IS STORED, AND EVERYBODY GETS THE SAME RAIN. The day's weather is drawn from a stream keyed
 * on the region (the cell's resolution-2 parent, so neighbouring parcels share a sky) and the world
 * day; the hour only shapes it — rain that sets in after noon, fog that burns off by mid-morning.
 * Two strangers on one parcel are rained on together, and so is the server asking where a villager is.
 *
 * CLIMATE FROM WHAT IS KNOWN. There is no temperature field on this planet, so the climate is read off
 * what there is: latitude (the year's swing, and which half of the year is winter — the south's is the
 * north's summer), the cell's geography (the coast brings fog and storms, high ground brings snow,
 * ground with neither trees nor crops nor sea near it is dry). It is a design dial, stated as one.
 *
 * THE WEATHER AGREES WITH THE DEAD. The chronicle calls a year a storm year because someone was lost
 * at sea (`life.ts`: events explain deaths, never cause them). So the day a fisher of a village died
 * at sea is a storm on that village, whatever the stream would have drawn: a stranger who was there
 * that day saw the weather that killed him, and the chronicle and the sky tell one story.
 *
 * WHAT IT CHANGES (`schedule.ts`): in a storm nobody rows out and the fishers mend nets on the dock;
 * in rain or snow the green empties early and the fields are left sooner. What a villager says about
 * it is the facts' (`nowLine`).
 *
 * Pure.
 */

import { cellToLatLng, cellToParent, getResolution } from "h3-js";

import { causeOfDeath } from "./life.js";
import { stream, type Settlement, type SettlementGeography } from "./society.js";
import { DAYS_PER_YEAR } from "./worldclock.js";

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";

export interface Weather {
  kind: WeatherKind;
  /** 0 clear sky … 1 overcast. */
  cloud: number;
  /** 0 dry … 1 a downpour. Rain or snow, as `kind` says. */
  fall: number;
  /** 0 still … 1 a gale. */
  wind: number;
  /** 0 clear air … 1 you cannot see the next house. */
  fog: number;
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export const WEATHER = {
  /** The resolution whose cells share a day's weather. Two is ~150 km across on this planet. */
  regionResolution: 2,
  /** The base chance of a wet day, before season, coast and dryness. */
  wetBase: 0.24,
  /** How much a coast adds to storms, and to morning fog. */
  stormCoast: 0.1,
  fogCoast: 0.32,
  /** Ground with no trees, crops or sea is this much less wet at most. */
  dryness: 0.2,
  /** From this latitude, and on high ground, winter falls as snow. */
  snowLatDeg: 42,
  snowMountain: 0.6,
} as const;

/** Where in the year a day is: the season, and how far through the year (0 = the northern spring). */
export function seasonOf(day: number, latDeg = 45): { season: Season; yearT: number; cold: number } {
  const t = (((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR) / DAYS_PER_YEAR;
  // The south's year is half a year round from the north's.
  const local = latDeg < 0 ? (t + 0.5) % 1 : t;
  const season: Season = local < 0.25 ? "spring" : local < 0.5 ? "summer" : local < 0.75 ? "autumn" : "winter";
  // Coldest a little after the start of winter's quarter, warmest in high summer.
  const cold = 0.5 + 0.5 * Math.cos((local - 0.85) * Math.PI * 2);
  return { season, yearT: local, cold };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The day's weather over a cell. `s` is the settlement, if there is one: its dead decide its storms. */
export function weatherOn(seed: string, cell: string, geo: SettlementGeography, day: number, s?: Settlement | null): Weather {
  const res = getResolution(cell);
  const region = res > WEATHER.regionResolution ? cellToParent(cell, WEATHER.regionResolution) : cell;
  const [lat] = cellToLatLng(cell);
  const { season, cold } = seasonOf(day, lat);
  const r = stream(`${seed}/${region}/weather/${day}`);
  const u = r();
  const strength = r();
  const windU = r();

  const dry = WEATHER.dryness * clamp01(1 - geo.wooded - geo.arable - geo.coastal);
  const seasonal = season === "autumn" || season === "winter" ? 0.12 : season === "summer" ? -0.08 : 0;
  const wet = clamp01(WEATHER.wetBase + seasonal + 0.08 * geo.wooded - dry);
  const storm = clamp01((0.02 + WEATHER.stormCoast * geo.coastal) * (season === "autumn" || season === "winter" ? 1.6 : 0.7));
  const foggy = clamp01(WEATHER.fogCoast * geo.coastal * (season === "summer" ? 0.6 : 1) * 0.35);
  const snowy = (Math.abs(lat) >= WEATHER.snowLatDeg || geo.mountain >= WEATHER.snowMountain) && cold > 0.7;

  let kind: WeatherKind;
  if (u < storm) kind = "storm";
  else if (u < storm + wet) kind = snowy ? "snow" : "rain";
  else if (u < storm + wet + foggy) kind = "fog";
  else if (u < storm + wet + foggy + 0.22) kind = "cloudy";
  else kind = "clear";

  // The dead decide: a fisher of this village lost at sea today means a storm here today.
  if (s && s.cell === cell && s.people.some((p) => p.deathDay === day && p.leftDay > day && causeOfDeath(p) === "sea")) kind = "storm";

  const wind = clamp01(0.15 + 0.35 * windU + (kind === "storm" ? 0.5 : 0) + 0.15 * geo.coastal);
  switch (kind) {
    case "storm":
      return { kind, cloud: 1, fall: 0.85 + 0.15 * strength, wind: Math.max(wind, 0.8), fog: 0.25 };
    case "rain":
      return { kind, cloud: 0.85, fall: 0.35 + 0.5 * strength, wind, fog: 0.1 };
    case "snow":
      return { kind, cloud: 0.9, fall: 0.3 + 0.5 * strength, wind: wind * 0.6, fog: 0.2 };
    case "fog":
      return { kind, cloud: 0.55, fall: 0, wind: wind * 0.3, fog: 0.6 + 0.35 * strength };
    case "cloudy":
      return { kind, cloud: 0.5 + 0.35 * strength, fall: 0, wind, fog: 0 };
    default:
      return { kind, cloud: 0.1 + 0.25 * strength, fall: 0, wind, fog: 0 };
  }
}

/**
 * The weather at an hour of the day: the day's, shaped by the hour. Rain sets in and eases (a wet day
 * is not wet all day), and fog lies in the morning and lifts. Storms blow all day.
 */
export function weatherAt(seed: string, cell: string, geo: SettlementGeography, day: number, hour: number, s?: Settlement | null): Weather {
  const w = weatherOn(seed, cell, geo, day, s);
  if (w.kind === "fog") {
    const lift = clamp01((hour - 0.3) / 0.15);
    return { ...w, fog: w.fog * (1 - lift), cloud: w.cloud * (1 - 0.5 * lift) };
  }
  if (w.kind === "rain" || w.kind === "snow") {
    const r = stream(`${seed}/${cell}/weather/${day}/hours`);
    const start = 0.15 + r() * 0.45;
    const length = 0.25 + r() * 0.5;
    const inside = hour >= start && hour < start + length ? 1 : hour >= start + length && hour < start + length + 0.05 ? 1 - (hour - start - length) / 0.05 : 0;
    return { ...w, fall: w.fall * inside, cloud: w.cloud * (0.6 + 0.4 * inside) };
  }
  return w;
}

/** The weather in a sentence, as a villager standing in it would say it. */
export function weatherWords(w: Weather): string {
  switch (w.kind) {
    case "storm":
      return "A storm is blowing in off the sea; nobody has gone out in a boat";
    case "rain":
      return w.fall > 0.6 ? "It is pouring" : w.fall > 0.05 ? "It is raining" : "It has been raining on and off";
    case "snow":
      return w.fall > 0.05 ? "It is snowing" : "There has been snow today";
    case "fog":
      return w.fog > 0.3 ? "There is a thick fog" : "The morning's fog is lifting";
    case "cloudy":
      return "It is grey and overcast";
    default:
      return w.wind > 0.6 ? "It is clear, and windy" : "It is a clear day";
  }
}
