/** The four pages worth finding (C89, C90): the landing, the village a newcomer walks into, the evidence, the audit. */
import type { MetadataRoute } from "next";

import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";

const SITE = "https://echovirtualworld.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", OPEN_VILLAGE_PATH, "/bench", "/audit"].map((path) => ({ url: `${SITE}${path}`, changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.7 }));
}
