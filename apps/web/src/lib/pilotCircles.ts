/**
 * Circles (DECISIONS C83): "who knows you best" for any group of friends, not only the owner's study.
 *
 * The registered study is the circle "study": its code is `ECHO_PILOT_CODE`, its visits `ECHO_PILOT_VISITS`,
 * its debrief the owner's switch (`ECHO_PILOT_REVEAL`), and it alone is in the owner's export. Any other
 * circle is started by someone with a fresh code of its own. Its friends play three visits (or two), and
 * each sees who knew them best once their visits are over. Nothing from a circle reaches the export.
 *
 * OFF UNLESS SWITCHED ON: `ECHO_CIRCLES=1`, beside `ECHO_PILOT=1`. Off, the store reads and writes the
 * pilot's tables exactly as before migration 0037, so the study runs whether or not 0037 is applied.
 *
 * A code is eight letters and digits from an alphabet without look-alikes, shown as two groups of four.
 * The store keeps only its SHA-256, so a leaked table does not let anyone in.
 */
import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const STUDY = "study";

export interface PilotCircle {
  id: string;
  /** SHA-256 of the code as `normalCode` gives it, in hex. */
  codeHash: string;
  /** Who started it: null once they have erased themselves (the circle stays for its friends). */
  createdBy: string | null;
  createdAt: string;
  visits: 2 | 3;
  /** Whether its friends may give their data to research. False for every circle today (C83). */
  research: boolean;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Whether circles are switched on. */
export function circlesOn(): boolean {
  return process.env.ECHO_PILOT === "1" && process.env.ECHO_CIRCLES === "1";
}

/** A code as typed, lower case, letters and digits only; null when it cannot be one. */
export function normalCode(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return s.length >= 4 && s.length <= 32 ? s : null;
}

export function codeHash(code: string): string {
  return createHash("sha256").update(normalCode(code) ?? "").digest("hex");
}

function draw(n: number): string {
  // 256 is not a multiple of 31: bytes past the last whole run of the alphabet are thrown back.
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < n) {
    for (const b of randomBytes(n * 2)) {
      if (b < limit && out.length < n) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

/** A fresh code to give friends: "abcd-efgh". */
export function newCircleCode(): string {
  const s = draw(8);
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function newCircleId(): string {
  return draw(12);
}
