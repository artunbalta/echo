"use client";

/**
 * The demo entry (landing §1c). The trailer. Stays last: it is below the waitlist and deliberately
 * does not compete with it.
 *
 * The "Walk the demo" link into /play was removed, and a different one has taken its place. What
 * was removed pointed at an older world that competed with the planet at the top of the page for
 * the same click and lost. What is here now points at the demo: the vertical slice, on the one
 * parcel that is allowed a cave and a campfire, and it does not compete with the hero, because the
 * hero puts you on the parcel you POINTED AT and this puts you on the one with something in it.
 *
 * The two doors say different things for that reason. The hero's says "Stand on it", because that
 * is all it does. This one says demo, because this is the only address on the site where there is
 * anything to do, and until DECISIONS.md C15 is answered it is the only one that ever will be.
 *
 * It links /demo rather than the parcel URL, and the redirect there does the rest. /demo is a
 * server route, so the cell id stays in @echo/planet and is never pulled into this bundle, which
 * is a client component in the landing's first payload; and the redirect leaves the reader on the
 * parcel URL, which is the one worth copying out of the address bar.
 *
 * THE VIDEO IS NOT ALLOWED TO COST ANYTHING ON LOAD.
 *  - `preload="none"`     the mp4 is not fetched until someone presses play. Without this the
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
 *
 * AND IT IS NOT ALLOWED TO COST 45 SECONDS ON PLAY EITHER. The trailer shipped as a raw generator
 * export: 1920x1080 at 7.65 Mbit/s for ten seconds — 9.17MB. Nobody watching this page has 7.65
 * Mbit/s to spare on a ten second clip, so the video could not stream in real time: it played a
 * second, stalled, played a second, stalled. Measured end to end on a throttled 1.6 Mbit/s line,
 * watching the 10.05s trailer took 50.0s and stalled 6 times. That is the whole complaint.
 *
 * The export also wrote `moov` AFTER the 9.14MB `mdat`. A player cannot decode a frame until it has
 * read `moov`, so with `moov` last the browser has to round-trip to the tail of the file first —
 * three requests instead of one, and far worse anywhere 206 is not honoured end to end.
 *
 * Both files below are re-encoded to ~1.33 Mbit/s, which fits inside a slow line, and both are
 * `-movflags +faststart` so `moov` sits at byte 32. Same 10.05s clip on the same throttled line now
 * takes ~11s with one stall. Sources ordered cheapest-capable-first:
 *  - `.av1.mp4`   AV1, full 1920x1080, 1.67MB — VMAF 97.1 against the original, i.e. no visible
 *                 loss. Chrome/Edge/Firefox everywhere, Safari 17+ where the hardware decodes AV1.
 *  - `.mp4`       H.264 1280x720, 1.70MB — VMAF 92.7, and the box below renders 764px wide, so 720p
 *                 is still supersampled there. This is the universal floor: anything that cannot do
 *                 AV1 lands here, which is exactly the older hardware that most needs the smaller
 *                 file, so it is pinned to High@L3.1 — x264 at `veryslow` silently used 16 refs and
 *                 produced an L5.0 stream, which is a level much of that old hardware will refuse.
 * Both `type`s carry an explicit `codecs=`, read back out of the files' own `avcC`/`av1C` boxes
 * rather than guessed, so a browser neither claims a source it cannot decode nor skips one it can.
 */
export default function DemoEntry() {
  return (
    <section id="demo" className="border-t border-parchment/10 bg-ink px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-center font-pixel text-xs uppercase tracking-[0.25em] text-parchment/35">
          Demo
        </p>

        <div className="mx-auto mt-8 overflow-hidden rounded-sm border-2 border-[#2a2340] bg-ink-deep shadow-[0_8px_0_#0d0812]">
          <video
            controls
            muted
            playsInline
            preload="none"
            poster="/echo-trailer-poster.jpg"
            width={1280}
            height={720}
            className="block aspect-video h-auto w-full bg-ink-deep"
          >
            <source src="/echo-trailer.av1.mp4" type='video/mp4; codecs="av01.0.08M.08, mp4a.40.2"' />
            <source src="/echo-trailer.mp4" type='video/mp4; codecs="avc1.64001F, mp4a.40.2"' />
            {/* Real fallback text, not a shrug: the planet at the top of the page is the way in. */}
            Your browser cannot play this video. The planet at the top of the page is walkable.
          </video>
        </div>

        <p className="mx-auto mt-8 max-w-sm text-center text-[15px] leading-relaxed text-parchment/55">
          Part of the world is already walkable. It is rough, and it is not the whole thing, but the
          shore is real and your echo is already watching.
        </p>

        <div className="mt-6 flex justify-center">
          <a
            href="/demo"
            className="rounded bg-echo px-4 py-2 font-pixel text-xs text-ink transition-opacity hover:opacity-90"
          >
            Walk the demo
          </a>
        </div>
      </div>
    </section>
  );
}
