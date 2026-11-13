"use client";

/**
 * The one footer of every document page (DECISIONS C96): every place on the site, named, in three
 * short lists. The landing's footer was a wordmark and a tagline, so the page ended with nowhere to go.
 *
 * It is a shade under the page's colour and has no rule over it (C97): the change of ground is what
 * says the page has ended. Its three headings are words in the site's face, where they were small
 * spaced capitals.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { PREVIEW_SECONDS } from "@/lib/preview";
import { JOIN_HREF, LangToggle, onLanding, SITE_COPY } from "./SiteHeader";

/** `note`: a page's own last words (the evidence names its code and whom to write to), set above the lists. */
export default function SiteFooter({ note = null }: { note?: ReactNode }) {
  const copy = SITE_COPY[useLang()];
  const path = usePathname();
  const to = (href: string) => (onLanding(path) && href.startsWith("/#") ? href.slice(1) : href);
  const item = "text-[14.5px] text-parchment/70 transition-colors hover:text-parchment";
  const head = "mb-3.5 text-[13px] font-medium text-parchment/45";
  return (
    <footer data-site-footer className="kn-noprint bg-ink-deep">
      <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
        {note ? <div className="mb-10 text-[13px] leading-relaxed text-parchment/55">{note}</div> : null}
        {/* Two lists to a row on a phone: one under another, the three made a footer taller than the
            screen it was at the foot of. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
              <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
            </Link>
            <p className="mt-3 text-[14px] text-parchment/50">{copy.tagline}</p>
          </div>
          <nav aria-label={copy.echo}>
            <p className={head}>{copy.echo}</p>
            <ul className="space-y-2.5">
              <li><Link href={to(JOIN_HREF)} className={item}>{copy.join}</Link></li>
              <li><Link href={to("/#character")} className={item}>{copy.character}</Link></li>
              <li><Link href={OPEN_VILLAGE_PATH} className={item}>{copy.peek(PREVIEW_SECONDS)}</Link></li>
            </ul>
          </nav>
          <nav aria-label={copy.learn}>
            <p className={head}>{copy.learn}</p>
            <ul className="space-y-2.5">
              <li><Link href={to("/#how")} className={item}>{copy.how}</Link></li>
              <li><Link href="/bench" className={item}>{copy.evidence}</Link></li>
              <li><Link href="/audit" className={item}>{copy.audit}</Link></li>
              <li><Link href="/story" className={item}>{copy.story}</Link></li>
            </ul>
          </nav>
          <nav aria-label={copy.you}>
            <p className={head}>{copy.you}</p>
            <ul className="space-y-2.5">
              <li><Link href="/account" className={item}>{copy.data}</Link></li>
              <li className="pt-1"><LangToggle /></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
