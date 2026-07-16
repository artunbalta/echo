"use client";

import Link from "next/link";

/**
 * The demo entry (landing §1c). A quiet door to the live build, below the waitlist and deliberately
 * not competing with it.
 *
 * Labelled honestly as a demo, because it is one: /play is the real world but it is unfinished, and
 * calling it anything else would be the first dishonest thing on the page. It is a text link with a
 * chevron, not a button — the waitlist owns the only real call to action in this section, and a
 * second solid button here would split it.
 */
export default function DemoEntry() {
  return (
    <section id="demo" className="border-t border-parchment/10 bg-ink px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-md text-center">
        <p className="font-pixel text-xs uppercase tracking-[0.25em] text-parchment/35">Demo</p>
        <p className="mx-auto mt-4 max-w-sm font-pixel text-sm leading-relaxed text-parchment/55">
          Part of the world is already walkable. It is rough, and it is not the whole thing, but the
          shore is real and your echo is already watching.
        </p>
        <Link
          href="/play"
          className="mt-6 inline-flex items-center gap-2 font-pixel text-sm text-parchment/80 underline-offset-4 outline-none transition-colors hover:text-parchment hover:underline focus-visible:text-parchment focus-visible:underline"
        >
          Walk the demo
          <span aria-hidden>›</span>
        </Link>
      </div>
    </section>
  );
}
