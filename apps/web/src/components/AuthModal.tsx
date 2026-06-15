"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function AuthModal({
  open,
  mode: initialMode = "signin",
  onClose,
  onAuthed,
}: {
  open: boolean;
  mode?: Mode;
  onClose: () => void;
  onAuthed?: (email: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function finish() {
    const supa = getSupabase()!;
    const { data } = await supa.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      try {
        const r = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (j.userId) localStorage.setItem("echo.userId", j.userId);
      } catch {
        /* non-fatal: session is valid even if the profile sync hiccups */
      }
    }
    localStorage.setItem("echo.email", email);
    onAuthed?.(email);
    router.push("/onboard");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supa = getSupabase();
    if (!supa) {
      setError("Auth isn't configured in this environment.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 409) {
            setMode("signin");
            setError("That email already exists — log in instead.");
            setBusy(false);
            return;
          }
          setError(j.error || "Could not create your account.");
          setBusy(false);
          return;
        }
      }
      const { error: signErr } = await supa.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(
          /invalid login/i.test(signErr.message)
            ? "Wrong email or password."
            : signErr.message,
        );
        setBusy(false);
        return;
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 [color-scheme:light]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" />
      <div
        className="modal-card echo-rise relative w-full max-w-sm p-7"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-3 font-pixel text-lg text-[#444c66] transition hover:text-[#a8523a]"
        >
          ✕
        </button>

        <h2 className="section-title text-2xl">
          {mode === "signup" ? "Create your echo" : "Welcome back"}
        </h2>
        <p className="mt-1 font-pixel text-sm text-[#444c66]">
          {mode === "signup"
            ? "One account. Your first day begins after."
            : "Log in to step back into the country that does not exist."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="field"
            autoComplete="email"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="field"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          {error && (
            <p className="rounded-lg border-2 border-[#d27556]/40 bg-[#d27556]/10 px-3 py-2 font-pixel text-sm text-[#a8523a]">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-pixel w-full justify-center disabled:opacity-60">
            {busy ? "…" : mode === "signup" ? "Sign up" : "Log in"}
            <span className="chev" aria-hidden>›</span>
          </button>
        </form>

        <p className="mt-4 text-center font-pixel text-sm text-[#444c66]">
          {mode === "signup" ? "Already have an account? " : "New here? "}
          <button
            onClick={() => {
              setMode((m) => (m === "signup" ? "signin" : "signup"));
              setError(null);
            }}
            className="font-bold text-[#a8523a] underline-offset-2 hover:underline"
          >
            {mode === "signup" ? "Log in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
}
