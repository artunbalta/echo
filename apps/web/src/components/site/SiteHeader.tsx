"use client";

/**
 * The one header of every page that is a document and not a world (DECISIONS C96): the landing, the
 * evidence, the audit, a friend's link, your data.
 *
 * WHY ONE. Each of those pages had grown its own: the landing's was in the pixel face and went to
 * three places on that page; the evidence had two tabs and no way to the village; a friend's link had
 * a wordmark; `/account` had nothing. So nobody could get from one to another without knowing an
 * address. Now the same six places are on every page, in the same order, and the way in is the one
 * filled button.
 *
 * It reads the language from `lib/lang` and carries its own few words, so a page that uses it does not
 * pull the app's whole table of strings into its bundle (the landing's 205 kB is held by a test).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { LANG_NAME, LANGS, setLang, useLang, type Lang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";
import { step } from "@/lib/steps";

export const SITE_COPY: Record<Lang, { how: string; story: string; evidence: string; audit: string; waitlist: string; walkIn: string; menu: string; close: string; data: string; demo: string; land: string; tagline: string; play: string; learn: string; you: string; language: string }> = {
  en: {
    how: "How it works",
    story: "The story",
    evidence: "Evidence",
    audit: "Twin audit",
    waitlist: "Waitlist",
    walkIn: "Walk in",
    menu: "Menu",
    close: "Close",
    data: "Your data",
    demo: "Watch the demo",
    land: "Pick your own land",
    tagline: "A country that does not exist.",
    play: "Play",
    learn: "Learn",
    you: "You",
    language: "Language",
  },
  tr: {
    how: "Nasıl çalışır",
    story: "Hikâye",
    evidence: "Kanıt",
    audit: "İkiz denetimi",
    waitlist: "Bekleme listesi",
    walkIn: "İçeri gir",
    menu: "Menü",
    close: "Kapat",
    data: "Verilerin",
    demo: "Demoyu izle",
    land: "Kendi toprağını seç",
    tagline: "Var olmayan bir ülke.",
    play: "Oyna",
    learn: "Öğren",
    you: "Sen",
    language: "Dil",
  },
};

/** The places, in the order every page lists them. */
export const SITE_LINKS = [
  { key: "how", href: "/#how" },
  { key: "story", href: "/#legend" },
  { key: "evidence", href: "/bench" },
  { key: "audit", href: "/audit" },
  { key: "waitlist", href: "/#waitlist" },
] as const;

export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <span data-site-lang className={`inline-flex overflow-hidden rounded-full border border-parchment/15 text-[11px] ${className}`}>
      {LANGS.map((l) => (
        <button key={l} type="button" data-lang={l} aria-pressed={lang === l} title={LANG_NAME[l]} onClick={() => setLang(l)} className={`px-2.5 py-1 uppercase tracking-wide transition-colors ${lang === l ? "bg-parchment text-ink" : "text-parchment/60 hover:text-parchment"}`}>
          {l}
        </button>
      ))}
    </span>
  );
}

/**
 * `over`: the page opens on a picture the header should sit on (the landing's planet), so it is clear
 * until the page has scrolled. Everywhere else it is solid from the start.
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
  const to = (href: string) => (path === "/" && href.startsWith("/#") ? href.slice(1) : href);

  return (
    <header data-site-header className={`kn-noprint fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "border-b border-parchment/10 bg-ink/90 backdrop-blur" : "border-b border-transparent"}`}>
      <nav aria-label="echo" className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="echo">
          <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
          <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.key} href={to(l.href)} aria-current={here(l.href) ? "page" : undefined} className={`text-[14px] transition-colors ${here(l.href) ? "text-parchment underline decoration-echo decoration-2 underline-offset-[10px]" : "text-parchment/65 hover:text-parchment"}`}>
              {copy[l.key]}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <LangToggle className="hidden lg:inline-flex" />
          {/* Over the landing's hero the filled button is the hero's own, a hand's width below; two of
              them on one screen is two main actions. So this one is outlined until the page moves. */}
          <Link href={OPEN_VILLAGE_PATH} data-site-walk-in onClick={() => step("walk_in")} className={`btn btn-sm ${solid ? "btn-primary" : "btn-ghost"}`}>
            {copy.walkIn}
          </Link>
          <button type="button" data-site-menu aria-label={open ? copy.close : copy.menu} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-full border border-parchment/15 text-parchment/80 hover:text-parchment lg:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /> : <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />}
            </svg>
          </button>
        </div>
      </nav>

      {open ? (
        <div data-site-menu-open className="border-t border-parchment/10 bg-ink px-4 pb-5 pt-2 lg:hidden">
          <ul>
            {SITE_LINKS.map((l) => (
              <li key={l.key}>
                <Link href={to(l.href)} onClick={() => setOpen(false)} aria-current={here(l.href) ? "page" : undefined} className={`flex h-12 items-center border-b border-parchment/[0.07] text-[16px] ${here(l.href) ? "text-parchment" : "text-parchment/75"}`}>
                  {copy[l.key]}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/account" onClick={() => setOpen(false)} className="flex h-12 items-center border-b border-parchment/[0.07] text-[16px] text-parchment/75">
                {copy.data}
              </Link>
            </li>
          </ul>
          <div className="mt-4 flex items-center justify-between text-[13px] text-parchment/55">
            <span>{copy.language}</span>
            <LangToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}
