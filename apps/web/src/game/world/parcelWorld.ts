/**
 * The layer list a parcel is built from, in one place (task A2).
 *
 * /parcel/[cell] and /demo run the same host and the same layers in the same order, and until now
 * each of them wrote that order out itself, with the reasoning duplicated in two component headers.
 * A list built twice is a list that will one day be built differently, and the way that goes is on
 * record: the demo called `scatterLayer()` bare while the test called it with the stations passed
 * in, and a fourteen metre buttress tree stood 2.69 m from the cave mouth for as long as it took a
 * person, not a test, to notice. So there is one list, here, and the two routes differ only in what
 * they hand it.
 *
 * THE ORDER IS LOAD-BEARING, every step of it.
 *   sky first, because it owns the air. The terrain layer paints a flat blend of skyDusk and
 *     skyHorizon only when it finds `scene.background` still null, and that fallback is exactly the
 *     orange wall somebody reported standing under on /parcel, where nothing had ever claimed it.
 *   terrain second, because the scatter stands each prop on the ground the terrain actually drew
 *     rather than on the placer's own z, which is sampled off a 10 m mask grid.
 *   scatter third.
 *   canopy-closure fourth, and it can be nowhere else: it darkens the ground the terrain layer
 *     uploaded by the crowns the scatter layer placed, so it is the one layer that needs BOTH of
 *     them already built. DECISIONS C17. It reaches for them by name and complains if either is
 *     missing rather than silently shipping a floor with the open sky's light on it.
 *   player after the scatter, and this one is load-bearing rather than tidy: `playerLayer.build`
 *     looks the scatter up by name and takes its collider index, so a player built ahead of it
 *     walks through every trunk on the parcel.
 *   walk after the player, so the position it feeds the chain and tallies is the one the mover
 *     committed this frame rather than the one from the frame before.
 *   slice last, where there is one: it reads the same player position, and it may only act on a
 *     frame the walk layer has already reported.
 *
 * NO MOUNT MAY PASS `follow`. The player layer drives ctx.camera itself, with orbit and terrain
 * collision; PlanetWorld's provisional boom runs after the layers whenever `setFollow` is set and
 * would overwrite that camera every frame.
 *
 * WHAT VARIES IS THE STATIONS, AND THE SCATTER FOLLOWS THEM. Passing `slice` is one decision with
 * two consequences that must never be taken separately: the demo's two structures are built, and
 * the scatter is told to keep their ground and their paths clear. An ordinary parcel gets neither,
 * which is not an omission: `scatterLayer` with no options reads its class list off this cell's own
 * biome mask, so a rainforest parcel grows buttress trees and bromeliads and a taiga one grows what
 * taiga calls for, and the only ground it keeps clear is the ground every parcel has to keep clear,
 * the buildable footprint and the spawn clearing. Handing it the demo's stations would sweep five
 * corridors toward a campfire and a cave mouth that are not on this cell and, per DECISIONS.md C15,
 * never will be.
 */

import { canopyClosureLayer } from "./canopyClosure";
import { DEMO_SCATTER } from "./demoStations";
import type { MeasureChain } from "./measure";
import { playerLayer } from "./playerLayer";
import type { WorldLayer } from "./PlanetWorld";
import { scatterLayer } from "./scatterLayer";
import { skyLayer } from "./skyLayer";
import { sliceLayer } from "./sliceLayer";
import { terrainLayer } from "./terrainChunks";
import { walkLayer } from "./walkLayer";
import type { ReactionReading } from "@/components/world/Inspector";

/** What the slice needs from whoever mounted it: somewhere to put its readings and its beats. */
export interface ParcelSliceOptions {
  onReaction?: (reading: ReactionReading) => void;
  onBeat?: (text: string) => void;
}

export interface ParcelWorldOptions {
  /** The page's measurement chain. The walk layer feeds it; the slice, where there is one, emits. */
  chain: MeasureChain;
  /** Present only where the demo's two structures stand. Absent: an ordinary parcel, no stations. */
  slice?: ParcelSliceOptions;
}

/** The name of the only station set there is. A flag naming a SET, not a mood, so a URL is readable. */
export const SLICE_STATIONS_FLAG = "slice";

/**
 * Whether a `stations` flag means a slice, and with what.
 *
 * The branch lives here rather than in the route because a test that writes its own branch is
 * testing its own branch. The route calls this and so does the test, so the decision is one piece
 * of code with one behaviour, and a test that passes is a statement about the list the app builds.
 * This is the same lesson as DEMO_SCATTER, one level up: it was a copy of a SHAPE at two call
 * sites that let the demo lose its station clearings while every test stayed green.
 */
export function sliceOptionsFor(
  stations: string | null | undefined,
  callbacks: ParcelSliceOptions,
): ParcelSliceOptions | undefined {
  return stations === SLICE_STATIONS_FLAG ? callbacks : undefined;
}

export function parcelLayers({ chain, slice }: ParcelWorldOptions): WorldLayer[] {
  const player = playerLayer();
  const playerTile = () => {
    const at = player.position();
    return { x: at.x, y: at.y };
  };

  const layers: WorldLayer[] = [
    skyLayer(),
    terrainLayer(),
    // DEMO_SCATTER is a value, not a shape repeated at each call site, so this line and the test
    // cannot drift apart again. The bare call is what an ordinary parcel ships with.
    slice ? scatterLayer(DEMO_SCATTER) : scatterLayer(),
    canopyClosureLayer(),
    player,
    walkLayer({ chain, playerTile }),
  ];
  if (slice) layers.push(sliceLayer({ chain, playerTile, onReaction: slice.onReaction, onBeat: slice.onBeat }));
  return layers;
}
