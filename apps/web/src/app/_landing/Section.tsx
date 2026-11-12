/**
 * One rhythm for the landing's sections (DECISIONS C96).
 *
 * Each section had its own width, its own padding and its own kind of heading: a pixel caption over
 * the book, a spaced pixel title over the roster, a serif question over the steps. Now every section
 * is a hairline, the same space, and the same three lines hung from the same left edge as the site
 * header's wordmark: a small label, a serif title, one sentence saying what the thing is.
 *
 * Where a section has an object (the book, the roster, the film), the words stand to its left on a
 * wide screen and above it on a narrow one (`SPLIT`).
 */
import type { ReactNode } from "react";

/**
 * A section: the hairline and the vertical space. A link to one (`/#legend`) stops with its hairline
 * on the fixed header's own, 60px down, so the title is never under the header; Lenis reads the same
 * margin for its own anchor scrolling.
 */
export const SECTION = "scroll-mt-[60px] border-t border-parchment/10 bg-ink py-16 sm:py-24";
/** The column every section's content sits in: the site header's own. */
export const WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-8";
/** Words on the left, the object on the right; stacked under `lg`. */
export const SPLIT = "grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_640px] xl:grid-cols-[minmax(0,1fr)_720px] xl:gap-x-16";

export function SectionHead({ eyebrow, title, children, className = "" }: { eyebrow: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={className}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 font-serif text-[clamp(1.85rem,3.2vw,2.6rem)] leading-[1.08] tracking-[-.02em] text-parchment">{title}</h2>
      {children ? <p className="mt-4 max-w-md text-[16px] leading-relaxed text-parchment/65">{children}</p> : null}
    </header>
  );
}
