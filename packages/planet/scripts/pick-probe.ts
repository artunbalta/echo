/** What is really at a lat/lng the globe's hover reported, and what the globe would have drawn there. */
import { latLngToCell, cellToLatLng } from "h3-js";
import { landFractionOfCell } from "../lib/land.js";
import { PLANET_PARAMS } from "../lib/manifest.js";
import { latLngToVec3 } from "../lib/geo.js";
import { biomeAt, calibratePlanet, createTerrain, isLand } from "../lib/terrain.js";

const lat = Number(process.argv[2] ?? 8.84);
const lng = Number(process.argv[3] ?? 78.13);
const res = Number(process.argv[4] ?? 4);
const seed = process.env.PLANET_SEED ?? "echo-capacity-1";

const field = createTerrain(seed);
const cal = calibratePlanet(field, PLANET_PARAMS.landFractionTarget);
const cell = latLngToCell(lat, lng, res);
const [clat, clng] = cellToLatLng(cell);

console.log(`seed ${seed}  seaLevel ${cal.seaLevel.toFixed(6)}  landFractionTarget ${PLANET_PARAMS.landFractionTarget}`);
console.log(`asked  ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
console.log(`cell   ${cell} res ${res}, centre ${clat.toFixed(4)}, ${clng.toFixed(4)}`);
console.log(`at the asked point: land=${isLand(field, cal.seaLevel, latLngToVec3(lat, lng))} biome=${biomeAt(field, cal, latLngToVec3(lat, lng))}`);
console.log(`at the cell centre: land=${isLand(field, cal.seaLevel, latLngToVec3(clat, clng))} biome=${biomeAt(field, cal, latLngToVec3(clat, clng))}`);
for (const r of [1, 2, 3, 4, 5, 6, 7]) {
  const c = latLngToCell(lat, lng, r);
  console.log(`  res ${r}: ${c}  land ${(landFractionOfCell(field, cal.seaLevel, c, 2) * 100).toFixed(1)}%`);
}
for (const depth of [1, 2, 3]) {
  console.log(`landFractionOfCell depth ${depth}: ${(landFractionOfCell(field, cal.seaLevel, cell, depth) * 100).toFixed(1)}%`);
}
// And what a WRONG sea level would say, since PlanetGlobe hardcodes landFraction 0.6 in its calibration.
for (const sl of [0, cal.seaLevel]) {
  console.log(`  with seaLevel ${sl.toFixed(6)}: ${(landFractionOfCell(field, sl, cell, 2) * 100).toFixed(1)}% land`);
}
