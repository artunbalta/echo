/**
 * What an erasure is allowed to call a success (§13, SOC-2.G).
 *
 * THE BRANCH LIVES HERE so a test drives the same code the route does — `sliceOptionsFor`'s move,
 * for its stated reason: a test that writes its own branch is testing its own branch. And this
 * particular branch had been wrong in three independent ways at once, each of which answered 200
 * over data that was still there.
 *
 * WHY IT WENT WRONG AT ALL, which is the part worth keeping. Every one of the three was harmless
 * while the tables were empty — and they were empty for three months, because the ML state tables
 * had zero writers. SOC-2.D gave them rows and turned three theoretical bugs into a page that tells
 * a person their personality measurement is gone while it is still on disk. **A promise that is
 * only true because a feature is missing is not a promise.**
 */

/** What the ML service answered. `lib/ml.ts` sets `mocked` on its fallback when the call failed. */
export interface MlDeleteResult {
  mocked?: boolean;
  reason?: string;
  deleted?: boolean;
}

export interface ErasureInput {
  /** Tables the Supabase REST pass removed rows from. */
  wiped: string[];
  /** Per-table failures from that pass, already formatted. */
  supabaseFailed: string[];
  /** The ML service's answer, or null/undefined if it was never called. */
  ml: MlDeleteResult | null | undefined;
  /** An island-state error message, or null when it succeeded. */
  islandError: string | null;
}

export interface ErasureVerdict {
  ok: boolean;
  failed: string[];
  status: 200 | 500;
}

export function erasureVerdict(input: ErasureInput): ErasureVerdict {
  const ml = input.ml ?? {};
  const failed = [
    ...input.supabaseFailed,
    // `deleted: false` is NOT failure. `STORE.delete` reports whether the user was in MEMORY, and
    // after a restart that is false for everyone while the durable rows are removed anyway. What
    // means failure is `mocked` — the call never reached the service.
    ...(ml.mocked === true
      ? [`ml service (${ml.reason ?? "unreachable"} — the posterior was not erased)`]
      : []),
    ...(input.islandError ? [`island_state (${input.islandError})`] : []),
  ];
  return { ok: failed.length === 0, failed, status: failed.length === 0 ? 200 : 500 };
}
