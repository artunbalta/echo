/**
 * One rhythm for the landing's sections (DECISIONS C96, C97).
 *
 * Every section is the same space and the same two lines hung from the same left edge as the site
 * header's wordmark: a title, and one sentence saying what the thing is. Space sets one section apart
 * from the next. There was a hairline over each and a small spaced label over each title (C96); both
 * went in C97: a page ruled every screenful reads as a form, and a label that repeats the title in
 * capitals says nothing the title does not.
 *
 * Where a section has an object (the roster, the book), the words stand to its left on a wide screen
 * and above it on a narrow one (`SPLIT`).
 */
import type { ReactNode } from "react";

/**
 * A section: the vertical space. A link to one (`/#how`) stops with its top on the fixed header's own
 * foot, 60px down, so the title is never under the header.
 */
export const SECTION = "scroll-mt-[60px] bg-ink py-20 sm:py-28";
/** The column every section's content sits in: the site header's own. */
export const WRAP = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
/** Words on the left, the object on the right; stacked under `lg`. */
export const SPLIT = "grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_640px] xl:grid-cols-[minmax(0,1fr)_720px] xl:gap-x-16";

/** `as`: the title's level. A section of the landing is an `h2`; a page that is one section (the story) says `h1`. */
export function SectionHead({ title, children, className = "", as: Title = "h2" }: { title: ReactNode; children?: ReactNode; className?: string; as?: "h1" | "h2" }) {
  return (
    <header className={className}>
      <Title className="text-balance text-[clamp(1.75rem,3vw,2.4rem)] font-semibold leading-[1.1] tracking-[-.025em] text-parchment">{title}</Title>
      {children ? <p className="mt-4 max-w-md text-[16.5px] leading-relaxed text-parchment/70">{children}</p> : null}
    </header>
  );
}
