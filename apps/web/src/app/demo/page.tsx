/**
 * /demo, which is no longer a world (task A5).
 *
 * The demo does not live at its own route any more. It is a parcel: the same page, the same host
 * and the same layers as every other parcel, on the one cell that is allowed the cave and the
 * campfire, asked for by name in the URL. Two routes rendering the same world is how the world
 * they render drifts apart, and it already did once.
 *
 * What is left is the redirect, and it is worth keeping rather than deleting outright: /demo is a
 * short, memorable address that is written into other people's notes and browser histories, and it
 * hands anyone who follows it the parcel URL, which is the one that can be shared. The cell id is
 * not repeated here; it comes from the same constant the page parses.
 *
 * TEMPORARY, not permanent, deliberately. `permanentRedirect` answers 308 and browsers cache that
 * for as long as they like, so a mistake in this line survives its own fix on every machine that
 * saw it once. Nothing about this route is hot enough to be worth that.
 */
import { redirect } from "next/navigation";

import { SLICE_HREF } from "@/lib/stationSet";

export default function DemoPage() {
  redirect(SLICE_HREF);
}
