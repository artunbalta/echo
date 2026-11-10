"use client";

/**
 * The page's side of the moments (DECISIONS C86, C87). It draws nothing: the moments layer plays them out,
 * and this sends the measurement when the stranger walks past one whose passing is data (`pass_by`,
 * `withdraw`, `deviate_custom`, `group_avoid`; a greeting let go unanswered, `opener_silent`), with the arm
 * of its experiment, as the director's page does for a staging (C63); and when a promise made to a
 * villager comes to nothing (`promise_broken`, C87). Acts on a moment are measured where every act is
 * (`Interact.tsx`). Consent permitting, always: the chain refuses otherwise.
 *
 * In a pilot visit it also keeps the research record (C87): every moment the stranger saw, as it ended,
 * with its arm and what became of it, sent to the pilot in batches (`POST /api/pilot?op=moments`) and
 * once more as the page closes. That record never goes to the engine.
 */
import { useEffect, useRef } from "react";
import { MOMENTS, type ThingKind } from "@echo/planet";

import { identityHeaders } from "@/lib/identity";
import type { InteractLayer } from "@/game/world/interactLayer";
import type { MeasureChain } from "@/game/world/measure";
import type { MomentsLayer, SeenMoment } from "@/game/world/momentsLayer";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import { targetKindOf } from "@/lib/acts";

/** How often to look for the layer while the world is still being built. */
const LOOK_MS = 1500;
/** The pilot's record goes in batches: this often, or at this many, whichever is first (C87). */
const SEND_MS = 20_000;
const SEND_AT = 12;

/** Send what has been kept of the moments met; `closing` keeps the request alive as the page goes. */
async function send(rows: SeenMoment[], closing = false): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const res = await fetch("/api/pilot?op=moments", {
      method: "POST",
      headers: identityHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ moments: rows }),
      keepalive: closing,
    });
    // Refused for good (no visit, not in the study, a row it will not take): nothing to send again.
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
  } catch {
    return false;
  }
}

export default function Moments({ world, chain, pilot = null }: { world: () => PlanetWorld | null; chain: MeasureChain; pilot?: { n: number } | null }) {
  const worldRef = useRef(world);
  worldRef.current = world;
  const inPilot = !!pilot;

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

  // The pilot's research record (C87): every moment seen, kept and sent in batches; once more on the way out.
  useEffect(() => {
    if (!inPilot) return;
    let layer: MomentsLayer | null = null;
    let queue: SeenMoment[] = [];
    let sending = false;
    const flush = async (closing = false) => {
      if (sending && !closing) return;
      const rows = queue.splice(0, 40);
      if (!rows.length) return;
      sending = true;
      const ok = await send(rows, closing);
      sending = false;
      // Not taken this time (offline, busy): kept for the next batch, a visit's worth at most.
      if (!ok) queue = [...rows, ...queue].slice(0, 400);
    };
    const hook = () => {
      const l = worldRef.current()?.context().layer<MomentsLayer>("moments") ?? null;
      if (!l || l === layer) return;
      layer = l;
      l.onSeen((row) => {
        queue.push(row);
        if (queue.length >= SEND_AT) void flush();
      });
    };
    const closing = () => {
      layer?.settle();
      void flush(true);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    hook();
    const look = setInterval(hook, LOOK_MS);
    const tick = setInterval(() => void flush(), SEND_MS);
    window.addEventListener("pagehide", closing);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(look);
      clearInterval(tick);
      window.removeEventListener("pagehide", closing);
      document.removeEventListener("visibilitychange", hidden);
      // The visit's world is going (its end, or leaving): what is still going on is reported as it stands.
      layer?.settle();
      layer?.onSeen(null);
      void flush(true);
    };
  }, [inPilot]);

  return null;
}
