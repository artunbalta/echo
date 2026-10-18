"use client";

/**
 * Sound on or off (DECISIONS C56): one small button, top right beside the way back, and `M`. The
 * choice is the person's and is kept in this browser; the sound itself is the sound layer's
 * (`game/world/soundLayer.ts`), which starts on the first key or click because a browser will not
 * play before one.
 */
import { useEffect, useState } from "react";

import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { SoundLayer } from "@/game/world/soundLayer";

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

export default function SoundToggle({ world }: { world: () => PlanetWorld | null }) {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem("echo.sound") === "off");
    } catch {
      // nothing kept: sound on
    }
  }, []);

  const toggle = () => {
    const layer = world()?.context().layer<SoundLayer>("sound");
    const next = !(layer ? layer.muted() : muted);
    layer?.setMuted(next);
    setMuted(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing()) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <button
      type="button"
      data-sound-toggle={muted ? "off" : "on"}
      aria-pressed={!muted}
      aria-label={muted ? "Sound off — turn it on (M)" : "Sound on — turn it off (M)"}
      onClick={toggle}
      className="pointer-events-auto absolute right-[11.25rem] top-[1.9rem] z-30 rounded-full border border-white/15 bg-[#16241f]/75 px-3 py-1.5 font-pixel text-[10px] text-[#f4e9d0]/75 backdrop-blur-md transition hover:text-[#f4e9d0] max-sm:right-[6.25rem] max-sm:top-[0.9rem]"
    >
      {/* Beside the way off the page (the parcel page's link, top right), not under it. A phone has no `M`. */}
      <span className="max-sm:hidden">{muted ? "Sound off · M" : "Sound on · M"}</span>
      <span className="hidden max-sm:inline">{muted ? "♪ off" : "♪ on"}</span>
    </button>
  );
}
