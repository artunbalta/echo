/**
 * Provider selector. ART_PROVIDER picks the primary; on failure we degrade gracefully
 * (higgsfield → fal → mock) so onboarding never hard-fails on a generation hiccup (§6
 * edge cases). The mock returns a placeholder portrait so the flow runs with no keys.
 */
import "server-only";
import type { ArtProvider, PortraitRequest, PortraitResult } from "./types";
import { falProvider } from "./fal";
import { higgsfieldProvider } from "./higgsfield";

const mockProvider: ArtProvider = {
  name: "mock",
  async generatePortrait(_req: PortraitRequest): Promise<PortraitResult> {
    // No external call; the attribute-driven sprite sheet (client) is the real avatar.
    return { url: "", provider: "mock", placeholder: true };
  },
};

function chain(): ArtProvider[] {
  const primary = (process.env.ART_PROVIDER ?? "mock").toLowerCase();
  const order: ArtProvider[] = [];
  if (primary === "higgsfield") order.push(higgsfieldProvider, falProvider);
  else if (primary === "fal") order.push(falProvider, higgsfieldProvider);
  order.push(mockProvider);
  return order;
}

export async function generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
  let lastErr: unknown;
  for (const p of chain()) {
    try {
      return await p.generatePortrait(req);
    } catch (err) {
      lastErr = err;
      console.warn(`[art] provider ${p.name} failed:`, (err as Error).message);
    }
  }
  console.warn("[art] all providers failed, returning placeholder", lastErr);
  return { url: "", provider: "mock", placeholder: true };
}
