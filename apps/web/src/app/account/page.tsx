"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPersona, type PersonaSnapshot } from "@/lib/agent";

interface Consent {
  world: boolean;
  telemetry: boolean;
  voice: boolean;
  biometric: boolean;
}

/** Privacy & data controls (§13). Review consent, see what's been learned, erase everything. */
export default function Account() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [consent, setConsent] = useState<Consent>({ world: true, telemetry: true, voice: false, biometric: false });
  const [snap, setSnap] = useState<PersonaSnapshot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("echo.userId") ?? "";
    setUid(id);
    try {
      setConsent(JSON.parse(localStorage.getItem("echo.consent") ?? "{}"));
    } catch {
      /* defaults */
    }
    if (id) getPersona(id).then(setSnap);
  }, []);

  function updateConsent(key: keyof Consent, value: boolean) {
    const next = { ...consent, [key]: value };
    setConsent(next);
    localStorage.setItem("echo.consent", JSON.stringify(next));
  }

  async function eraseEverything() {
    await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });
    ["echo.userId", "echo.name", "echo.consent", "echo.character"].forEach((k) => localStorage.removeItem(k));
    setDeleted(true);
    setTimeout(() => router.push("/"), 1800);
  }

  if (deleted) {
    return (
      <main className="flex h-screen items-center justify-center bg-ink font-mono text-parchment">
        <div className="panel rounded-lg p-8 text-center">
          <p className="text-echo">Erased.</p>
          <p className="mt-2 text-xs text-parchment/60">No one knows you here again — not even your echo.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-4 font-mono text-parchment">
      <div className="panel w-full max-w-lg rounded-lg p-6">
        <h1 className="mb-1 text-2xl font-bold text-echo">your data</h1>
        <p className="mb-5 text-xs text-parchment/60">
          What echo may learn is yours to control. Selfies are never stored — only derived style.
        </p>

        <div className="mb-5">
          <div className="mb-2 text-xs text-parchment/50">consent</div>
          {(["world", "telemetry", "voice", "biometric"] as const).map((k) => (
            <label key={k} className="mb-1 flex items-center justify-between rounded border-2 border-echo/20 px-3 py-2 text-sm">
              <span className="capitalize">{k === "biometric" ? "selfie (biometric)" : k}</span>
              <input
                type="checkbox"
                checked={!!consent[k]}
                disabled={k === "world"}
                onChange={(e) => updateConsent(k, e.target.checked)}
                className="accent-echo"
              />
            </label>
          ))}
        </div>

        <div className="mb-5 rounded border-2 border-echo/20 p-3 text-xs text-parchment/70">
          <div className="mb-1 text-parchment/50">what your echo has learned</div>
          {snap && snap.behaviors > 0 ? (
            <>
              <div>traits: {snap.traits.join(", ") || "still forming"}</div>
              <div>signals recorded: {snap.behaviors}</div>
              <div>autonomy contexts: {Object.keys(snap.buckets).length}</div>
            </>
          ) : (
            <div className="text-parchment/40">nothing yet</div>
          )}
        </div>

        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="w-full rounded border-2 border-red-400/40 px-4 py-2 text-sm text-red-200 hover:bg-red-900/20">
            erase everything
          </button>
        ) : (
          <div className="rounded border-2 border-red-400/40 p-3">
            <p className="mb-3 text-xs text-red-200">
              This permanently deletes your persona model, every behavioral signal, your character, and
              all narrations. It cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={eraseEverything} className="flex-1 rounded bg-red-500/80 px-4 py-2 text-sm font-bold text-ink">
                yes, erase
              </button>
              <button onClick={() => setConfirming(false)} className="rounded border border-echo/30 px-4 py-2 text-sm">
                cancel
              </button>
            </div>
          </div>
        )}

        <button onClick={() => router.push("/world")} className="mt-4 text-xs text-parchment/50 hover:text-parchment">
          ← back to the world
        </button>
      </div>
    </main>
  );
}
