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
 *   settlement third, where the cell has a village (DECISIONS C41). It draws what PlanetWorld planned
 *     at construction, and it goes BEFORE the scatter so that nothing about it can depend on the
 *     scatter: the dependency runs the other way, the scatter keeping the village's ground clear.
 *   scatter fourth, told about the village's clearings and lanes by the same plan.
 *   canopy-closure fourth, and it can be nowhere else: it darkens the ground the terrain layer
 *     uploaded by the crowns the scatter layer placed, so it is the one layer that needs BOTH of
 *     them already built. DECISIONS C17. It reaches for them by name and complains if either is
 *     missing rather than silently shipping a floor with the open sky's light on it.
 *   player after the scatter, and this one is load-bearing rather than tidy: `playerLayer.build`
 *     looks the scatter up by name and takes its collider index, so a player built ahead of it
 *     walks through every trunk on the parcel.
 *   villagers after the player, where the cell has a village (C41): the nameplate is for whoever is
 *     nearest the player, and the position it asks for is the one the mover committed this frame.
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

import { detailLayer } from "./detailLayer";
import { meadowLayer } from "./meadowLayer";
import { canopyClosureLayer } from "./canopyClosure";
import { DEMO_SCATTER } from "./demoStations";
import type { MeasureChain } from "./measure";
import { playerLayer } from "./playerLayer";
import type { LayerContext, WorldLayer } from "./PlanetWorld";
import { scatterLayer, type StationExclusions } from "./scatterLayer";
import { settlementLayer } from "./settlementLayer";
import { villagersLayer } from "./villagersLayer";
import { skyLayer } from "./skyLayer";
import { sliceLayer } from "./sliceLayer";
import { terrainLayer } from "./terrainChunks";
import { walkLayer } from "./walkLayer";
import { interactLayer } from "./interactLayer";
import { interiorLayer } from "./interiorLayer";
import { soundLayer } from "./soundLayer";
import { marketLayer } from "./marketLayer";
import { homeLayer } from "./homeLayer";
import { directorLayer } from "./directorLayer";
import { animalsLayer } from "./animalsLayer";
import { weatherLayer } from "./weatherLayer";
import type { TouchControlHandle } from "./touchInput";
import type { ReactionReading } from "@/components/world/Inspector";
import { WORLD_EPOCH, worldClock, type WorldClock } from "@echo/planet";

/**
 * The one clock every mount of this world reads (DECISIONS C24).
 *
 * NO FETCH, AND THAT IS THE POINT. The epoch is a constant of the world in the same way the seed
 * is, so the client derives the hour from `WORLD_EPOCH` directly and the registry writes the SAME
 * value into `world_manifest.created_at` when it is seeded. `/api/planet/world` reports it so a
 * disagreement between the two is visible rather than silent; nothing on the render path waits for
 * it, because an hour that arrives one round-trip late is an hour two people did not share.
 *
 * This replaces `skyLayer({ timeOfDay: 0.38 })`. `0.38` was never a decision — it was a screenshot
 * of 09:07 pinned into a constructor, and every mount of every parcel started its own morning there.
 */
const WORLD_CLOCK = worldClock(WORLD_EPOCH);

/** What the slice needs from whoever mounted it: somewhere to put its readings and its beats. */
export interface ParcelSliceOptions {
  onReaction?: (reading: ReactionReading) => void;
  onBeat?: (text: string) => void;
}

export interface ParcelWorldOptions {
  /** The page's measurement chain. The walk layer feeds it; the slice, where there is one, emits. */
  chain: MeasureChain;
  /** Landing previews render the same world with movement disabled. */
  inputEnabled?: boolean;
  /**
   * The phone's thumbstick and jump button (DECISIONS C23), where the mount has drawn them. It
   * rides here for the same reason `inputEnabled` does: this is the one place the world is
   * composed, so a mount states what it has once and the list hands it to the layer that wants it.
   * A landing preview passes none, which is correct — a passive preview has nothing to drive.
   */
  touch?: TouchControlHandle;
  /** Present only where the demo's two structures stand. Absent: an ordinary parcel, no stations. */
  slice?: ParcelSliceOptions;
  /**
   * The world's clock (DECISIONS C24). Defaults to the planet's own epoch, which is what every
   * mount should use; a test passes its own to hold an hour still.
   */
  clock?: WorldClock;
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

/**
 * The ground a village needs kept bare: its green, its houses, its fields and graveyard, and the
 * lanes between them. A parcel with no village gets an empty record, which leaves the scatter's own
 * floor (the buildable footprint and the spawn clearing) exactly as it was.
 */
export function villageStations(ctx: LayerContext): StationExclusions {
  const plan = ctx.region.village?.plan;
  if (!plan) return {};
  return {
    clearings: plan.clearings,
    paths: plan.paths.map(([a, b]) => ({ a: [a.x, a.y] as const, b: [b.x, b.y] as const, widthM: 2.4 })),
  };
}

/** Shared geography and art for landing previews and playable parcels. */
export function parcelEnvironmentLayers({ slice, inputEnabled = true, touch, clock = WORLD_CLOCK }: Pick<ParcelWorldOptions, "slice" | "inputEnabled" | "touch" | "clock"> = {}): WorldLayer[] {
  return [
    skyLayer({ clock }),
    terrainLayer(),
    settlementLayer({ clock }),
    slice ? scatterLayer(DEMO_SCATTER) : scatterLayer({ stations: villageStations }),
    canopyClosureLayer(),
    detailLayer(),
    playerLayer({ inputEnabled, touch }),
    villagersLayer({ clock }),
    // Goats, hens, dogs, birds and fish (C55): after the villagers, whose people the dogs keep to.
    animalsLayer({ clock }),
    // The market stall on the green, on market day (C58).
    marketLayer({ clock }),
    meadowLayer(),
    // The weather over all of it (C48): last, so it leans on a sky every other layer has already read.
    weatherLayer({ clock }),
  ];
}

export function parcelLayers({ chain, slice, inputEnabled = true, touch, clock = WORLD_CLOCK }: ParcelWorldOptions): WorldLayer[] {
  const layers = parcelEnvironmentLayers({ slice, inputEnabled, touch, clock });
  const player = layers.find(layer => layer.name === "player") as ReturnType<typeof playerLayer>;
  const playerTile = () => { const at = player.position(); return { x: at.x, y: at.y }; };
  layers.push(walkLayer({ chain, playerTile }));
  // Everything within reach, and the marks acts have left (C45). Last, so it reads every layer above.
  layers.push(interactLayer({ clock }));
  // Inside a house (C54): after the marks, whose forced doors it opens.
  layers.push(interiorLayer({ clock }));
  // Your own house on your own land (C59): after the interact layer, which asks it what is near.
  layers.push(homeLayer());
  // What the director set out for this stranger (C63): asked of by the interact layer, like the house.
  layers.push(directorLayer());
  // The sound of the place (C56): last, so it hears the frame every layer above has settled; only
  // where someone is playing — a landing preview is silent.
  layers.push(soundLayer({ clock }));
  if (slice) layers.push(sliceLayer({ chain, playerTile, onReaction: slice.onReaction, onBeat: slice.onBeat }));
  return layers;
}
