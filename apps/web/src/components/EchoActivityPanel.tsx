"use client";

/**
 * What your echo did, on its own (§10 sovereignty). Every autonomous utterance is surfaced
 * here with its "why it said that" trace and a "that wasn't me" veto — the human stays in
 * command of a delegation they can revoke. A veto feeds sendFeedback(agreed:false), which
 * demotes the context through the existing hysteresis. Delegation you can take back, never
 * loss of control.
 */
export interface EchoAct {
  id: string;
  npcName: string;
  text: string;
  rationale: string;
  bucket: string;
  context: string;
  vetoed?: boolean;
}

export default function EchoActivityPanel({
  acts,
  onVeto,
  onClose,
}: {
  acts: EchoAct[];
  onVeto: (act: EchoAct) => void;
  onClose: () => void;
}) {
  return (
    <div className="panel absolute right-3 top-24 z-30 w-[min(360px,92vw)] rounded-lg p-3 font-mono text-xs text-parchment">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-echo">what your echo did</span>
        <button onClick={onClose} className="text-parchment/50 hover:text-parchment">×</button>
      </div>

      {acts.length === 0 ? (
        <p className="text-parchment/50">
          Nothing yet. When your echo carries a context on its own, every word it says appears here —
          with why it said it, and a way to say &ldquo;that wasn&apos;t me.&rdquo;
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {[...acts].reverse().map((a) => (
            <div key={a.id} className="rounded border-2 border-echo/20 p-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-parchment/50">
                <span>to {a.npcName}</span>
                <span>{prettyBucket(a.bucket)}</span>
              </div>
              <div className="mb-1 text-parchment">&ldquo;{a.text}&rdquo;</div>
              <div className="mb-1 text-[10px] italic text-parchment/45">why: {a.rationale}</div>
              {a.vetoed ? (
                <div className="text-[10px] text-yellow-300/80">↩ you said that wasn&apos;t you — your echo stepped back here</div>
              ) : (
                <button
                  onClick={() => onVeto(a)}
                  className="text-[10px] text-parchment/55 underline-offset-2 hover:text-yellow-200 hover:underline"
                >
                  that wasn&apos;t me
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const prettyBucket = (b: string) => b.replace(/_/g, " ");
