"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// PixiJS touches the DOM/WebGL — load the world scene only in the browser.
// /play is the canonical front door: ONE shared ocean. You spawn on your own island (Flow 0,
// solitary) and others render as sharp, visible people across the water (names resolve as you near).
const WorldClient = dynamic(() => import("@/components/WorldClient"), { ssr: false });

/**
 * Onboarding guard. The proper entry flow is sign-in → /onboard (selfie / character / consent) →
 * /play → your island. A signed-in player who reaches /play WITHOUT having completed onboarding
 * (no character created yet) is sent to /onboard first, then dropped onto their island.
 *
 * The `?u=<name>` override is the zero-key two-tab test path (two browsers join as adjacent
 * islanders) — it intentionally bypasses onboarding so the world stays runnable with no keys.
 */
export default function PlayPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const override = (new URLSearchParams(window.location.search).get("u") || "").trim();
    if (override) {
      setReady(true); // test/dev identity override — skip the onboarding gate
      return;
    }
    let onboarded = false;
    try {
      onboarded = !!JSON.parse(localStorage.getItem("echo.character") ?? "{}").spriteUrl;
    } catch {
      /* malformed → treat as not onboarded */
    }
    if (!onboarded) {
      router.replace("/onboard"); // selfie / character / consent first, then it returns to /play
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-ink font-mono text-sm text-parchment/70">
        stepping through…
      </main>
    );
  }
  return <WorldClient />;
}
