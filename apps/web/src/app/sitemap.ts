/** The pages worth finding (C89, C90, C97): the landing in each language, the story, the evidence, the audit. The village is a ten-second look now, which is not a page to be found by. */
import type { MetadataRoute } from "next";

const SITE = "https://echovirtualworld.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/tr", "/story", "/bench", "/audit"].map((path) => ({ url: `${SITE}${path}`, changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.7 }));
}
