"use client";

/**
 * The one header of every page that is a document and not a world (DECISIONS C96): the landing, the
 * evidence, the audit, a friend's link, your data.
 *
 * WHY ONE. Each of those pages had grown its own: the landing's was in the pixel face and went to
 * three places on that page; the evidence had two tabs and no way to the village; a friend's link had
 * a wordmark; `/account` had nothing. So nobody could get from one to another without knowing an
 * address. Now the same places are on every page, in the same order, and the one filled button is the
 * page's main action.
 *
 * THAT ACTION IS THE WAITLIST (C97). The village opens in turns, so the button that said "Walk in"
 * says "Join the waitlist" and leads to the form at the head of the landing. The row is three places
 * where it was five: how it works, the evidence, the story. The twin audit and your data are in the
 * footer, which lists everything. And there is no hairline under the header: once the page has moved
 * it is a shade of the page's own colour, and that is enough to tell them apart. With a phone's sheet
 * open it is that shade with nothing showing through, and at once, not eased in: the page's own words
 * behind a list of places were two things to read at once, for as long as the easing took.
 *
 * It reads the language from `lib/lang` and carries its own few words, so a page that uses it does not
 * pull the app's whole table of strings into its bundle (the landing's 205 kB is held by a test).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LANG_NAME, LANGS, setLang, useLang, type Lang } from "@/lib/lang";

export const SITE_COPY: Record<Lang, { how: string; story: string; evidence: string; audit: string; join: string; peek: (seconds: number) => string; character: string; menu: string; close: string; data: string; tagline: string; echo: string; learn: string; you: string; language: string }> = {
  en: {
    how: "How it works",
    story: "The story",
    evidence: "Evidence",
    audit: "Twin audit",
    join: "Join the waitlist",
    peek: (seconds) => `A ${seconds}-second look`,
    character: "Choose your character",
    menu: "Menu",
    close: "Close",
    data: "Your data",
    tagline: "A country that does not exist.",
    echo: "ECHO",
    learn: "Learn",
    you: "You",
    language: "Language",
  },
  tr: {
    how: "Nasıl çalışır",
    story: "Hikâye",
    evidence: "Kanıt",
    audit: "İkiz denetimi",
    join: "Sıraya gir",
    peek: (seconds) => `${seconds} saniye göz at`,
    character: "Karakterini seç",
    menu: "Menü",
    close: "Kapat",
    data: "Verilerin",
    tagline: "Var olmayan bir ülke.",
    echo: "ECHO",
    learn: "Öğren",
    you: "Sen",
    language: "Dil",
  },
};

/** The places in the header's row, in the order every page lists them. The footer lists these and the rest. */
export const SITE_LINKS = [
  { key: "how", href: "/#how" },
  { key: "evidence", href: "/bench" },
  { key: "story", href: "/story" },
] as const;

/** Whether an address is the landing: `/`, or the Turkish build of it (`app/tr`), where an in-page place is an anchor. */
export const onLanding = (path: string | null): boolean => path === "/" || path === "/tr";

/** Where the one filled button leads: the form at the head of the landing. */
export const JOIN_HREF = "/#waitlist";

/** What a phone's sheet lists after the row's three: the two places a wide screen finds in the footer. */
const MORE_LINKS = [
  { key: "audit", href: "/audit" },
  { key: "data", href: "/account" },
] as const;

export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <span data-site-lang className={`inline-flex overflow-hidden rounded-full bg-parchment/[0.08] p-0.5 text-[12px] ${className}`}>
      {LANGS.map((l) => (
        <button key={l} type="button" data-lang={l} aria-pressed={lang === l} title={LANG_NAME[l]} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-1 font-medium uppercase transition-colors ${lang === l ? "bg-parchment text-ink" : "text-parchment/60 hover:text-parchment"}`}>
          {l}
        </button>
      ))}
    </span>
  );
}

/**
 * `over`: the page opens on its own first screen and the header should sit on it (the landing's hero),
 * so it is clear until the page has scrolled. Everywhere else it is solid from the start.
 */
export default function SiteHeader({ over = false }: { over?: boolean }) {
  const copy = SITE_COPY[useLang()];
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!over) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [over]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const solid = !over || scrolled || open;
  const here = (href: string) => !href.includes("#") && path === href;
  // On the landing itself an in-page place is an anchor, so the page scrolls to it and does not reload.
  const to = (href: string) => (onLanding(path) && href.startsWith("/#") ? href.slice(1) : href);

  return (
    <header data-site-header className={`kn-noprint fixed inset-x-0 top-0 z-50 ${open ? "bg-ink-deep" : `transition-colors duration-300 ${solid ? "bg-ink-deep/85 backdrop-blur-md" : ""}`}`}>
      <nav aria-label="echo" className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="echo">
          <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
          <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.key} href={to(l.href)} aria-current={here(l.href) ? "page" : undefined} className={`text-[14.5px] transition-colors ${here(l.href) ? "font-medium text-parchment" : "text-parchment/70 hover:text-parchment"}`}>
              {copy[l.key]}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <LangToggle className="hidden md:inline-flex" />
          {/* Over the landing's hero the filled button is the form's own, a hand's width below; two of
              them on one screen is two main actions. So this one is outlined until the page moves. */}
          <Link href={to(JOIN_HREF)} data-site-join onClick={() => window.dispatchEvent(new Event("echo:join"))} className={`btn btn-sm ${solid ? "btn-primary" : "btn-ghost"}`}>
            {copy.join}
          </Link>
          <button type="button" data-site-menu aria-label={open ? copy.close : copy.menu} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-full bg-parchment/[0.08] text-parchment/85 hover:text-parchment md:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /> : <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />}
            </svg>
          </button>
        </div>
      </nav>

      {open ? (
        <div data-site-menu-open className="px-5 pb-6 pt-1 md:hidden">
          <ul>
            {SITE_LINKS.map((l) => (
              <li key={l.key}>
                <Link href={to(l.href)} onClick={() => setOpen(false)} aria-current={here(l.href) ? "page" : undefined} className={`flex h-12 items-center text-[17px] ${here(l.href) ? "font-medium text-parchment" : "text-parchment/80"}`}>
                  {copy[l.key]}
                </Link>
              </li>
            ))}
            {MORE_LINKS.map((l) => (
              <li key={l.key}>
                <Link href={l.href} onClick={() => setOpen(false)} aria-current={here(l.href) ? "page" : undefined} className={`flex h-12 items-center text-[17px] ${here(l.href) ? "font-medium text-parchment" : "text-parchment/80"}`}>
                  {copy[l.key]}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between text-[14px] text-parchment/60">
            <span>{copy.language}</span>
            <LangToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}
