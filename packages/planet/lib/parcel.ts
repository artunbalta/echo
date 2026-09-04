/**
 * What every parcel is built with (plan §4, lifted out of demo-cell.ts once /parcel ran the same
 * world as /demo).
 *
 * Both of these were written when the demo cell was the only ground anyone walked, and they were
 * named for it for that reason alone. Neither says anything about a cell. `k` is how wide a disk
 * the scene builder is asked for, which is a question about draw distance and build cost; the
 * falloff is four distances tuned against the fog, and `spawnFalloff` is a pure function of the
 * distance from a spawn, which every route has. /parcel/[cell] runs the same host and the same
 * layers as /demo, so it takes both, and a constant whose name says DEMO while the general path
 * depends on it is how a second copy gets written by someone who believed the name.
 *
 * What is genuinely about one cell, the cell id itself, its composition, its biomes, its transect
 * and the numbers measured on it, stayed in demo-cell.ts.
 */

/**
 * The disk a parcel builds: the cell and its six neighbours.
 *
 * One cell is not enough. The spawn sits at the cell centre and `regionBound` measures 784 m for
 * k=0 against 2,084 m for k=1, so a bare cell ends the ground well inside the distance a headland
 * is still worth looking at. The ring costs six more chunks and buys a world that ends in fog
 * rather than in nothing.
 */
export const PARCEL_REGION_K = 1;

/**
 * How the scatter thins with distance from the spawn (plan B4d).
 *
 * `densityPerKm2` in the registry is the NEAR FIELD density, what a rainforest floor really looks
 * like within sight. This is what keeps that affordable: full density out to `fullM`, decaying to
 * `farFactor` by `farM`, and nothing at all past `cutoffM`, which sits just beyond the fog because
 * what is never seen is never worth placing.
 *
 * Measured on DEMO_CELL with these numbers: 5,995 instances within 120 m (13.25 per 100 m2, 12
 * classes), 43,108 over the whole disk against a ceiling of 120,000, 79 draw calls of 120, and
 * 252,538 triangles in view of 600,000 once each class uses its own LOD band.
 */
export const SCATTER_FALLOFF = { fullM: 150, farM: 700, farFactor: 0.06, cutoffM: 500 } as const;
