"use client";

/**
 * The one footer of every document page (DECISIONS C96): every place on the site, named, in three
 * short lists. The landing's footer was a wordmark and a tagline, so the page ended with nowhere to go.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useLang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { LangToggle, SITE_COPY } from "./SiteHeader";

/** `note`: a page's own last words (the evidence names its code and whom to write to), set above the lists. */
export default function SiteFooter({ note = null }: { note?: ReactNode }) {
  const copy = SITE_COPY[useLang()];
  const path = usePathname();
  const to = (href: string) => (path === "/" && href.startsWith("/#") ? href.slice(1) : href);
  const item = "text-[14px] text-parchment/65 transition-colors hover:text-parchment";
  const head = "mb-3 text-[11px] uppercase tracking-[.18em] text-parchment/40";
  return (
    <footer data-site-footer className="kn-noprint border-t border-parchment/10 bg-ink">
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-8">
        {note ? <div className="mb-10 text-[13px] leading-relaxed text-parchment/55">{note}</div> : null}
        {/* Two lists to a row on a phone: one under another, the three made a footer taller than the
            screen it was at the foot of. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
              <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
            </Link>
            <p className="mt-3 text-[13px] text-parchment/45">{copy.tagline}</p>
          </div>
          <nav aria-label={copy.play}>
            <p className={head}>{copy.play}</p>
            <ul className="space-y-2.5">
              <li><Link href={OPEN_VILLAGE_PATH} className={item}>{copy.walkIn}</Link></li>
              <li><Link href={to("/#top")} className={item}>{copy.land}</Link></li>
              <li><Link href={to("/#demo")} className={item}>{copy.demo}</Link></li>
            </ul>
          </nav>
          <nav aria-label={copy.learn}>
            <p className={head}>{copy.learn}</p>
            <ul className="space-y-2.5">
              <li><Link href={to("/#how")} className={item}>{copy.how}</Link></li>
              <li><Link href={to("/#legend")} className={item}>{copy.story}</Link></li>
              <li><Link href="/bench" className={item}>{copy.evidence}</Link></li>
              <li><Link href="/audit" className={item}>{copy.audit}</Link></li>
            </ul>
          </nav>
          <nav aria-label={copy.you}>
            <p className={head}>{copy.you}</p>
            <ul className="space-y-2.5">
              <li><Link href={to("/#waitlist")} className={item}>{copy.waitlist}</Link></li>
              <li><Link href="/account" className={item}>{copy.data}</Link></li>
              <li className="pt-1"><LangToggle /></li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
