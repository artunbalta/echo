/**
 * Which way a person is facing the moment they arrive, and how far down the camera looks.
 *
 * WHY THIS EXISTS. Everyone arrived facing the same compass point. `initialMover`'s heading is
 * PI / 2, south, and `initialFollowCamera`'s yaw is PI, which puts the camera north of them looking
 * the same way. On both shipped coastal routes the sea is NORTH, so it was behind the player, and
 * measured by rendering the spawn frame twice and differencing the framebuffer, the sea contributed
 * 0 pixels of 1,024,000 on a parcel that is 45% ocean with its shore 226 m away. The complaint was
 * that you cannot see the sea; the cause was not the water, the fog, the beach rule or the height
 * scale, all of which were measured and cleared. It was that the game pointed you at the trees.
 *
 * WHAT IT DOES. If there is water within sight of the spawn, the body faces it and the camera sits
 * behind the body looking the same way. Where there is none, which is 86.7% of assignable parcels
 * on this planet, nothing changes and the shipped heading stands: turning a landlocked person
 * toward an ocean 7 km away would be worse than pointing them south for no reason.
 *
 * WHY THE PITCH MOVES TOO. The shipped pitch is 0.42 rad, 24.06 degrees down, against a vertical
 * field of view of 50, so the top edge of the frame sits 0.94 degrees above the horizon and the
 * sea can only ever be a strip jammed under it. Measured facing the sea at the shipped pitch on
 * 847b959ffffffff, the sea's 8.98% of the frame lives in rows 38 to 126 of 800. It is IN the
 * picture and it is at the edge of it. So on a coastal spawn the pitch is lowered until the
 * horizon stands a stated margin inside the top of the frame, and never raised: an inland spawn
 * keeps 0.42 exactly.
 *
 * Nothing here is a renderer and nothing here is random. The water search is `nearestWaterFrom` in
 * @echo/planet, next to `isLand` and `spawnPointFor`, because which way the sea is, is a fact about
 * the terrain and the server places people too.
 */

import { nearestWaterFrom, type TangentPatch, type TerrainField, type WaterSighting } from "@echo/planet";

import { FOLLOW_CAMERA, type FollowCameraState } from "./followCamera";

export interface SpawnViewOptions {
  /**
   * How far to look for water, metres.
   *
   * How far a sea can be and still be WORTH TURNING TOWARD, which is not how far the search can
   * reach. Those were the same number and that was the bug.
   *
   * The reasoning was right and the constant contradicted it: the comment said that past the fog's
   * far plane the sea is 92% fog colour and turning a person toward it points them at a grey wall,
   * and then set the search range to the fog's far plane exactly, 420 m, so the boundary case was
   * guaranteed invisible. Measured on five coastal parcels at the default camera, on the GPU: a
   * shore at 391 m puts 0.100% of the frame in sea of which 0.000% differs from the haze behind it
   * by 8 levels of 255, contrast 19; at 411 m it is 114 pixels, all under 4 levels, contrast 25.
   * Nulling the fog on those same frames multiplies the sea by 28x and 205x, so it is the air and
   * nothing else. Rendered at dawn, midday, dusk and midnight the 391 m cell is 0.000% at every
   * hour, so it is not an unlucky sky either.
   *
   * 280 m is where it goes, and it is placed BETWEEN two measurements rather than derived from a
   * formula. The furthest shore measured as clearly visible is the demo's own waterline at 226 m,
   * which fills 6.10% of the spawn frame; the nearest measured as invisible is 391 m at 0.100% with
   * nothing above 8 levels. 280 m keeps every proven case and drops both proven failures, and it
   * sits nearer the proven side on purpose, because the cost of turning someone at haze is worse
   * than the cost of not turning someone toward a sea they could just about have seen.
   *
   * Past it the coastal branch declines to turn anyone, exactly as it already declines for a
   * landlocked parcel. A heading toward something invisible is worse than no heading: it lowers
   * the pitch to make room for a sea that is not there.
   *
   * WHAT THIS COSTS, said plainly: of 5,462 assignable parcels sampled, 273 have water within
   * 420 m, and 16.1% of those have their shore past 300 m. Those are the ones it stops turning.
   *
   * Search cost falls with the range: at 420 m it was 0.13 ms on the beach cell, 0.93 on the demo
   * and 2.81 on the landlocked parcel, where it must search the whole disk before it can say no.
   */
  sightM?: number;
  /** Metres between water samples. Eight is half the width of the narrowest inlet worth turning for. */
  stepM?: number;
  /** The camera's vertical field of view, degrees. Read off the world's own camera, not typed here. */
  fovDegrees: number;
  /**
   * How far below the top edge of the frame the horizon must sit, in degrees, on a coastal spawn.
   *
   * The scene's horizon is the far edge of the water plane, which is flat at sea level, so it is
   * at the eye's own level: zero degrees, give or take the 0.17 the plane's 3.1 km edge subtends.
   * The margin is therefore the whole of the sky in the first frame.
   */
  horizonMarginDeg: number;
}

