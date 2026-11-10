"use client";

/**
 * The page's side of the moments (DECISIONS C86, C87). It draws nothing: the moments layer plays them out,
 * and this sends the measurement when the stranger walks past one whose passing is data (`pass_by`,
 * `withdraw`, `deviate_custom`, `group_avoid`; a greeting let go unanswered, `opener_silent`), with the arm
 * of its experiment, as the director's page does for a staging (C63); and when a promise made to a
 * villager comes to nothing (`promise_broken`, C87). Acts on a moment are measured where every act is
 * (`Interact.tsx`). Consent permitting, always: the chain refuses otherwise.
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
      const audienceNow = () => {
        const interact = worldRef.current()?.context().layer<InteractLayer>("interact");
        const at = interact?.bodyAt();
        return at ? (interact?.audience(at.x, at.y) ?? 0) : 0;
      };
      l.onPassed((kind, ref, distM, arm) => {
        const passed = MOMENTS[kind].passed;
        if (!passed || !chain.armed()) return;
        const seen = audienceNow() + (arm?.context?.audience_size ?? 0);
        void chain.emitAction(passed.action, {
          cue: passed.cue as never,
          channel: passed.channel as never,
          polarity: "take",
          raw: { distance: Number(distM.toFixed(1)), ...(arm ? { ...arm.raw, arm: arm.id } : {}) },
          target: { id: ref, kind: targetKindOf(kind as ThingKind) },
          contextOverride: {
            stakes: arm?.context?.stakes ?? "low",
            audience_size: seen,
            public_or_private: arm?.context?.public_or_private ?? (seen > 0 ? "public" : "private"),
            counterpart_status: arm?.context?.counterpart_status ?? (kind === "well-custom" ? "none" : "stranger"),
            ...(arm?.context?.time_pressure !== undefined ? { time_pressure: arm.context.time_pressure } : {}),
          },
        });
      });
      // A promise made to a villager and never kept (C87): the loaf never brought to her mother's door.
      l.onBroken((kind, ref, arm) => {
        if (!chain.armed()) return;
        const seen = audienceNow();
        void chain.emitAction("promise_broken", {
          cue: "G7" as never,
          channel: "G" as never,
          polarity: "refuse",
          raw: { ...(arm ? { ...arm.raw, arm: arm.id } : {}) },
          target: { id: ref, kind: targetKindOf(kind as ThingKind) },
          contextOverride: { stakes: "medium", audience_size: seen, public_or_private: seen > 0 ? "public" : "private", counterpart_status: "stranger", ...(arm?.context?.time_pressure !== undefined ? { time_pressure: arm.context.time_pressure } : {}) },
        });
      });
    };
    hook();
    const timer = setInterval(hook, LOOK_MS);
    return () => {
      clearInterval(timer);
      layer?.onPassed(null);
      layer?.onBroken(null);
    };
  }, [chain]);

  return null;
}
