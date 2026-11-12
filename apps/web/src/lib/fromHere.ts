/**
 * "Was this request written by our own page, as JSON?" (DECISIONS C91–C93, after review.)
 *
 * WHY. The envelopes' routes take no identity on purpose, so nothing stood between them and a form on
 * somebody else's site: a page anywhere could make each of its visitors post to `/api/twin` as
 * `text/plain`, and every one of them would spend a paid model call under their own five an hour. A
 * browser sends a cross-site request without asking only if it is a "simple" one; a JSON content type
 * is not, and a site that is not ours gets no permission to send it. So the rule is two checks a
 * browser cannot be talked out of:
 *
 *   - the body is declared as JSON;
 *   - where the browser says where the request came from (`Sec-Fetch-Site`, or `Origin`), it came
 *     from here.
 *
 * A script (curl, a server) sends neither header and is let through: these routes have their own
 * limits, and the point is only that a stranger's browser cannot be made to call them for someone.
 */
export function fromHere(req: Request): boolean {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
