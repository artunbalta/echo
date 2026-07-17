"use client";

import Link from "next/link";

/**
 * The demo entry (landing §1c). The trailer, and a quiet door to the live build. Stays last: it is
 * below the waitlist and deliberately does not compete with it.
 *
 * THE VIDEO IS NOT ALLOWED TO COST ANYTHING ON LOAD.
 *  - `preload="none"`     the 9.2MB mp4 is not fetched until someone presses play. Without this the
 *                         browser would pull at least metadata, and Safari happily pulls far more,
 *                         on a section most visitors never scroll to.
 *  - `poster`             a real frame from the trailer itself (30KB), so the section is a picture
 *                         rather than a black rectangle before anyone interacts.
 *  - no autoplay          not "autoplay muted" either. A video that starts itself is the opposite of
 *                         the register this page is written in, and it would fetch the mp4 anyway,
 *                         defeating preload="none".
 *  - `muted` + `playsInline`  it can never make noise unasked, and it will not hijack an iPhone into
 *                         fullscreen if someone does press play.
 *
 * prefers-reduced-motion needs no special case here precisely BECAUSE nothing autoplays: the video
 * is inert until a person deliberately starts it, which is consent, not motion. The one thing that
 * would have needed handling — an autoplaying background loop — is the thing we are not doing.
 */
export default function DemoEntry() {
  return (
    <section id="demo" className="border-t border-parchment/10 bg-ink px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-center font-pixel text-xs uppercase tracking-[0.25em] text-parchment/35">
          Demo
        </p>

        <div className="mx-auto mt-8 overflow-hidden rounded-sm border-2 border-[#2a2340] bg-[#120c19] shadow-[0_8px_0_#0d0812]">
          <video
            controls
            muted
            playsInline
            preload="none"
            poster="/echo-trailer-poster.jpg"
            width={1280}
            height={720}
            className="block aspect-video h-auto w-full bg-[#120c19]"
          >
            <source src="/echo-trailer.mp4" type="video/mp4" />
            {/* Real fallback text, not a shrug: if the element cannot play, the door below still works. */}
            Your browser cannot play this video. The demo itself is still open below.
          </video>
        </div>

        <p className="mx-auto mt-8 max-w-sm text-center font-pixel text-sm leading-relaxed text-parchment/55">
          Part of the world is already walkable. It is rough, and it is not the whole thing, but the
          shore is real and your echo is already watching.
        </p>

        <div className="mt-6 text-center">
          <Link
            href="/play"
            className="inline-flex items-center gap-2 font-pixel text-sm text-parchment/80 underline-offset-4 outline-none transition-colors hover:text-parchment hover:underline focus-visible:text-parchment focus-visible:underline"
          >
            Walk the demo
            <span aria-hidden>›</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
