"use client";

import { useState } from "react";
import { approveMeeting, type ConnectionAnalysis } from "@/lib/agent";

export interface MetPerson {
  id: string;
  name: string;
  turns: number;
  reason: string;
  /** Met by your echo while it wandered on its own (the handover payoff). */
  auto?: boolean;
}

/** Outcome surfacing (§10): the agent met people on your behalf; the human makes the final
 *  call on real connections. Approving is a high-stakes action → ground-truth meeting
 *  outcome feeding the reward model (§9.4). The decision is persisted (localStorage), so
 *  reopening the panel keeps your choice instead of asking again. */
export default function OutcomesPanel({
  userId,
  met,
  analyses,
  analyzing,
  onClose,
}: {
  userId: string;
  met: MetPerson[];
  analyses?: Record<string, ConnectionAnalysis>;
  analyzing?: boolean;
  onClose: () => void;
}) {
  const storeKey = `echo.connDecisions.${userId}`;
  // Hydrate prior decisions so a reopened panel doesn't ask again.
  const [done, setDone] = useState<Record<string, "yes" | "no">>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    } catch {
      return {};
    }
  });

  // The "few you should actually connect with": most-engaged first.
  const ranked = [...met].sort((a, b) => b.turns - a.turns).slice(0, 3);

  const reasonFor = (p: MetPerson) => analyses?.[p.id]?.reason ?? p.reason;

  async function decide(p: MetPerson, yes: boolean) {
    setDone((d) => {
      const next = { ...d, [p.id]: yes ? "yes" : ("no" as "yes" | "no") };
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* private mode / quota — decision still holds for this session */
      }
      return next;
    });
    await approveMeeting({
      userId,
      counterpartId: p.id,
      action: `meet ${p.name}`,
      context: reasonFor(p),
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
            Your echo spoke with {met.length} {met.length === 1 ? "person" : "people"} today.
            {analyzing ? " Reading back what was said…" : " These stood out."} You decide — a real
            connection is always yours to approve.
          </p>
          {ranked.map((p) => {
            const a = analyses?.[p.id];
            const pending = analyzing && !a;
            return (
              <div key={p.id} className="mb-2 rounded border-2 border-echo/20 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-bold text-echo">{p.name}</span>
                  {p.auto && (
                    <span className="rounded bg-echo/15 px-1 text-[10px] text-parchment/60">met by your echo</span>
                  )}
                  {a?.recommend && (
                    <span className="rounded bg-echo/20 px-1 text-[10px] text-echo">your echo: worth it</span>
                  )}
                </div>
                <div className={`mb-2 text-xs ${pending ? "text-parchment/40 italic" : "text-parchment/60"}`}>
                  {pending ? "your echo is reading the conversation…" : reasonFor(p)}
                </div>
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
            );
          })}
        </>
      )}
    </div>
  );
}
