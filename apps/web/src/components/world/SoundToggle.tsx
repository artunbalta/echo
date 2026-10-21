"use client";

/**
 * Sound on or off (DECISIONS C56), and `M`. The choice is the person's and is kept in this browser;
 * the sound itself is the sound layer's (`game/world/soundLayer.ts`), which starts on the first key or
 * click because a browser will not play before one.
 *
 * It was a button of its own at the top right; it is a line of the HUD's menu now (C68), so this is
 * the state and the key, and the HUD draws it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { SoundLayer } from "@/game/world/soundLayer";

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

export function useSound(world: () => PlanetWorld | null): { muted: boolean; toggle: () => void } {
  const [muted, setMuted] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    try {
      was.current = localStorage.getItem("echo.sound") === "off";
      setMuted(was.current);
    } catch {
      // nothing kept: sound on
    }
  }, []);

  // The layer is asked first, because it is what is actually playing; the side effect stays out of a
  // state updater, which StrictMode runs twice.
  const toggle = useCallback(() => {
    const layer = world()?.context().layer<SoundLayer>("sound");
    const next = !(layer ? layer.muted() : was.current);
    layer?.setMuted(next);
    was.current = next;
    setMuted(next);
  }, [world]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing()) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return { muted, toggle };
}
