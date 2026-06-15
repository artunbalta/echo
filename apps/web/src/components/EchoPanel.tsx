"use client";

import type { PersonaSnapshot } from "@/lib/agent";
import type { RecognitionParts } from "@/lib/useEcho";

const LEVEL_COLOR: Record<string, string> = {
  copilot: "text-parchment/60",
  supervised: "text-yellow-300",
  auto: "text-green-300",
};

// The real promotion gate (services/ml/echo_ml/config.py) — shown so "almost there" is legible.
const ALPHA_PROMOTE = 0.8;
const N_PROMOTE = 8;
const ECE_PROMOTE = 0.1;

/** The "mirror" (§1, §10 transparency). Now a presentational view over the world's shared
 *  persona snapshot (no second poll). Shows what the agent has learned: persona traits, the
 *  honest recognition sub-components, and each context's real progress toward earning
 *  autonomy — so the graduation toward the handover is something you can watch approach. */
export default function EchoPanel({
  snap,
  parts,
  offline,
  onClose,
}: {
  snap: PersonaSnapshot | null;
  parts: RecognitionParts;
  offline: boolean;
  onClose: () => void;
}) {
  return (
    <div className="panel absolute right-3 top-24 z-20 w-72 rounded-lg p-3 font-mono text-xs text-parchment">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-echo">your echo</span>
        <button onClick={onClose} className="text-parchment/50 hover:text-parchment">×</button>
      </div>

      {!snap || snap.behaviors === 0 ? (
        <>
          <p className="text-parchment/50">
            No one knows you here yet — not even your echo. Move around and talk to people; it learns
            from what you do.
          </p>
          {offline && <p className="mt-2 text-parchment/30">ML service offline — running on demo values.</p>}
        </>
      ) : (
        <>
          <div className="mb-3">
            <div className="mb-1 text-parchment/50">reads you as</div>
            <div className="flex flex-wrap gap-1">
              {snap.traits.length ? (
                snap.traits.map((t) => (
                  <span key={t} className="rounded bg-echo/20 px-1.5 py-0.5 text-echo">{t}</span>
                ))
              ) : (
                <span className="text-parchment/40">still forming…</span>
              )}
            </div>
          </div>

          {/* Recognition, broken into its honest parts (no single opaque number). */}
          <div className="mb-3">
            <div className="mb-1 text-parchment/50">how well it knows you</div>
            {(
              [
                ["sure of who you are", parts.certainty],
                ["facets resolved", parts.breadth],
                ["evidence gathered", parts.evidence],
                ["calls it gets right", parts.reliability],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="mb-1 flex items-center gap-2">
                <span className="w-28 shrink-0 text-parchment/55">{label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded bg-ink">
                  <span className="block h-full rounded bg-echo transition-all" style={{ width: `${Math.round(v * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-1 text-parchment/60">
            <span>signals: {snap.behaviors}</span>
            <span>calibration: {snap.ece == null ? "—" : snap.ece}</span>
          </div>

          <div>
            <div className="mb-1 text-parchment/50">autonomy by context</div>
            {Object.keys(snap.buckets).length === 0 ? (
              <div className="text-parchment/40">earned per context as you confirm its calls</div>
            ) : (
              Object.entries(snap.buckets).map(([name, b]) => (
                <BucketProgress key={name} name={name} bucket={b} />
              ))
            )}
          </div>
          {offline && <p className="mt-2 text-parchment/30">ML service offline — running on demo values.</p>}
        </>
      )}
    </div>
  );
}

/** One context's standing + how close it is to earning the next rung — the gate made legible. */
function BucketProgress({
  name,
  bucket,
}: {
  name: string;
  bucket: { level: string; agreement_ewma: number; volume: number; ece: number };
}) {
  const promoted = bucket.level === "auto";
  const agreePct = Math.round(bucket.agreement_ewma * 100);
  const agreeOk = bucket.agreement_ewma >= ALPHA_PROMOTE;
  const volOk = bucket.volume >= N_PROMOTE;
  const eceOk = bucket.ece <= ECE_PROMOTE;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <span className="text-parchment/70">{name.replace(/_/g, " ")}</span>
        <span className={LEVEL_COLOR[bucket.level] ?? ""}>
          {promoted ? "✓ carries this" : bucket.level}
        </span>
      </div>
      {!promoted && (
        <>
          {/* Agreement toward α* — a tick marks the bar the bucket must clear. */}
          <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded bg-ink">
            <div
              className={`h-full rounded transition-all ${agreeOk ? "bg-green-300/80" : "bg-echo"}`}
              style={{ width: `${agreePct}%` }}
            />
            <div className="absolute inset-y-0 w-px bg-parchment/50" style={{ left: `${ALPHA_PROMOTE * 100}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-parchment/45">
            <span className={agreeOk ? "text-green-300/80" : ""}>agrees {agreePct}% / need 80%</span>
            <span>
              <span className={volOk ? "text-green-300/80" : ""}>seen {Math.min(bucket.volume, N_PROMOTE)}/{N_PROMOTE}</span>
              {" · "}
              <span className={eceOk ? "text-green-300/80" : ""}>calib {eceOk ? "ok" : "…"}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
