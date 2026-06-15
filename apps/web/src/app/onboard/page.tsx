"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AvatarPreview from "@/components/AvatarPreview";
import { styleFromAttributes, styleFromId, type CharStyle } from "@/game/art";
import {
  createFromSelfie,
  createFromPremade,
  premadeStyles,
  type CharacterResult,
} from "@/lib/character";

type Step = "consent" | "choose" | "selfie" | "premade" | "reveal";

interface Consent {
  world: boolean;
  telemetry: boolean;
  voice: boolean;
  biometric: boolean;
}

export default function Onboard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("consent");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState<Consent>({
    world: true,
    telemetry: true,
    voice: false,
    biometric: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<CharStyle | null>(null);
  const [result, setResult] = useState<CharacterResult | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setName(localStorage.getItem("echo.name") ?? "");
  }, []);

  function userId(): string {
    let id = localStorage.getItem("echo.userId");
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("echo.userId", id);
    }
    return id;
  }

  // ── camera ──────────────────────────────────────────────────────────────────
  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Camera unavailable — you can still pick a premade character.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function captureSelfie() {
    const video = videoRef.current;
    if (!video) return;
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 384;
    const ctx = c.getContext("2d")!;
    // center-crop square
    const s = Math.min(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 384, 384);
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    stopCamera();

    setBusy("Reading your style… (your photo is processed, then discarded)");
    try {
      const res = await createFromSelfie(dataUrl, userId());
      setResult(res);
      setStyle(styleFromAttributes(res.attributes, userId()));
      setStep("reveal");
    } catch {
      setError("Generation failed. Try again or pick a premade.");
    } finally {
      setBusy(null);
    }
  }

  async function pickPremade(id: string) {
    setBusy("Preparing your character…");
    try {
      const res = await createFromPremade(id, userId());
      setResult(res);
      setStyle(styleFromId(id));
      setStep("reveal");
    } catch {
      setError("Could not prepare that character.");
    } finally {
      setBusy(null);
    }
  }

  function enterWorld() {
    if (!result) return;
    localStorage.setItem("echo.name", name.trim() || "Newcomer");
    localStorage.setItem("echo.consent", JSON.stringify(consent));
    localStorage.setItem(
      "echo.character",
      JSON.stringify({ spriteUrl: result.spriteUrl, attributes: result.attributes, source: result.source }),
    );
    router.push("/world");
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-ink p-4">
      <div className="panel w-full max-w-xl rounded-lg p-6 font-mono text-parchment">
        <div className="mb-1 flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-md bg-[#f3ecd9] p-0.5"
          />
          <h1 className="text-2xl font-bold text-echo">ECHO</h1>
        </div>
        <p className="mb-5 text-xs text-parchment/60">first day · {step}</p>

        {error && <div className="mb-3 rounded border border-red-400/40 bg-red-900/20 p-2 text-xs text-red-200">{error}</div>}
        {busy && <div className="mb-3 rounded border border-echo/40 bg-echo/10 p-2 text-xs">{busy}</div>}

        {/* CONSENT */}
        {step === "consent" && (
          <div>
            <p className="mb-4 text-sm text-parchment/80">
              Before you step through, choose what this place may learn from you. You can change
              your mind anytime, and erase everything later.
            </p>
            {([
              ["world", "Join the shared world", "Be present and visible to others.", true],
              ["telemetry", "Learn from how I behave", "Movement, approach/avoid, hesitation, reply timing — the revealed-preference signal.", false],
              ["voice", "Voice", "Push-to-talk conversations and the spoken narrator.", false],
              ["biometric", "Use a selfie for my character", "A photo is processed to derive style only, then discarded. Never stored.", false],
            ] as const).map(([key, label, desc, required]) => (
              <label key={key} className="mb-2 flex cursor-pointer items-start gap-3 rounded border-2 border-echo/20 p-3 hover:border-echo/40">
                <input
                  type="checkbox"
                  checked={consent[key]}
                  disabled={required}
                  onChange={(e) => setConsent((c) => ({ ...c, [key]: e.target.checked }))}
                  className="mt-1 accent-echo"
                />
                <span>
                  <span className="block text-sm font-bold">{label}{required && <span className="text-echo"> (required)</span>}</span>
                  <span className="block text-xs text-parchment/60">{desc}</span>
                </span>
              </label>
            ))}
            <button onClick={() => setStep("choose")} className="mt-4 w-full rounded bg-echo px-4 py-2 font-bold text-ink">
              Continue →
            </button>
          </div>
        )}

        {/* CHOOSE PATH */}
        {step === "choose" && (
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should people call you?"
              className="mb-4 w-full rounded border-2 border-echo/30 bg-ink px-3 py-2 text-center outline-none focus:border-echo"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={!consent.biometric}
                onClick={() => { setStep("selfie"); startCamera(); }}
                className="rounded border-2 border-echo/40 p-4 text-left text-sm enabled:hover:border-echo disabled:opacity-40"
              >
                <span className="block font-bold text-echo">Selfie →</span>
                <span className="text-xs text-parchment/60">
                  {consent.biometric ? "A character that looks like you." : "Enable selfie consent first."}
                </span>
              </button>
              <button onClick={() => setStep("premade")} className="rounded border-2 border-echo/40 p-4 text-left text-sm hover:border-echo">
                <span className="block font-bold text-echo">Premade →</span>
                <span className="text-xs text-parchment/60">Pick from a curated set.</span>
              </button>
            </div>
            <button onClick={() => setStep("consent")} className="mt-4 text-xs text-parchment/50 hover:text-parchment">← back</button>
          </div>
        )}

        {/* SELFIE */}
        {step === "selfie" && (
          <div className="text-center">
            <video ref={videoRef} className="mx-auto mb-3 h-64 w-64 rounded border-2 border-echo/40 object-cover" muted playsInline />
            <p className="mb-3 text-xs text-parchment/60">Your photo is sent once for style analysis and then discarded — never stored.</p>
            <div className="flex justify-center gap-2">
              <button onClick={captureSelfie} disabled={!!busy} className="rounded bg-echo px-4 py-2 font-bold text-ink disabled:opacity-50">Capture</button>
              <button onClick={() => { stopCamera(); setStep("choose"); }} className="rounded border border-echo/40 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* PREMADE */}
        {step === "premade" && (
          <div>
            <div className="grid grid-cols-4 gap-2">
              {premadeStyles(8).map((p) => (
                <button key={p.id} onClick={() => pickPremade(p.id)} disabled={!!busy} className="rounded border-2 border-echo/20 bg-grass/20 p-1 hover:border-echo">
                  <img src={p.dataUrl} alt={p.id} className="pixel mx-auto" style={{ imageRendering: "pixelated", width: 48 }} />
                </button>
              ))}
            </div>
            <button onClick={() => setStep("choose")} className="mt-4 text-xs text-parchment/50 hover:text-parchment">← back</button>
          </div>
        )}

        {/* REVEAL */}
        {step === "reveal" && style && (
          <div className="text-center">
            <p className="mb-3 text-sm text-parchment/80">This is your echo.</p>
            <div className="mb-4 flex items-center justify-center gap-6">
              <div className="rounded-lg bg-grass/30 p-4"><AvatarPreview style={style} scale={5} /></div>
              {result?.portraitUrl ? (
                <img src={result.portraitUrl} alt="portrait" className="pixel h-32 w-32 rounded-lg border-2 border-echo/40" style={{ imageRendering: "pixelated" }} />
              ) : null}
            </div>
            {result?.source === "selfie" && result.attributes && (
              <p className="mb-3 text-xs text-parchment/50">
                derived: {Object.entries(result.attributes).filter(([, v]) => v && (!Array.isArray(v) || v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`).join(" · ") || "neutral"}
              </p>
            )}
            <button onClick={enterWorld} className="w-full rounded bg-echo px-4 py-3 font-bold text-ink">Step through →</button>
          </div>
        )}
      </div>
    </main>
  );
}
