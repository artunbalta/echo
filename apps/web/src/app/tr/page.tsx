/**
 * The landing, in Turkish (DECISIONS C97): the same page (`_landing/Landing.tsx`), built in Turkish
 * so that its first paint is. It is what a Turkish reader is handed at `/` (`middleware.ts`), and an
 * address of its own for a link meant to be read in Turkish.
 */
import type { Metadata } from "next";

import { ServedLang } from "@/lib/servedLang";
import Landing from "../_landing/Landing";

const title = "ECHO. Yaptıklarından seni öğrenen, sonra senin gibi davranan bir agent.";
const description = "ECHO, tarayıcında gezdiğin küçük bir köy. Orada ne söylediğine değil, ne yaptığına bakar. Köy sırayla açılıyor: sıraya gir.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tr", languages: { en: "/", tr: "/tr", "x-default": "/" } },
  openGraph: { title, description, type: "website", locale: "tr_TR", url: "/tr" },
  twitter: { card: "summary_large_image", title, description },
};

/** Said before the page's own script runs, for a screen reader's voice: the root layout says `en`. */
const LANG = "document.documentElement.lang='tr'";

export default function Page() {
  return (
    <ServedLang lang="tr">
      <script dangerouslySetInnerHTML={{ __html: LANG }} />
      <Landing />
    </ServedLang>
  );
}
