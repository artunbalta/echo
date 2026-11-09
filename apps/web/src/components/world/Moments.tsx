"use client";

/**
 * The page's side of the moments (DECISIONS C86). It draws nothing: the moments layer plays them out,
 * and this sends the measurement when the stranger walks past one whose passing is data (`pass_by`,
 * `withdraw`, `deviate_custom`, `group_avoid`), as the director's page does for a staging (C63). Acts
 * on a moment are measured where every act is (`Interact.tsx`). Consent permitting, always: the chain
 * refuses otherwise.
 */
import { useEffect, useRef } from "react";
import { MOMENTS, type ThingKind } from "@echo/planet";

import type { InteractLayer } from "@/game/world/interactLayer";
import type { MeasureChain } from "@/game/world/measure";
import type { MomentsLayer } from "@/game/world/momentsLayer";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import { targetKindOf } from "@/lib/acts";

/** How often to look for the layer while the world is still being built. */
const LOOK_MS = 1500;

export default function Moments({ world, chain }: { world: () => PlanetWorld | null; chain: MeasureChain }) {
  const worldRef = useRef(world);
  worldRef.current = world;

  useEffect(() => {
    let layer: MomentsLayer | null = null;
    const hook = () => {
      const ctx = worldRef.current()?.context();
      const l = ctx?.layer<MomentsLayer>("moments") ?? null;
      if (!l || l === layer) return;
      layer = l;
      l.onPassed((kind, ref, distM) => {
        const passed = MOMENTS[kind].passed;
        if (!passed || !chain.armed()) return;
        const interact = worldRef.current()?.context().layer<InteractLayer>("interact");
        const at = interact?.bodyAt();
        const audience = at ? (interact?.audience(at.x, at.y) ?? 0) : 0;
        void chain.emitAction(passed.action, {
          cue: passed.cue as never,
          channel: passed.channel as never,
          polarity: "take",
          raw: { distance: Number(distM.toFixed(1)) },
          target: { id: ref, kind: targetKindOf(kind as ThingKind) },
          contextOverride: { stakes: "low", audience_size: audience, public_or_private: audience > 0 ? "public" : "private", counterpart_status: kind === "well-custom" ? "none" : "stranger" },
        });
      });
    };
    hook();
    const timer = setInterval(hook, LOOK_MS);
    return () => {
      clearInterval(timer);
      layer?.onPassed(null);
    };
  }, [chain]);

  return null;
}
