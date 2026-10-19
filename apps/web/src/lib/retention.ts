/**
 * How long behavioural data lives (DECISIONS C35, SOCIETY-PLAN SOC-2.G).
 *
 * Until this file there was NO retention window anywhere: thirteen identity-keyed tables, no TTL,
 * no expiry column, no pruning job, and no default in the code. `0011_behavioral_events` shipped a
 * durable personal-data log saying so in its own header, and SOC-2.D then gave four more tables
 * rows. "We keep everything forever because nobody chose" is a choice, and it was being made daily.
 *
 * THE WINDOW IS SPLIT, and the split is the whole decision. The RAW log — what you did, when, with
 * whom, in what words — expires. The DERIVED profile — eight axes, the conditional signature, the
 * autonomy buckets — is kept while the account lives, because that IS the product: an echo that
 * forgets you every quarter is not an echo. So the sensitive surface shrinks on a clock while the
 * thing a person came for does not.
 *
 * WHAT IT COSTS, stated rather than buried. `⚑21` measured a 240-row corpus with variance in only
 * 7 of its 66 features, so the second `W` re-anchor needs volume — and a rolling 90-day window may
 * never accumulate it. That is a real price paid deliberately: `⚑21` also records that the
 * re-anchor "is not schedulable until labels exist", so this trades a corpus for an event with no
 * date against an exposure that is real every day.
 *
 * THE BASIS IS CONSENT, which is what the card already asks for, and consent decides what
 * withdrawal means: `revoke()` stops all new sampling immediately and existing rows age out on this
 * clock. It does NOT erase — `/account` does that, on demand, and the inspector's own copy points
 * there rather than overstating what a toggle does (SOC-1.E).
 */

/** Days a RAW behavioural row lives. C35. */
export const RAW_RETENTION_DAYS = 90;

/**
 * The raw log: rows that record WHAT SOMEONE DID, keyed to them, with the column that dates each.
 *
 * Classified by reading the tables, not by name. Every one of these is an event with a person, a
 * time and a payload; none of them is a model.
 */
export const RAW_TABLES: readonly { table: string; column: string }[] = [
  // The durable record of every measurement the landing world sends to the engine (0011).
  { table: "behavioral_events", column: "created_at" },
  // What each of those did to the echo, for the mirror (0027, C61). A record of acts, so raw: a row
  // that ages off is shown as "not in this record" rather than vanishing from the account.
  { table: "echo_ledger", column: "at" },
  // What the director set out for someone, and how they answered it (0028, C63).
  { table: "player_stagings", column: "created_at" },
  // When someone was last here, and what their echo did while they were away (0029, C64).
  { table: "player_presence", column: "last_seen_at" },
  { table: "echo_outings", column: "made_at" },
  // The older telemetry envelope, same shape, different route (0001).
  { table: "telemetry_events", column: "ts" },
  // Who approached whom, and when (0001).
  { table: "interactions", column: "started_at" },
  // ⚠️ `messages.text` is the actual typed content of a conversation, and it is the most sensitive
  // row in the schema. It is swept on the same clock as everything else here, which is the
  // conservative choice available today — but the deeper question is whether it should exist at
  // all, given ConsentCard's promise to read "never what you type". That is SOC-5.D's, not this
  // file's, and this comment is here so it is not mistaken for settled.
  { table: "messages", column: "ts" },
  // Generated narration about a session, which quotes it (0001).
  { table: "narrations", column: "ts" },
];

/**
 * The derived profile: kept while the account lives, erased on request.
 *
 * Listed here rather than left implicit so that the two sets are visibly exhaustive against
 * `USER_KEYED` in the erasure cascade — a table in neither list is a table nobody has decided
 * about, and this file is the place that is supposed to be obvious.
 */
export const DERIVED_TABLES: readonly string[] = [
  "persona_state",
  "behavior_index",
  "reward_model_state",
  "autonomy_buckets",
  "preference_pairs",
  "meeting_outcomes",
];

/** The cutoff a sweep run at `now` should delete strictly before. */
export function cutoff(now: Date, days: number = RAW_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export interface SweepResult {
  /** Rows the sweep asked each table to drop, or an error string. */
  swept: { table: string; error?: string }[];
  cutoff: string;
  attempted: boolean;
}

/**
 * Delete raw rows older than the window. Returns what happened; never throws.
 *
 * NOT ITS OWN CRON ENTRY, and that is a constraint rather than a preference: Vercel's Hobby plan
 * permits at most one cron run per day and REJECTS THE WHOLE DEPLOYMENT — not just the cron — if a
 * schedule is more frequent, which once stopped a production deploy dead for twelve hours
 * (`api/cron/waitlist-sweep`'s own header records it). There is already one daily cron, so this
 * rides it rather than risking the deployment for a second entry.
 */
export async function sweepRawRetention(
  url: string | undefined,
  serviceKey: string | undefined,
  now: Date = new Date(),
  days: number = RAW_RETENTION_DAYS,
): Promise<SweepResult> {
  const before = cutoff(now, days);
  if (!url || !serviceKey) {
    // Not a clean slate — the same lesson as the erasure route (⚑26): a sweep that never looked
    // must not report a tidy database.
    return { swept: [], cutoff: before.toISOString(), attempted: false };
  }
  const swept: { table: string; error?: string }[] = [];
  for (const { table, column } of RAW_TABLES) {
    try {
      const res = await fetch(
        `${url}/rest/v1/${table}?${column}=lt.${encodeURIComponent(before.toISOString())}`,
        {
          method: "DELETE",
          headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, prefer: "return=minimal" },
        },
      );
      swept.push(res.ok ? { table } : { table, error: `${res.status}` });
    } catch (err) {
      swept.push({ table, error: (err as Error).message });
    }
  }
  const failed = swept.filter((s) => s.error);
  if (failed.length) {
    console.error(`[retention] ${failed.length} table(s) not swept: ${failed.map((f) => `${f.table} ${f.error}`).join(", ")}`);
  }
  return { swept, cutoff: before.toISOString(), attempted: true };
}
