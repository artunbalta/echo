"use client";

/**
 * The parcel under the pointer, drawn close up.
 *
 * This is not a crop of the globe, and it could not be. The globe's terrain mesh has a vertex every
 * 0.88 km and a parcel is 1.4 km across, so there is nothing inside one parcel for the globe to
 * show: zooming its pixels would magnify two triangles. This samples the terrain functions directly
 * at about ten metres per pixel, which is detail that exists in the world and has never been drawn.
 *
 * It is the same elevation, moisture and temperature the walkable scene uses, through the same
 * sceneHeightAt the cross renderer agreement test pins, so the shape in this box is the shape of the
 * ground you would arrive on. Rendered small and scaled up with crisp edges, which is both faster
 * and the right register for this page.
 */

import {
  BIOME_COLOUR,
  biome,
  cellAreaKm2,
  createTangentPatch,
  hexagonWidthM,
  createTerrain,
  sceneHeightAt,
  type Calibration,
} from "@echo/planet";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ParcelInsetProps {
  cell: string;
  seed: string;
  seaLevel: number;
  peakElevation: number;
  radiusKm: number;
  commonsName: string | null;
  /** False when this cell holds too little land to ever be assigned. Section 5.4. */
  assignable: boolean;
  /** Rendered pixels per side. Kept small on purpose: it is scaled up crisp, not smoothed. */
  resolution?: number;
}

