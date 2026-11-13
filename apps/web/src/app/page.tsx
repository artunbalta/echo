/**
 * The landing, in English (DECISIONS C97). The page itself is `_landing/Landing.tsx`; this is the
 * address, and what a link to it says. A reader whose browser reads Turkish is handed `app/tr` under
 * this same address (`middleware.ts`).
 */
import type { Metadata } from "next";

import Landing from "./_landing/Landing";

export const metadata: Metadata = {
  alternates: { canonical: "/", languages: { en: "/", tr: "/tr", "x-default": "/" } },
};

export default function Page() {
  return <Landing />;
}
