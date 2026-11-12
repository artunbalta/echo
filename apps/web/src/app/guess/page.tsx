/**
 * The friend's page (DECISIONS C89): someone sent a link; whoever opens it guesses what that person did
 * at a handful of the village's moments, and then sees how they did beside the person's echo.
 *
 * Everything the page shows was carried in the address's fragment (`lib/knowable/guessLink.ts`), which
 * no server receives, so this page is the same for every request and keeps nothing.
 */
import type { Metadata } from "next";

import GuessClient from "@/components/guess/GuessClient";
import SitePage from "@/components/site/SitePage";

export const metadata: Metadata = {
  title: "Who knows them best? · echo.",
  description: "A friend walked through a village where small things happen. Guess what they did, and see whether you know them better than their echo does.",
  openGraph: {
    title: "Who knows them best?",
    description: "Guess what your friend did, and see whether you know them better than their echo does.",
    type: "website",
  },
  robots: { index: false },
};

export default function Guess() {
  // The site's header and footer (C96): a friend who arrives by a link can see where they are, change
  // the language, and go on to the village or anywhere else. The page had a wordmark and nothing more.
  return (
    <SitePage>
      <GuessClient />
    </SitePage>
  );
}
