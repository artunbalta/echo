/**
 * The story (DECISIONS C97): the legend the villagers tell, as a book of eight pages.
 *
 * It was a section in the middle of the landing. It is a page now, in the site's frame, so the landing
 * is what ECHO is and how to join, and the story is one link from anywhere.
 */
import type { Metadata } from "next";

import SitePage from "@/components/site/SitePage";
import LegendBook from "../_landing/LegendBook";

export const metadata: Metadata = {
  title: "The story · echo",
  description: "A country that does not exist: the short legend its villagers tell, in eight pages.",
  alternates: { canonical: "/story" },
};

export default function Story() {
  return (
    <SitePage>
      <LegendBook />
    </SitePage>
  );
}
