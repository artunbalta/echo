/**
 * Compile the routes the suite drives, once, before any worker opens a browser.
 *
 * `next dev` compiles a route the first time it is asked for. Measured at this app's own cold start:
 * `✓ Compiled / in 3.7s (790 modules)` then `GET / 200 in 3907ms`, and
 * `✓ Compiled /parcel/[cell] in 559ms (933 modules)` then `GET /parcel/8482589ffffffff 200 in
 * 1316ms` — of which the world itself is `[planet] built echo-capacity-1 in 0.2s`. Small numbers,
 * and they are charged to whichever spec happens to run first, which is already reason enough not to
 * leave them inside a spec's measurement. But they do not STAY small: the same compiler took 27.6 s
 * on `/demo` and 184.1 s on `/api/telemetry` when it landed mid-suite under six workers. Paying them
 * here, before the workers exist, is the only place they are cheap.
 *
 * IT IS A PLAIN FETCH, NOT A BROWSER: this warms the SERVER. The scene the browser then builds is
 * 1.4–3.8 s measured and cannot be warmed from here — and nothing needs it to be.
 *
 * The list is every route the specs navigate to. `/` (smoke, globePick), `/demo` (stations, and it
 * compiles separately from the parcel it redirects to), `/dev/goldens` (goldens), and the two parcel
 * URLs, which share one `/parcel/[cell]` route entry so the other cells cost nothing.
 *
 * IT NEVER THROWS. A route that will not answer is the specs' business to report, in their own
 * words; failing here would replace fourteen readable failures with one unreadable one.
 */
import type { FullConfig } from "@playwright/test";

const ROUTES = [
  "/",
  "/demo",
  "/dev/goldens",
  "/parcel/8482589ffffffff",
  "/parcel/847b949ffffffff?stations=slice",
];

export default async function globalSetup(_config: FullConfig) {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  for (const route of ROUTES) {
    const began = Date.now();
    let last = "";
    // The webServer starts before this runs, but `reuseExistingServer` means it may also have just
    // started and not yet be listening, so this waits rather than assuming.
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const res = await fetch(base + route, { redirect: "follow" });
        await res.arrayBuffer();
        console.log(`[warm] ${route} ${res.status} in ${Date.now() - began}ms`);
        last = "";
        break;
      } catch (err) {
        last = (err as Error).message;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (last) console.log(`[warm] ${route} never answered (${Date.now() - began}ms): ${last}`);
  }
}
