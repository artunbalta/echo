/**
 * Where the demo is, as a browser types it. Not a spec: the runner's testMatch only picks up
 * *.spec.ts, so this is a shared constant and nothing else.
 *
 * It is a literal rather than an import of `SLICE_HREF`. Playwright compiles these files to CJS,
 * which is why goldens.spec.ts cannot use import.meta either, and @echo/planet is ESM only, so
 * reaching for the app's own constant from here does not survive the transform.
 *
 * A second copy of a URL is exactly the thing that goes stale, so it is PINNED rather than trusted:
 * stations.spec.ts asserts that /demo redirects to this string, and stationSet.test.mts asserts
 * that the app's own SLICE_HREF is this string. Change the parameter or the cell and one of those
 * two fails before anything silently starts driving a bare parcel.
 */
export const SLICE_HREF = "/parcel/847b949ffffffff?stations=slice";

/**
 * A parcel that is not the demo cell: the runner-up from the third demo-cell scan, forest 50%,
 * ocean 44%, beach 6%, so it has real ground and really builds.
 */
export const ORDINARY_CELL = "847db45ffffffff";
