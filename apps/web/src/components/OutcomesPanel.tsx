"use client";

import { useState } from "react";
import { approveMeeting } from "@/lib/agent";

export interface MetPerson {
  id: string;
  name: string;
  turns: number;
  reason: string;
}

/** Outcome surfacing (§10): the agent met people on your behalf; the human makes the final
 *  call on real connections. Approving is a high-stakes action → ground-truth meeting
 *  outcome feeding the reward model (§9.4). */
export default function OutcomesPanel({
  userId,
  met,
  onClose,
}: {
  userId: string;
  met: MetPerson[];
  onClose: () => void;
}) {
  const [done, setDone] = useState<Record<string, "yes" | "no">>({});

  // The "few you should actually connect with": most-engaged first.
  const ranked = [...met].sort((a, b) => b.turns - a.turns).slice(0, 3);

  async function decide(p: MetPerson, yes: boolean) {
    setDone((d) => ({ ...d, [p.id]: yes ? "yes" : "no" }));
    await approveMeeting({
      userId,
      counterpartId: p.id,
      action: `meet ${p.name}`,
      context: p.reason,
      occurred: yes,
      rating: yes ? 5 : 1,
    });
  }

  return (
    <div className="panel absolute left-1/2 top-1/2 z-30 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg p-4 font-mono text-sm text-parchment">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-echo">who to actually connect with</span>
        <button onClick={onClose} className="text-parchment/50 hover:text-parchment">×</button>
      </div>

      {met.length === 0 ? (
        <p className="text-parchment/50">
          Your echo hasn&apos;t met anyone yet. Walk up to people and talk — the ones that matter
          will surface here.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-parchment/60">
            Your echo spoke with {met.length} {met.length === 1 ? "person" : "people"} today. These
            stood out. You decide — a real connection is always yours to approve.
          </p>
          {ranked.map((p) => (
            <div key={p.id} className="mb-2 rounded border-2 border-echo/20 p-3">
              <div className="mb-1 font-bold text-echo">{p.name}</div>
              <div className="mb-2 text-xs text-parchment/60">{p.reason}</div>
              {done[p.id] ? (
                <div className={`text-xs ${done[p.id] === "yes" ? "text-green-300" : "text-parchment/40"}`}>
                  {done[p.id] === "yes" ? "✓ you'd like to connect" : "skipped"}
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => decide(p, true)} className="rounded bg-echo px-3 py-1 text-xs font-bold text-ink">
                    yes, connect
                  </button>
                  <button onClick={() => decide(p, false)} className="rounded border border-echo/30 px-3 py-1 text-xs">
                    not now
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