export default function ParcelInset({
  cell,
  seed,
  seaLevel,
  peakElevation,
  radiusKm,
  commonsName,
  assignable,
  resolution = 112,
}: ParcelInsetProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [summary, setSummary] = useState<{ widthM: number; areaKm2: number; biome: string } | null>(null);

  const field = useMemo(() => createTerrain(seed), [seed]);
  const calibration = useMemo<Calibration>(
    () => ({ seaLevel, peakElevation, landFraction: 0.6 }),
    [seaLevel, peakElevation],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;

    const patch = createTangentPatch(cell, radiusKm);
    // A little wider than the parcel, so its edge is visible rather than clipped by the frame.
    const half = patch.extentM * 1.16;
    const step = (half * 2) / resolution;

    // Heights first, in one pass, so the shading can come from neighbours in the array instead of
    // three more terrain samples per pixel.
    const heights = new Float64Array(resolution * resolution);
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        heights[j * resolution + i] = sceneHeightAt(
          patch,
          field,
          calibration,
          -half + i * step,
          half - j * step,
        );
      }
    }

    // Relief has to be scaled to THIS patch, not to a constant. Adjacent pixels are about ten
    // metres apart, so the height difference between them is a ten thousandth of the planet's
    // range, and any fixed multiplier is either invisible on a plain or solid black on a cliff.
    // The scale is set from the gradients actually present, at a high percentile so one cliff does
    // not flatten everything else.
    const gradients: number[] = [];
    for (let j = 1; j < resolution - 1; j += 2) {
      for (let i = 1; i < resolution - 1; i += 2) {
        const dx = heights[j * resolution + i + 1]! - heights[j * resolution + i - 1]!;
        const dy = heights[(j - 1) * resolution + i]! - heights[(j + 1) * resolution + i]!;
        gradients.push(Math.hypot(dx, dy));
      }
    }
    gradients.sort((a, b) => a - b);
    const reference = gradients[Math.floor(gradients.length * 0.92)] ?? 0;
    // A flat parcel really is flat, and inventing relief for it would be a lie about the ground.
    const relief = reference > 1e-9 ? 0.42 / reference : 0;

    const image = context.createImageData(resolution, resolution);
    const counts = new Map<string, number>();
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const k = j * resolution + i;
        const x = -half + i * step;
        const y = half - j * step;
        const height = heights[k]!;
        const direction = patch.toDirection(x, y);
        const kind = biome(height, field.moisture(direction), field.temperature(direction));

        const inside = insidePolygon(patch.boundary, x, y);
        if (inside) counts.set(kind, (counts.get(kind) ?? 0) + 1);

        // Relief from the height field itself, lit from the north west as on a printed map.
        const left = heights[j * resolution + Math.max(0, i - 1)]!;
        const right = heights[j * resolution + Math.min(resolution - 1, i + 1)]!;
        const up = heights[Math.max(0, j - 1) * resolution + i]!;
        const down = heights[Math.min(resolution - 1, j + 1) * resolution + i]!;
        const shade = clamp(1 + relief * ((up - down) - (right - left)) * 0.5, 0.58, 1.42);

        const colour = BIOME_COLOUR[kind];
        // Everything outside the deed line is still terrain, and is dimmed rather than hidden: the
        // point of the frame is to show the parcel IN a place, not floating in a void.
        const dim = inside ? 1 : 0.42;
        const o = k * 4;
        image.data[o] = clamp(colour[0] * shade * dim, 0, 255);
        image.data[o + 1] = clamp(colour[1] * shade * dim, 0, 255);
        image.data[o + 2] = clamp(colour[2] * shade * dim, 0, 255);
        image.data[o + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);

    // The deed line, on top, in the one colour no biome uses.
    context.strokeStyle = commonsName ? "#e2c67a" : "#a06cd5";
    context.lineWidth = 1.5;
    context.beginPath();
    patch.boundary.forEach(([x, y], index) => {
      const px = ((x + half) / (half * 2)) * resolution;
      const py = ((half - y) / (half * 2)) * resolution;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.closePath();
    context.stroke();

    let dominant = "ocean";
    let best = -1;
    for (const [kind, n] of counts) {
      const weight = kind === "ocean" ? n * 0.001 : n;
      if (weight > best) {
        best = weight;
        dominant = kind;
      }
    }
    const areaKm2 = cellAreaKm2(cell, radiusKm);
    // Flat to flat, which is the width the rest of this project quotes and the one that answers
    // "what fits inside this parcel". Corner to corner is 15% larger and reads as a bigger claim.
    setSummary({ widthM: hexagonWidthM(areaKm2), areaKm2, biome: dominant });
  }, [cell, field, calibration, radiusKm, resolution, commonsName]);

  return (
    <div className="w-[228px] rounded-lg border border-echo/30 bg-ink/92 p-3 backdrop-blur-sm">
      <canvas
        ref={canvas}
        width={resolution}
        height={resolution}
        className="block h-[204px] w-[204px] rounded [image-rendering:pixelated]"
      />
      <p className="mt-2 font-pixel text-xs text-parchment">
        {commonsName ?? (summary ? LABEL[summary.biome] ?? summary.biome : "Reading the ground")}
      </p>
      {summary ? (
        <p className="mt-0.5 font-pixel text-[10px] leading-relaxed text-parchment/50">
          {summary.areaKm2.toFixed(2)} km², about {Math.round(summary.widthM)} m across
        </p>
      ) : null}
      {/* Said before the click, not after it. The whole complaint was not knowing what you were
          pointing at, and "you cannot have this one" is the most useful thing to know early. */}
      {!assignable && !commonsName ? (
        <p className="mt-1 font-pixel text-[10px] leading-relaxed text-[#7a9cbe]">
          Never assigned. Too little land.
        </p>
      ) : null}
      {commonsName ? (
        <p className="mt-1 font-pixel text-[10px] leading-relaxed text-[#e2c67a]">
          Public commons. Nobody owns it.
        </p>
      ) : null}
    </div>
  );
}

const LABEL: Record<string, string> = {
  ocean: "Open water",
  beach: "Shoreline",
  grassland: "Grassland",
  forest: "Forest",
  rainforest: "Rainforest",
  savanna: "Savanna",
  desert: "Desert",
  tundra: "Tundra",
  taiga: "Taiga",
  "bare-rock": "Bare rock",
  snow: "Snow",
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** An H3 cell stays convex under the gnomonic projection, so a sign test is enough. */
function insidePolygon(polygon: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
