"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AvatarPreview from "@/components/AvatarPreview";
import { resolveUserId } from "@/lib/identity";
import { styleFromAttributes, styleFromId, type CharStyle } from "@/game/art";
import {
  createFromSelfie,
  createFromPremade,
  type CharacterResult,
} from "@/lib/character";

type Step = "consent" | "select" | "selfie" | "reveal";

interface Consent {
  world: boolean;
  telemetry: boolean;
  voice: boolean;
  biometric: boolean;
}

// Hand-picked (not the first N ids) so the row shows all four hair-style "types" once each
// instead of risking a hash collision that repeats a label across two cards.
const PREMADE_IDS = ["premade_5", "premade_2", "premade_0", "premade_1"];
const CUSTOM_ID = "custom";

/** The only per-premade differentiator we have (hair silhouette) doubles as a lightweight
 *  "type" tag — deliberately not a personal name, since these are anonymous stand-ins. */
function typeLabel(style: CharStyle): string {
  return style.hairStyle.charAt(0).toUpperCase() + style.hairStyle.slice(1);
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
  const [selectedId, setSelectedId] = useState<string>(PREMADE_IDS[0]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Computed once — feeds stable CharStyle objects to AvatarPreview so its animation
  // loop doesn't tear down and restart on every keystroke in the name field.
  const premades = useMemo(
    () => PREMADE_IDS.map((id) => ({ id, style: styleFromId(id) })),
    [],
  );

  useEffect(() => {
    setName(localStorage.getItem("echo.name") ?? "");
  }, []);

  // The ONE canonical id (bare form, no "u_" prefix) — same resolver the world uses, so the
  // character created here is written under exactly the id the world reads/writes later.
  function userId(): string {
    return resolveUserId();
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

  function confirmSelection() {
    if (selectedId === CUSTOM_ID) {
      setStep("selfie");
      startCamera();
      return;
    }
    pickPremade(selectedId);
  }

  function enterWorld() {
    if (!result) return;
    localStorage.setItem("echo.name", name.trim() || "Newcomer");
    localStorage.setItem("echo.consent", JSON.stringify(consent));
    localStorage.setItem(
      "echo.character",
      JSON.stringify({ spriteUrl: result.spriteUrl, attributes: result.attributes, source: result.source }),
    );
    router.push("/play"); // canonical entry: your own island, Flow 0 ("Waking Alone")
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-ink p-4">
      <div className={`panel w-full rounded-lg p-6 font-mono text-parchment ${step === "select" ? "max-w-2xl" : "max-w-xl"}`}>
        <div className="mb-1 flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-md bg-[#f3ecd9] p-0.5"
          />
          <h1 className="font-pixel text-2xl font-bold text-echo glow-echo">echo</h1>
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
            <button onClick={() => setStep("select")} className="mt-4 w-full rounded bg-echo px-4 py-2 font-bold text-ink">
              Continue →
            </button>
          </div>
        )}

        {/* SELECT CHARACTER — premade cast + "create your own", one unified screen */}
        {step === "select" && (
          <div>
            <h2 className="mb-4 text-center font-pixel text-base font-bold uppercase tracking-[0.2em] text-echo glow-echo">
              Select Character
            </h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should people call you?"
              className="mb-5 w-full rounded border-2 border-echo/30 bg-ink px-3 py-2 text-center outline-none focus:border-echo"
            />
            <div className="mb-5 grid grid-cols-5 gap-2">
              {premades.map(({ id, style: s }, i) => {
                const selected = selectedId === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedId(id)}
                    disabled={!!busy}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-2 transition-colors disabled:opacity-50 ${
                      selected ? "border-echo bg-echo/10" : "border-echo/20 bg-grass/10 hover:border-echo/50"
                    }`}
                  >
                    <div className="char-bob flex h-24 w-16 items-end justify-center" style={{ animationDelay: `${i * 0.3}s` }}>
                      <AvatarPreview style={s} scale={4} />
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-parchment/70">{typeLabel(s)}</span>
                  </button>
                );
              })}
              <button
                onClick={() => consent.biometric && setSelectedId(CUSTOM_ID)}
                disabled={!consent.biometric || !!busy}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  selectedId === CUSTOM_ID ? "border-echo bg-echo/10" : "border-echo/25 hover:border-echo/50"
                }`}
              >
                <div className="flex h-24 w-16 items-center justify-center text-3xl leading-none text-echo/70">+</div>
                <span className="text-center text-[10px] uppercase tracking-wide text-parchment/70">
                  {consent.biometric ? "Create Your Own" : "Enable selfie consent"}
                </span>
              </button>
            </div>
            <button
              onClick={confirmSelection}
              disabled={!!busy}
              className="w-full rounded bg-echo px-4 py-3 font-pixel font-bold uppercase tracking-widest text-ink disabled:opacity-50"
            >
              Play »»»
            </button>
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
              <button onClick={() => { stopCamera(); setStep("select"); }} className="rounded border border-echo/40 px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* REVEAL */}
        {step === "reveal" && style && (
          <div className="text-center">
            <p className="mb-1 text-sm text-parchment/80">This is you, here.</p>
            <div className="mb-3 flex items-center justify-center gap-6">
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
            <p className="mb-4 text-xs leading-relaxed text-parchment/60">
              The figure is how the world sees you. Your <span className="text-echo">echo</span> is what&apos;s
              about to start learning you — from how you move, talk, and hesitate — until, one day, it can
              act as you.
            </p>
            <button onClick={enterWorld} className="w-full rounded bg-echo px-4 py-3 font-bold text-ink">Step through →</button>
          </div>
        )}
      </div>
    </main>
  );
}
