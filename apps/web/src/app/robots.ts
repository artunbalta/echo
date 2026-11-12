/**
 * What a crawler may read (C89): the landing, the open village, the evidence and the audit. Not the
 * routes, not the study, not the tools nobody links to.
 *
 * A FRIEND'S LINK IS NOT DISALLOWED, though it was. The page says `noindex` itself, which is what keeps
 * it out of a search. Disallowing it here as well stopped the fetch that reads a page's title and
 * picture, so the one link this product asks people to send arrived in a chat as a bare address.
 * What the friend is asked is in the fragment, which no fetch ever carries.
 */
import type { MetadataRoute } from "next";

const SITE = "https://echovirtualworld.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/pilot", "/moderation", "/dev/", "/you", "/account", "/dashboard"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
