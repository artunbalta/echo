"use client";

/**
 * The page's side of the director (DECISIONS C63). It draws nothing of its own: it asks, and hands
 * what comes back to the director layer.
 *
 * - **Only with consent.** The director exists to teach the echo, and with nobody listening there is
 *   nothing for it to do; without consent it never asks, and what stands is taken away.
 * - **On arriving**, it asks what still stands here for this stranger (a reload finds the gull where
 *   it was).
 * - **Now and then** (first after `FIRST_MS`, then every `EVERY_MS`) it asks whether something should
 *   be set out. The route decides, with the engine; most answers are no.
 * - **Walking past** the gull or the mark is the layer's to notice; this records it and sends the
 *   measurement the situation names (`pass_by`, or the mark's refusal), consent permitting.
 */
import { useEffect, useRef } from "react";
import { SITUATIONS, type ThingKind } from "@echo/planet";

import type { DirectorLayer, ShownStaging } from "@/game/world/directorLayer";
import type { InteractLayer } from "@/game/world/interactLayer";
import type { ConsentState, MeasureChain } from "@/game/world/measure";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import { targetKindOf } from "@/lib/acts";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

/** The first question after arriving: time to look around first. */
export const FIRST_MS = 40_000;
/** Then this often. The route keeps its own, longer, gaps; this is only how often it is asked. */
export const EVERY_MS = 120_000;
/** A demo visitor's five minutes (C72): the server lets one be set out every forty seconds, so ask often. */
export const DEMO_FIRST_MS = 12_000;
export const DEMO_EVERY_MS = 25_000;

export default function Director({ world, cell, consent, chain, pace = "world" }: { world: () => PlanetWorld | null; cell: string; consent: ConsentState; chain: MeasureChain; pace?: "world" | "demo" }) {
  const worldRef = useRef(world);
  worldRef.current = world;

  useEffect(() => {
    const layer = () => worldRef.current()?.context().layer<DirectorLayer>("director") ?? null;
    if (consent !== "accepted") {
      layer()?.set(null);
      return;
    }
    let live = true;
    const headers = () => identityHeaders({ "content-type": "application/json" });

    const passed = async (s: ShownStaging, distM: number) => {
      const interact = worldRef.current()?.context().layer<InteractLayer>("interact");
      const at = interact?.bodyAt();
      if (!at) return;
      try {
        const res = await fetch("/api/world/director", { method: "POST", headers: headers(), body: JSON.stringify({ op: "pass", id: s.id, at }) });
        if (!res.ok || !live) return;
        const sit = SITUATIONS[s.situation];
        if (sit.passed && chain.armed()) {
          const audience = interact?.audience(at.x, at.y) ?? 0;
          void chain.emitAction(sit.passed.action, {
            cue: sit.passed.cue as never,
            channel: sit.passed.channel as never,
            polarity: sit.passed.polarity,
            raw: { distance: Number(distM.toFixed(1)) },
            target: { id: `staged:${s.id}`, kind: targetKindOf(sit.kind as ThingKind) },
            contextOverride: { stakes: "medium", audience_size: audience, public_or_private: audience > 0 ? "public" : "private", counterpart_status: "none" },
          });
        }
        layer()?.set(null);
      } catch {
        // the walk past is simply not recorded; it is never a penalty either way
      }
    };

    const ask = async (op: "look" | "ask") => {
      const l = layer();
      if (!l || !live) return;
      l.onPassed((s, d) => void passed(s, d));
      if (op === "ask" && l.staging()) return;
      try {
        await ensureIdentity();
        if (op === "look") {
          const res = await fetch(`/api/world/director?cell=${encodeURIComponent(cell)}`, { headers: identityHeaders() });
          const data = (await res.json().catch(() => ({}))) as { staging?: ShownStaging | null };
          if (live) l.set(data.staging ?? null);
          return;
        }
        const at = worldRef.current()?.context().layer<InteractLayer>("interact")?.bodyAt();
        if (!at) return;
        const res = await fetch("/api/world/director", { method: "POST", headers: headers(), body: JSON.stringify({ op: "ask", cell, at }) });
        const data = (await res.json().catch(() => ({}))) as { staging?: ShownStaging | null };
        if (live && data.staging) l.set(data.staging);
      } catch {
        // asked again next time
      }
    };

    void ask("look");
    const first = setTimeout(() => void ask("ask"), pace === "demo" ? DEMO_FIRST_MS : FIRST_MS);
    const every = setInterval(() => void ask("ask"), pace === "demo" ? DEMO_EVERY_MS : EVERY_MS);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(every);
      layer()?.onPassed(null);
    };
  }, [cell, consent, chain, pace]);

  return null;
}
