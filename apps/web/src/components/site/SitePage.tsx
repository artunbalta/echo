/**
 * The frame of a page that is a document (DECISIONS C96): the site's header, the page, the site's
 * footer, and the scroll handed back.
 *
 * WHY THE STYLE BLOCK. The global stylesheet locks the body (`height: 100%; overflow: hidden`) for the
 * full-screen world routes. A document must scroll as a document: the phone's address bar, anchors, a
 * reader with no script. So the frame hands the scroll back in CSS for as long as it is mounted, as
 * the evidence's own frame does (`components/bench/BenchShell.tsx`), and the header being 60px tall
 * is said once, here.
 *
 * It imports nothing heavy (the header reads the language from `lib/lang` and carries its own few
 * words), so a friend's link stays the small page a test holds it to.
 */
import type { ReactNode } from "react";

import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

const CSS = `
html, body { height: auto; overflow: visible; }
html { scroll-padding-top: 4.5rem; }
`;

export default function SitePage({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink font-sans text-parchment antialiased">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />
      <main className="flex-1 pt-[60px]">{children}</main>
      <SiteFooter note={note} />
    </div>
  );
}