export interface SpawnView {
  /** Tile-frame heading for the body: atan2(south, east), which is what stepMover integrates. */
  heading: number;
  /** The follow camera's starting state, behind the body and looking the way it faces. */
  camera: FollowCameraState;
  /** Metres from the spawn to the waterline, or null when no sea is in sight. */
  seaDistanceM: number | null;
}

/** The shipped heading, PI / 2, south. Here so the inland case names it rather than repeating it. */
const INLAND_HEADING = Math.PI / 2;

/**
 * Degrees of sky above the horizon in the first frame of a coastal spawn. Nine.
 *
 * SWEPT, RENDERED AND LOOKED AT, on 847b959ffffffff, whose shore is 78 m from its spawn, with the
 * sea's share of the frame measured by rendering the frozen dusk frame twice and differencing the
 * water out of it:
 *
 *   pitch   sky above the horizon   the sea's share   the rows it fills, of 800
 *   0.42     0.94 deg                8.98%             38 to 126
 *   0.36     4.37                    7.78%             97 to 177
 *   0.31     7.24                    6.81%            144 to 218
 *   0.279    9.24                    6.13%            176 to 247
 *   0.24    11.25                    5.47%            207 to 275
 *   0.20    13.54                    4.55%            243 to 305
 *   0.12    18.12                    3.08%            311 to 366
 *
 * The share FALLS as the camera comes up, because a perspective projection spreads the edge of a
 * frame over more pixels per degree than the middle, so the same band of sea is worth more pixels
 * jammed under the top edge than it is sitting in the picture. Pixels alone are therefore the wrong
 * criterion and the frames were rendered and compared.
 *
 * THE CRITERION, stated before the pictures were looked at: there must be at least as much sky
 * above the horizon as there is sea below it, so the sea reads as water under a sky rather than as
 * the top edge of the picture. At this spawn the waterline sits about six degrees below the
 * horizontal, so the margin has to be about six, and nine is the first swept value that clears it
 * with room. At 0.42 the frame is sand, a blue band and 38 rows of sky, and the sea reads as a
 * wall; at 0.12 the lens is level with the person's head and the beach has gone. 0.279 is a beach,
 * a sea and a sky, and it costs 32% of the sea's pixels to get there.
 *
 * It is only ever a CEILING on the pitch, so an inland spawn keeps 0.42 exactly and nothing about
 * the 86.7% of parcels with no sea within 1,600 m moves at all.
 */
export const SPAWN_HORIZON_MARGIN_DEG = 9;

/**
 * The camera yaw that looks the way a body faces.
 *
 * `cameraForward(yaw)` is `(-sin yaw, -cos yaw)` in (east, south) and a heading h faces
 * `(cos h, sin h)`, so the two agree when `yaw = atan2(-cos h, -sin h)`. Check it against the one
 * pair already written down: h = PI / 2 gives yaw = PI, which is what initialFollowCamera ships.
 */
export function yawBehindHeading(heading: number): number {
  return Math.atan2(-Math.cos(heading), -Math.sin(heading));
}

/**
 * How far down the camera may look and still keep the horizon inside the frame.
 *
 * Pure arithmetic on the frame: the top edge is `pitch - fov / 2` below the horizontal, the scene's
 * horizon is at zero, so the horizon is `fov / 2 - pitch` below that edge.
 */
export function pitchForHorizon(fovDegrees: number, horizonMarginDeg: number): number {
  return ((fovDegrees / 2 - horizonMarginDeg) * Math.PI) / 180;
}

/**
 * The first frame, from the terrain. Pure: it evaluates the field and does no drawing.
 *
 * `spawnX` and `spawnY` are metres east and north of the patch origin, which is what
 * `spawnPointFor` returns; the heading comes back in the TILE frame, whose y grows south, so the
 * north component flips exactly once, here.
 */
export function spawnView(
  patch: TangentPatch,
  field: TerrainField,
  seaLevel: number,
  spawnX: number,
  spawnY: number,
  camera: FollowCameraState,
  options: SpawnViewOptions,
): SpawnView {
  const sightM = options.sightM ?? 280;
  const stepM = options.stepM ?? 8;
  const sea: WaterSighting | null = nearestWaterFrom(patch, field, seaLevel, spawnX, spawnY, { rangeM: sightM, stepM });

  if (!sea || sea.distanceM <= 0) {
    return { heading: INLAND_HEADING, camera, seaDistanceM: null };
  }

  const heading = Math.atan2(-(sea.y - spawnY), sea.x - spawnX);
  const pitch = Math.min(camera.pitch, pitchForHorizon(options.fovDegrees, options.horizonMarginDeg));
  return {
    heading,
    // The pitch is clamped to the camera's own range rather than trusted: the range is the
    // player's, and a starting state outside it would be a state a drag can never return to.
    camera: {
      ...camera,
      yaw: yawBehindHeading(heading),
      pitch: Math.min(FOLLOW_CAMERA.pitchMax, Math.max(FOLLOW_CAMERA.pitchMin, pitch)),
    },
    seaDistanceM: sea.distanceM,
  };
}
