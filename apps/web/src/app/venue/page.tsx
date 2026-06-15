"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VenueScene } from "@/game/venue/VenueScene";
import type { ModeSummary, Outcome, SalesState } from "@/lib/venue/types";

interface Line {
  who: "sales" | "you";
  text: string;
}

export default function VenuePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VenueScene | null>(null);
  const [mode, setMode] = useState<ModeSummary | null>(null);
  const [near, setNear] = useState(false);
  const [portalNear, setPortalNear] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [booked, setBooked] = useState(0);
  const [total, setTotal] = useState(0);

  // human conversation state
  const convoId = useRef<string | null>(null);
  const stateRef = useRef<SalesState>("GREET");
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Outcome | null>(null);

  useEffect(() => {
    fetch("/api/venue/mode").then((r) => r.json()).then(setMode).catch(() => {});
    const scene = new VenueScene({
      onStandProximity: setNear,
      onPortalProximity: setPortalNear,
      onVisitorResolved: (o) => {
        setTotal((t) => t + 1);
        if (o.booked) setBooked((b) => b + 1);
      },
    });
    sceneRef.current = scene;
    if (mountRef.current) scene.init(mountRef.current);
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  const openConvo = useCallback(async () => {
    if (open || busy) return;
    setOpen(true);
    setDone(null);
    setLines([]);
    sceneRef.current?.setHumanEngaged(true);
    setBusy(true);
    try {
      const r = await fetch("/api/venue/dialogue/sales-turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      convoId.current = d.conversationId;
      stateRef.current = d.state;
      setLines([{ who: "sales", text: d.reply.text }]);
      speak(d.reply.text, mode);
    } finally {
      setBusy(false);
    }
  }, [open, busy, mode]);

  const closeConvo = useCallback(() => {
    setOpen(false);
    convoId.current = null;
    sceneRef.current?.setHumanEngaged(false);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !convoId.current) return;
    setInput("");
    setLines((l) => [...l, { who: "you", text }]);
    setBusy(true);
    try {
      const r = await fetch("/api/venue/dialogue/sales-turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convoId.current, userText: text, state: stateRef.current }),
      });
      const d = await r.json();
      stateRef.current = d.nextState;
      setLines((l) => [...l, { who: "sales", text: d.reply.text }]);
      speak(d.reply.text, mode);
      if (d.done) setDone(d.outcome);
    } finally {
      setBusy(false);
    }
  }, [input, busy, mode]);

  // Step through the portal → fade to black, then travel back to the world.
  const returnToWorld = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      window.location.href = "/world";
    }, 700);
  }, []);

  // Press E near the stand to talk, or near the portal to leave.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Esc must close the conversation even while the chat input is focused — handle it first.
      if (e.key === "Escape" && open) {
        e.preventDefault();
        closeConvo();
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "e" || e.key === "E") && near && !open) openConvo();
      else if ((e.key === "o" || e.key === "O") && portalNear && !open) returnToWorld();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [near, portalNear, open, openConvo, closeConvo, returnToWorld]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="world-vignette absolute inset-0" />

      {/* THY wordmark overlay on the booth-side — rendered as UI, never baked into art. */}
      <div className="pointer-events-none absolute right-6 top-20 z-10 select-none font-mono text-xs font-bold tracking-widest text-[#e7eef5] opacity-80">
        ✈ TURKISH AIRLINES
      </div>

      {/* HUD */}
      <div className="panel absolute left-3 top-3 rounded px-3 py-2 font-mono text-[11px] text-parchment/80">
        <div className="glow-echo font-bold text-echo">ECHO × THY — fuar standı</div>
        <div>WASD / ok tuşları ya da tıkla · standa yaklaş, E ile konuş</div>
        <div className="text-parchment/50">canlı: {booked}/{total} rezervasyon</div>
      </div>

      {/* mode badge + dashboard link */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2 font-mono text-[11px]">
        {mode && (
          <span
            className={`panel rounded px-2 py-1 ${mode.dialogue === "live" ? "text-green-300" : "text-yellow-300"}`}
            title="Anahtar eklenince canlı moda geçer"
          >
            {mode.dialogue === "live" ? "● live" : "○ mock"} · {mode.label}
          </span>
        )}
        <Link href="/dashboard" className="panel rounded px-3 py-1 text-parchment hover:text-echo">
          dashboard →
        </Link>
      </div>

      {/* proximity prompt */}
      {near && !open && (
        <div className="panel absolute bottom-24 left-1/2 -translate-x-1/2 rounded px-4 py-2 font-mono text-sm text-parchment">
          THY temsilcisiyle konuşmak için <span className="font-bold text-echo">E</span>
        </div>
      )}

      {/* portal prompt — back to the world */}
      {portalNear && !near && !open && (
        <div className="panel absolute bottom-24 left-1/2 -translate-x-1/2 rounded px-4 py-2 font-mono text-sm text-parchment">
          Dünyaya dönmek için portala gir — <span className="font-bold text-echo">O</span>
        </div>
      )}

      {/* fade-to-black portal transition */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 bg-black transition-opacity duration-700 ${
          leaving ? "opacity-100" : "opacity-0"
        }`}
      />
      {leaving && (
        <div className="absolute inset-0 z-50 flex items-center justify-center font-mono text-sm italic text-parchment/80">
          portaldan geçiliyor…
        </div>
      )}

      {/* human conversation */}
      {open && (
        <div className="panel absolute bottom-4 left-1/2 z-30 w-[min(560px,94vw)] -translate-x-1/2 rounded-lg p-3 font-mono">
          <div className="mb-2 flex items-center justify-between">
            <span className="glow-echo font-bold text-echo">THY · satış temsilcisi</span>
            <button onClick={closeConvo} className="text-xs text-parchment/50 hover:text-parchment">kapat ✕</button>
          </div>
          <div className="mb-2 max-h-52 space-y-1 overflow-y-auto text-sm">
            {lines.map((l, i) => (
              <div key={i} className={l.who === "you" ? "text-parchment" : "text-echo"}>
                <span className="opacity-60">{l.who === "you" ? "sen" : "temsilci"}:</span> {l.text}
              </div>
            ))}
            {busy && <div className="text-parchment/40">…</div>}
          </div>
          {done ? (
            <div className="rounded border-2 border-echo/40 bg-echo/10 p-2 text-sm">
              {done.booked ? "✓ Rezervasyon alındı — iyi yolculuklar!" : `Bugün rezervasyon olmadı · sebep: ${done.noPurchaseReason ?? "—"}`}
              <button onClick={closeConvo} className="ml-2 rounded bg-echo px-2 py-1 text-xs font-bold text-ink">tamam</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="yanıtla…"
                autoFocus
                className="flex-1 rounded border-2 border-echo/30 bg-ink px-2 py-1 text-sm text-parchment outline-none focus:border-echo"
              />
              <button onClick={send} disabled={busy} className="rounded bg-echo px-3 py-1 text-sm font-bold text-ink disabled:opacity-50">
                gönder
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/** Play the salesperson line via TTS only when voice is live; otherwise no-op (text only). */
function speak(text: string, mode: ModeSummary | null) {
  if (!mode || mode.voice !== "live") return;
  fetch("/api/venue/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      if (!b) return;
      const a = new Audio(URL.createObjectURL(b));
      a.play().catch(() => {});
    })
    .catch(() => {});
}
