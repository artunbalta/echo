/**
 * Higgsfield provider — official @higgsfield/client SDK (Soul model).
 * Verified usage (github.com/higgsfield-ai/higgsfield-js, 2026-06):
 *
 *   const client = new HiggsfieldClient();            // env HF_API_KEY + HF_SECRET
 *   const jobSet = await client.generate('/v1/text2image/soul', {
 *     prompt, input_images:[InputImage.fromUrl(selfie)], style_strength,
 *     width_and_height: SoulSize..., quality: SoulQuality.HD,
 *   }, { withPolling: true });
 *   const url = jobSet.jobs[0].results?.raw.url;
 *
 * The SDK is an OPT-IN dependency: install it (`npm i @higgsfield/client -w @echo/web`)
 * to activate. We import it dynamically so its absence never breaks the build — if it's
 * not installed, this provider throws and the caller falls back to the next provider.
 */
import { buildArtPrompt, type ArtProvider, type PortraitRequest, type PortraitResult } from "./types";

export const higgsfieldProvider: ArtProvider = {
  name: "higgsfield",
  async generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
    if (!process.env.HF_API_KEY || !process.env.HF_SECRET)
      throw new Error("HF_API_KEY / HF_SECRET not set");

    let mod: any;
    let helpers: any;
    // Indirected specifiers so the bundler/TS never statically resolve an opt-in SDK
    // that may not be installed; it's loaded only at runtime when ART_PROVIDER=higgsfield.
    const pkg = "@higgsfield/client";
    try {
      mod = await import(/* webpackIgnore: true */ pkg);
      helpers = await import(/* webpackIgnore: true */ `${pkg}/helpers`);
    } catch {
      throw new Error("@higgsfield/client not installed (npm i @higgsfield/client -w @echo/web)");
    }
    const { HiggsfieldClient } = mod;

    const client = new HiggsfieldClient();
    const input: Record<string, unknown> = {
      prompt: buildArtPrompt(req.attributes),
      width_and_height: helpers.SoulSize?.SQUARE_1536x1536,
      quality: helpers.SoulQuality?.HD,
    };
    if (req.selfieUrl && helpers.InputImage) {
      input.input_images = [helpers.InputImage.fromUrl(req.selfieUrl)];
      if (helpers.strength) input.style_strength = helpers.strength(0.75);
    }

    const jobSet = await client.generate("/v1/text2image/soul", input, { withPolling: true });
    const url = jobSet?.jobs?.[0]?.results?.raw?.url;
    if (!url) throw new Error("Higgsfield returned no image");
    return { url, provider: "higgsfield", placeholder: false };
  },
};
