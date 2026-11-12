/**
 * The frame around `/bench` and `/audit` (DECISIONS C90): the two pages that are documents, not worlds.
 *
 * WHY ITS OWN STYLE BLOCK. The global stylesheet locks the body (`height: 100%; overflow: hidden`) for
 * the full-screen world routes. A document must scroll as a document: anchors, the phone's address
 * bar, print, and a reader with no script. So the frame hands the scroll back in CSS, on these
 * routes only, and takes it away again when it unmounts.
 *
 * It also carries the charts' few colours as variables. On screen they sit on ink; on paper they are
 * re-stepped for white (both pairs checked for colour-blind separation), and the page prints as ink
 * on white with its marks kept.
 *
 * One palette (ink, parchment, the echo's violet; a warm step of `danger` for a twin below the
 * crowd), serif for titles, sans for reading. No green.
 *
 * THE HEADER AND THE FOOTER are the site's (`components/site`, C96). The frame had its own: a
 * wordmark and two tabs, with no way to the village or to anything else. The site's header marks
 * which of the two pages this is, and each page keeps one link to the other in its own first screen.
 * Neither prints (`kn-noprint`), so the line that names the method and the code is said once more
 * for paper, at the foot of the page.
 */
import type { ReactNode } from "react";

import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";

const CSS = `
html, body { height: auto; overflow: visible; }
html { scroll-padding-top: 4.5rem; }
.kn {
  --kn-alone: #d6714f;
  --kn-look: #a06cd5;
  --kn-ref: rgba(244, 233, 208, 0.45);
  --kn-grid: rgba(244, 233, 208, 0.09);
  --kn-zero: rgba(244, 233, 208, 0.7);
  --kn-ring: #1c1326;
}
.kn-mark { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.kn a.kn-link { color: #c9b0ea; text-decoration: underline; text-decoration-color: rgba(201, 176, 234, 0.35); text-underline-offset: 3px; }
.kn a.kn-link:hover { color: #f4e9d0; text-decoration-color: rgba(244, 233, 208, 0.6); }
@media print {
  html, body { background: #fff !important; }
  .kn {
    background: #fff !important;
    --kn-alone: #c8603b;
    --kn-look: #7a4fb3;
    --kn-ref: rgba(28, 19, 38, 0.38);
    --kn-grid: rgba(28, 19, 38, 0.12);
    --kn-zero: #1c1326;
    --kn-ring: #fff;
  }
  .kn, .kn * { color: #1c1326 !important; border-color: rgba(28, 19, 38, 0.22) !important; box-shadow: none !important; }
  .kn-surface { background: transparent !important; }
  .kn-noprint { display: none !important; }
  .kn-printonly { display: block !important; }
  .kn-row { break-inside: avoid; }
}
`;

const REPO = (
  <>
    The twin audit, by ECHO. Method and code:{" "}
    <a className="kn-link" href="https://github.com/artunbalta/echo" rel="noreferrer">
      github.com/artunbalta/echo
    </a>
    , <code className="text-[12px]">research/deeds</code>.
  </>
);

export function BenchShell({ children }: { children: ReactNode }) {
  return (
    <div className="kn flex min-h-[100dvh] flex-col bg-ink font-sans text-parchment antialiased">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />
      {/* 60px for the header, which is fixed; on paper there is none. `lang`: these two pages are
          written in English only, and under a Turkish header their small capitals would otherwise be
          capitalised the Turkish way ("TWİN AUDİT"). */}
      <main lang="en" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-[60px] sm:px-8 print:pt-0">
        {children}
        <p className="kn-printonly mt-10 hidden border-t border-parchment/10 pt-6 text-[13px] text-parchment/55">{REPO}</p>
      </main>
      <SiteFooter
        note={
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <p>{REPO}</p>
            <p>
              <a className="kn-link" href="mailto:artun.balta@outlook.com?subject=Twin%20audit">
                artun.balta@outlook.com
              </a>
            </p>
          </div>
        }
      />
    </div>
  );
}

/** A section's small label, its serif title, and what follows. */
export function Section({ id, eyebrow, title, children, wide = false }: { id?: string; eyebrow?: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section id={id} className="border-t border-parchment/10 py-12 sm:py-16">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="max-w-3xl font-serif text-[1.7rem] leading-tight tracking-[-.01em] text-parchment sm:text-[2.1rem]">{title}</h2>
      <div className={`mt-5 space-y-4 text-[15px] leading-relaxed text-parchment/75 ${wide ? "" : "max-w-3xl"}`}>{children}</div>
    </section>
  );
}
