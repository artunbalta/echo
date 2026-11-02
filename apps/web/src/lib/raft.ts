/**
 * How fast a raft goes (DECISIONS C57).
 *
 * The stranger's own raft is paddled a little quicker than a village boat is rowed: it is lighter,
 * and it is theirs. With Shift held it is SAILED, and then the day decides. On a still day a sail is
 * nothing and it is a paddle again; in a fresh wind a crossing that would take most of an hour
 * takes a quarter of one. The weather is the region's (C48), so everyone on that sea has the same
 * wind.
 *
 * The weather has no wind direction, so the sail draws from any quarter. That is a liberty, and it
 * is written down (⚑47).
 *
 * Pure.
 */

export const RAFT = {
  /** Paddling, metres a second: a village boat is rowed at 1.4. */
  paddleMps: 1.6,
  /** What a full gale adds under sail, metres a second. */
  sailPerWindMps: 7,
} as const;

/** The raft's speed: paddled, or under sail in this much wind (0 still … 1 a gale). */
export function raftSpeed(wind: number, sailing: boolean): number {
  const w = Math.max(0, Math.min(1, Number.isFinite(wind) ? wind : 0));
  return RAFT.paddleMps + (sailing ? RAFT.sailPerWindMps * w : 0);
}
