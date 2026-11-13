import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who walks the whole village and who is given a look (DECISIONS C97, `lib/preview.ts`). The server's
 * half: it reads the deployment's settings and never reaches a browser.
 *
 * THE VILLAGE OPENS IN TURNS wherever the site is built for visitors (a production build), and is
 * open as it always was on a developer's machine, where the tests and the day's work are. Two
 * settings move that, and neither is needed for the default:
 *
 *   ECHO_OPEN=1   everyone walks the whole village: the day the turns end, or a production build
 *                 that a browser test is to play right through.
 *   ECHO_GATE=1   a development server gives looks too, to see what a visitor sees.
 *
 * A TURN is a link: `/in/<code>`, where the code is one of `ECHO_PASS` (a list, commas between). The
 * link leaves a cookie holding a digest of the code, never the code, and walks into the open village.
 * Taking a code out of the list ends the turn of everyone who came by it. With no `ECHO_PASS` there
 * are no turns to give, and every link says so by leading to the waitlist.
 *
 * It is a door for a visitor, not a lock: a look is cut short in the browser, and someone set on
 * walking further can. Nothing behind it is a secret; what is asked for is a name.
 */
export const PASS_COOKIE = "echo_pass";

type Env = Record<string, string | undefined>;

export function inTurns(env: Env = process.env): boolean {
  if (env.ECHO_OPEN === "1") return false;
  if (env.ECHO_GATE === "1") return true;
  return env.NODE_ENV === "production";
}

/** The codes that are turns. Short ones are not counted: a code that can be guessed is not a turn. */
function codes(env: Env): string[] {
  return (env.ECHO_PASS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length >= 8);
}

/** What the cookie holds for a code. */
export const passDigest = (code: string): string => createHash("sha256").update(`echo-pass:${code}`).digest("hex");

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The cookie's value for a code that is a turn, or null. */
export function passFor(code: string, env: Env = process.env): string | null {
  const given = passDigest(code);
  return codes(env).some((c) => same(passDigest(c), given)) ? given : null;
}

/** Whether a cookie's value is a turn still on the list. */
export function hasPass(cookie: string | undefined, env: Env = process.env): boolean {
  if (!cookie) return false;
  return codes(env).some((c) => same(passDigest(c), cookie));
}

/** Whether this arrival is given a look, not the village. */
export function isPreview(cookie: string | undefined, env: Env = process.env): boolean {
  return inTurns(env) && !hasPass(cookie, env);
}
