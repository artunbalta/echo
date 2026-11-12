/**
 * What a crawler may read (C89): the landing, the open village, the evidence and the audit. Not the
 * routes, not the study, not the tools nobody links to, and not a friend's link, whose content is in a
 * fragment a crawler never sees anyway.
 */
import type { MetadataRoute } from "next";

const SITE = "https://echovirtualworld.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/pilot", "/moderation", "/dev/", "/guess", "/you", "/account", "/dashboard"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
