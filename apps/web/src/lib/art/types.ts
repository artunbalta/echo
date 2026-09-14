/**
 * Art generation provider interface (§3, §6). Server-only — providers hold secret keys
 * and must never run in the browser (Fal's docs explicitly warn against exposing FAL_KEY
 * client-side). Selected by ART_PROVIDER; all are swappable behind this interface.
 */
import type { CharacterAttributes } from "@echo/shared";

export interface PortraitRequest {
  attributes: CharacterAttributes;
  /**
   * Canonical pixel-art style anchor (ART_STYLE_REFERENCE). SERVER-SIDE, from the environment —
   * this is the only image URL a portrait job may be conditioned on.
   *
   * THERE USED TO BE A `selfieUrl` HERE and it is deliberately gone rather than validated.
   * `api/portrait/route.ts` read it straight out of an unauthenticated request body and the
   * providers handed it to the paid backend — `input.image_url = req.selfieUrl` in `fal.ts`,
   * `InputImage.fromUrl(req.selfieUrl)` in `higgsfield.ts` — so any caller could make this
   * project's image-generation account fetch a URL of their choosing and generate from it, on this
   * project's credentials. MEASURED: it had no sender. `lib/character.ts` posts `{ attributes }`,
   * and every other `selfieUrl` in the tree belongs to the waitlist pipeline, which is server-side
   * and uploads to fal storage itself. Removing it from the TYPE rather than filtering it at the
   * route is `⚑27`'s move for `ownerId`: the passthrough cannot come back without a type change,
   * so a later author adding it out of symmetry has nothing to add it to.
   */
  styleReferenceUrl?: string;
}

export interface PortraitResult {
  url: string;
  provider: "mock" | "fal" | "higgsfield";
  /** True when this is a placeholder (no real generation happened). */
  placeholder: boolean;
}

export interface ArtProvider {
  name: "mock" | "fal" | "higgsfield";
  /** Generate a high-fidelity pixel-art portrait in the reference style. */
  generatePortrait(req: PortraitRequest): Promise<PortraitResult>;
}

/** Build the generation prompt from attributes + style anchoring (§6.3). */
export function buildArtPrompt(attrs: CharacterAttributes): string {
  const parts: string[] = [
    "16-bit top-down RPG character portrait, pixel art, crisp nearest-neighbor pixels,",
    "limited palette, transparent background, friendly proportions,",
  ];
  if (attrs.hairColor || attrs.hairStyle)
    parts.push(`${attrs.hairColor ?? ""} ${attrs.hairStyle ?? ""} hair,`.trim());
  if (attrs.skinTone) parts.push(`${attrs.skinTone} skin,`);
  if (attrs.glasses) parts.push("wearing glasses,");
  if (attrs.facialHair) parts.push(`${attrs.facialHair},`);
  if (attrs.accessories?.length) parts.push(`${attrs.accessories.join(", ")},`);
  if (attrs.vibe?.length) parts.push(`vibe: ${attrs.vibe.join(", ")},`);
  parts.push("in the exact style of the reference image.");
  return parts.join(" ");
}
