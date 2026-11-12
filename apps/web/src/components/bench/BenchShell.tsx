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
 */
import type { ReactNode } from "react";
import Link from "next/link";

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
  .kn-row { break-inside: avoid; }
}
`;

export function BenchShell({ active, children }: { active: "bench" | "audit"; children: ReactNode }) {
  const tab = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] transition-colors ${on ? "bg-parchment/10 text-parchment" : "text-parchment/60 hover:text-parchment"}`;
  return (
    <div className="kn min-h-[100dvh] bg-ink font-sans text-parchment antialiased">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="kn-noprint sticky top-0 z-40 border-b border-parchment/10 bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-2.5 sm:px-8" aria-label="Twin audit">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/logo.png" alt="" width={28} height={28} draggable={false} className="h-7 w-7 select-none rounded" />
            <span className="font-pixel text-lg font-bold lowercase tracking-wide text-parchment">echo</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/bench" aria-current={active === "bench" ? "page" : undefined} className={tab(active === "bench")}>
              Results
            </Link>
            <Link href="/audit" aria-current={active === "audit" ? "page" : undefined} className={tab(active === "audit")}>
              Audit your twins
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-8">{children}</main>
      <footer className="border-t border-parchment/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-4 py-8 text-[13px] text-parchment/55 sm:px-8">
          <p>
            The twin audit, by ECHO. Method and code:{" "}
            <a className="kn-link" href="https://github.com/artunbalta/echo" rel="noreferrer">
              github.com/artunbalta/echo
            </a>
            , <code className="text-[12px]">research/deeds</code>.
          </p>
          <p className="kn-noprint">
            <a className="kn-link" href="mailto:artun.balta@outlook.com?subject=Twin%20audit">
              artun.balta@outlook.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** A section's small label, its serif title, and what follows. */
export function Section({ id, eyebrow, title, children, wide = false }: { id?: string; eyebrow?: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section id={id} className="border-t border-parchment/10 py-12 sm:py-16">
      {eyebrow ? <p className="mb-3 text-[11px] uppercase tracking-[.22em] text-echo-soft">{eyebrow}</p> : null}
      <h2 className="max-w-3xl font-serif text-[1.7rem] leading-tight tracking-[-.01em] text-parchment sm:text-[2.1rem]">{title}</h2>
      <div className={`mt-5 space-y-4 text-[15px] leading-relaxed text-parchment/75 ${wide ? "" : "max-w-3xl"}`}>{children}</div>
    </section>
  );
}
