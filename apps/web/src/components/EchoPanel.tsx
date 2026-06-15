"use client";

import { useEffect, useState } from "react";
import { getPersona, type PersonaSnapshot } from "@/lib/agent";

const LEVEL_COLOR: Record<string, string> = {
  copilot: "text-parchment/60",
  supervised: "text-yellow-300",
  auto: "text-green-300",
};

/** The "mirror" (§1, §10 transparency). Shows what the agent has learned: persona traits,
 *  how sure it is, and which contexts it has earned autonomy in. */
export default function EchoPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [snap, setSnap] = useState<PersonaSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => getPersona(userId).then((s) => alive && setSnap(s));
    load();
    const t = setInterval(load, 3000); // live-update as the user plays
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [userId]);

  const certainty = snap ? Math.max(0, Math.min(100, Math.round((1 - snap.uncertainty) * 100))) : 0;

  return (
    <div className="panel absolute right-3 top-14 z-20 w-72 rounded-lg p-3 font-mono text-xs text-parchment">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-echo">your echo</span>
        <button onClick={onClose} className="text-parchment/50 hover:text-parchment">×</button>
      </div>

      {!snap || snap.behaviors === 0 ? (
        <p className="text-parchment/50">
          No one knows you here yet — not even your echo. Move around and talk to people; it learns
          from what you do.
        </p>
      ) : (
        <>
          <div className="mb-2">
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

          <div className="mb-2">
            <div className="mb-1 flex justify-between text-parchment/50">
              <span>confidence</span>
              <span>{certainty}%</span>
            </div>
            <div className="h-1.5 w-full rounded bg-ink">
              <div className="h-full rounded bg-echo transition-all" style={{ width: `${certainty}%` }} />
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-1 text-parchment/60">
            <span>signals: {snap.behaviors}</span>
            <span>calibration: {snap.ece == null ? "—" : snap.ece}</span>
          </div>

          <div>
            <div className="mb-1 text-parchment/50">autonomy by context</div>
            {Object.keys(snap.buckets).length === 0 ? (
              <div className="text-parchment/40">earned per context as you confirm its calls</div>
            ) : (
              Object.entries(snap.buckets).map(([name, b]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-parchment/70">{name.replace(/_/g, " ")}</span>
                  <span className={LEVEL_COLOR[b.level] ?? ""}>
                    {b.level} · {Math.round(b.agreement_ewma * 100)}%
                  </span>
                </div>
              ))
            )}
          </div>
          {snap.mocked && <p className="mt-2 text-parchment/30">ML service offline — demo values.</p>}
        </>
      )}
    </div>
  );
}
