/**
 * Where the village's count is kept (DECISIONS C91): Supabase's `open_moments` (migration 0040), or the
 * process's own memory under `VILLAGE_STORE=memory` for tests and a machine with no database.
 *
 * OFF UNLESS SWITCHED ON. `ECHO_OPEN_CROWD=1` is the owner's yes to the count and to the sentence the
 * consent card gains with it. Without the switch, or without anywhere to keep rows, `openCount()` is
 * null and the route says so: nothing is taken, nothing is given, and the page calls as it did.
 *
 * NEVER THE ENGINE'S, NEVER THE STUDY'S. A row moves no echo and is in no export: it is counted, and
 * it is removed when its visitor asks (`forgetVisitor`).
 */
import "server-only";

import type { Counted, CountRow } from "@/lib/knowable/crowd";
import { adminClient, hasAdmin } from "@/lib/supabaseAdmin";

export interface OpenCount {
  readonly kind: "supabase" | "memory";
  /** Add rows under a visitor; one already there is left as it is. False if they could not be kept. */
  add(visitor: string, rows: readonly CountRow[]): Promise<boolean>;
  /** How every moment ended, by arm, and among how many people; null if it could not be read. */
  counted(): Promise<Counted[] | null>;
  /** Remove everything a visitor added. False if it could not be done. */
  forgetVisitor(visitor: string): Promise<boolean>;
}

export const openCrowdOn = (): boolean => process.env.ECHO_OPEN_CROWD === "1";

type Kept = CountRow & { visitor: string };
// On globalThis: Next's dev server loads a route's modules more than once (C44's gotcha).
const shared = globalThis as unknown as { __echoOpenCount?: Map<string, Kept> };

function memoryCount(): OpenCount {
  const rows = (shared.__echoOpenCount ??= new Map());
  return {
    kind: "memory",
    async add(visitor, add) {
      for (const r of add) if (!rows.has(`${visitor}|${r.seal}`)) rows.set(`${visitor}|${r.seal}`, { ...r, visitor });
      return true;
    },
    async counted() {
      const cells = new Map<string, { kind: string; arm: string; did: Map<string, number>; people: Set<string> }>();
      for (const r of rows.values()) {
        const key = `${r.kind}|${r.arm ?? "-"}`;
        const c = cells.get(key) ?? { kind: r.kind, arm: r.arm ?? "-", did: new Map(), people: new Set() };
        c.did.set(r.did, (c.did.get(r.did) ?? 0) + 1);
        c.people.add(r.visitor);
        cells.set(key, c);
      }
      return [...cells.values()].flatMap((c) => [...c.did].map(([did, n]) => ({ kind: c.kind, arm: c.arm, did, n, people: c.people.size })));
    },
    async forgetVisitor(visitor) {
      for (const [key, r] of rows) if (r.visitor === visitor) rows.delete(key);
      return true;
    },
  };
}

function supabaseCount(): OpenCount | null {
  const admin = adminClient();
  if (!admin) return null;
  const warn = (what: string, message: string) => console.warn(`[open-count] ${what}: ${message}`);
  return {
    kind: "supabase",
    async add(visitor, rows) {
      const { error } = await admin
        .from("open_moments")
        .upsert(
          rows.map((r) => ({ visitor, seal: r.seal, cell: r.cell, kind: r.kind, arm: r.arm, call: r.call, did: r.did, looks_same: r.same, looks_family: r.family, sealed_at: r.at })),
          { onConflict: "visitor,seal", ignoreDuplicates: true },
        );
      if (error) warn("add", error.message);
      return !error;
    },
    async counted() {
      const { data, error } = await admin.from("open_moments_crowd").select("kind, arm, did, n, people").limit(5000);
      if (error) return warn("counted", error.message), null;
      return (data ?? []) as Counted[];
    },
    async forgetVisitor(visitor) {
      const { error } = await admin.from("open_moments").delete().eq("visitor", visitor);
      if (error) warn("forget", error.message);
      return !error;
    },
  };
}

/**
 * Wherever rows are or were kept, switch or no switch: for removing them. Someone who added to the
 * count while it was on must be able to take theirs back after it is switched off.
 */
export function openCountStore(): OpenCount | null {
  if (process.env.VILLAGE_STORE === "memory") return memoryCount();
  return hasAdmin ? supabaseCount() : null;
}

/** The count's store, or null: switched off, or nowhere to keep it. */
export function openCount(): OpenCount | null {
  return openCrowdOn() ? openCountStore() : null;
}
