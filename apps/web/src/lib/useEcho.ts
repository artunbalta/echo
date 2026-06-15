"use client";

/**
 * useEcho — the single source of truth for "how well your echo knows you" (B2/M1/M4).
 *
 * Polls `GET /persona` and derives a *recognition* signal that is bound entirely to REAL
 * learned state (no cosmetic invention, §2): the blend below is just a reshaping of the
 * posterior certainty, resolved axes, evidence count, and per-bucket calibration/agreement
 * the ML engine actually reports. It also diffs successive snapshots so the world can react
 * to genuine learning *in the moment* — a trait newly resolving, a context graduating — the
 * feedback that is otherwise closed silently server-side.
 *
 * One poll, many consumers: the world owns this hook and hands `snap`/`parts` to the mirror
 * panel as props, so we never double-poll.
 */
import { useEffect, useRef, useState } from "react";
import { getPersona, type PersonaSnapshot } from "@/lib/agent";

export interface RecognitionParts {
  /** posterior certainty 1 − mean(uncertainty): how sure the echo is about who you are. */
  certainty: number;
  /** breadth: fraction of the 8 persona axes that have resolved (decoded traits / 8). */
  breadth: number;
  /** evidence: behavior count, with diminishing returns. */
  evidence: number;
  /** reliability: low calibration error + rising per-context agreement. */
  reliability: number;
}

export interface EchoDerived {
  recognition: number; // 0..1 overall — the headline glance value
  parts: RecognitionParts;
}

export interface EchoState extends EchoDerived {
  snap: PersonaSnapshot | null;
  /** Buckets that have earned full autonomy (the on-ramp to the handover). */
  autoBuckets: string[];
  /** ML service unreachable → snapshot is a mock. Surface this honestly, never fake a fill. */
  offline: boolean;
  loaded: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Pure: reshape a real persona snapshot into the recognition blend. No hidden state. */
export function computeRecognition(snap: PersonaSnapshot | null): EchoDerived {
  if (!snap) return { recognition: 0, parts: { certainty: 0, breadth: 0, evidence: 0, reliability: 0 } };

  const certainty = clamp01(1 - snap.uncertainty);
  const breadth = clamp01(snap.traits.length / 8);
  const evidence = clamp01(1 - Math.exp(-snap.behaviors / 12));

  // Reliability only means something once the agent has a track record in some context.
  const buckets = Object.values(snap.buckets ?? {});
  let reliability = 0;
  if (buckets.length) {
    const avgAgreement = buckets.reduce((s, b) => s + (b.agreement_ewma ?? 0.5), 0) / buckets.length;
    // 0.5 is the cold-start prior (no evidence) → map [0.5,1] onto [0,1].
    const agreementPart = clamp01((avgAgreement - 0.5) / 0.5);
    // ece ≤ e*(0.10) is the promotion bar → reward low calibration error.
    const calibrationPart = snap.ece == null ? 0 : clamp01(1 - snap.ece / 0.2);
    reliability = 0.6 * agreementPart + 0.4 * calibrationPart;
  }

  // Certainty leads (it is the echo's confidence in *you*); breadth + evidence build the
  // picture; reliability is the trust polish that gates the handover.
  const recognition = clamp01(0.4 * certainty + 0.25 * breadth + 0.2 * evidence + 0.15 * reliability);
  return { recognition, parts: { certainty, breadth, evidence, reliability } };
}

const LEVEL_RANK: Record<string, number> = { copilot: 0, supervised: 1, auto: 2 };

export interface UseEchoOpts {
  intervalMs?: number;
  /** A persona axis newly crossed the decode threshold — a real, legible learning beat. */
  onTraitResolved?: (trait: string) => void;
  /** A context bucket graduated (copilot→supervised→auto) — the graduation moment. */
  onPromotion?: (bucket: string, level: string) => void;
}

export function useEcho(userId: string | null | undefined, opts: UseEchoOpts = {}): EchoState {
  const { intervalMs = 3000 } = opts;
  const [snap, setSnap] = useState<PersonaSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Keep callbacks + last-seen state in refs so the poll effect never re-subscribes.
  const cbs = useRef(opts);
  cbs.current = opts;
  const prevTraits = useRef<Set<string> | null>(null);
  const prevLevels = useRef<Record<string, string>>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // New user → reset the baselines so a returning auto-context isn't replayed as a moment.
    prevTraits.current = null;
    prevLevels.current = {};
    initialized.current = false;
    const load = async () => {
      const s = await getPersona(userId);
      if (!alive) return;
      setSnap(s);
      setLoaded(true);
      const firstLoad = !initialized.current; // baseline silently on the first poll

      // Diff traits → fire on genuinely newly-resolved axes (never on the baseline load).
      const traitSet = new Set(s.traits);
      if (!firstLoad && prevTraits.current) {
        for (const t of s.traits) {
          if (!prevTraits.current.has(t)) cbs.current.onTraitResolved?.(t);
        }
      }
      prevTraits.current = traitSet;

      // Diff bucket levels → fire when a context graduates *this session*: an observed upward
      // move, OR a newly-appearing bucket already above copilot (it can only have just been
      // earned — a promotion that happened between two polls).
      for (const [name, b] of Object.entries(s.buckets ?? {})) {
        const before = prevLevels.current[name];
        if (!firstLoad) {
          if (before !== undefined && LEVEL_RANK[b.level] > LEVEL_RANK[before]) {
            cbs.current.onPromotion?.(name, b.level);
          } else if (before === undefined && b.level !== "copilot") {
            cbs.current.onPromotion?.(name, b.level);
          }
        }
        prevLevels.current[name] = b.level;
      }
      initialized.current = true;
    };
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userId, intervalMs]);

  const derived = computeRecognition(snap);
  const autoBuckets = Object.entries(snap?.buckets ?? {})
    .filter(([, b]) => b.level === "auto")
    .map(([name]) => name);

  return { ...derived, snap, autoBuckets, offline: !!snap?.mocked, loaded };
}
