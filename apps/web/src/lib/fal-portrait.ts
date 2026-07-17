import "server-only";
import { fal } from "@fal-ai/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Generate a roster portrait from someone's selfie, via FAL.
 *
 * THE ENDPOINT IS NOT THE ONE IN THE BRIEF, and the correction is measured, not preferred:
 * `fal-ai/wan/v2.6/image-to-image` DOES NOT EXIST. FAL's queue accepts any path under a valid app
 * and only 404s at execution ("Path /v2.6/image-to-image not found"), which is why it looks alive
 * from the outside. FAL's own schema API lists exactly two Wan image-to-image endpoints:
 *
 *   fal-ai/wan-25-preview/image-to-image   -> image_urls[] (multi-ref), enable_safety_checker,
 *                                             seed, image_size, negative_prompt.  NO prompt-expansion knob.
 *   fal-ai/wan/v2.2-a14b/image-to-image    -> enable_prompt_expansion, strength.  SINGLE image_url only.
 *
 * No endpoint has both multi-reference AND enable_prompt_expansion. Multi-reference wins: the style
 * anchor is what makes the output land next to the eight, and it cannot be faked with a prompt.
 * `enable_prompt_expansion: false` is therefore not sent — it is not a parameter on this endpoint,
 * so there is no LLM rewrite to disable. (It IS returned as `actual_prompt` in the response, which
 * the caller logs, so any rewriting is at least visible rather than silent.)
 */

/** The roster's style contract, lifted verbatim from pipeline/generate-roster-portraits.mjs so the
 *  runtime path and the CLI path cannot drift apart in prose. */
const STYLE =
  "TRUE 16-bit pixel art, in the style of a Super Nintendo RPG character portrait. This is NOT a " +
  "smooth digital painting with a pixel filter over it: it is drawn pixel by pixel on a single " +
  "coarse grid. CRITICAL: the face is drawn at exactly the SAME coarse pixel density as the " +
  "clothing and hair — no smooth airbrushed skin, no finely rendered eyes on a blocky body, no " +
  "anti-aliasing, no soft gradients, no blur. Shading is done in FLAT STEPPED BANDS of colour, at " +
  "most two shadow steps per material, with hard edges between them. A selective 1px dark ink " +
  "outline on the figure's lit edges only. Very limited palette, roughly 20 flat colours total.";
const LIGHT =
  "One single light source: a low dusk sun just under the horizon, keying the figure from the " +
  "UPPER LEFT, so the figure's right side falls into its own shadow. The figure casts NO shadow " +
  "onto the background. Value-muted dusk saturation: nothing daytime-bright, nothing night-black.";
const FRAME =
  "FRAMING: a head-and-shoulders bust, centred horizontally, eyes on a line about 35% down from " +
  "the top, and the shoulders/chest running all the way OFF the BOTTOM EDGE of the frame so the " +
  "bust never floats. Eye-level camera, no perspective.";
const BG =
  "The background is one completely flat, uniform, dark ink (#1c1326) colour, identical edge to " +
  "edge — no scenery, no horizon, no props behind the figure, no vignette, no gradient, no glow, " +
  "no shadow cast onto it, nothing behind the figure at all.";
const NO_ECHO =
  "NO echo-violet (#a06cd5), no purple, no violet, no magenta, and no luminous or glowing rim " +
  "light, aura or halo anywhere on the figure or background. This is an ordinary person.";

/** Capped at 500 chars per the brief. Ordered most-important-first so the cap trims the least. */
const NEGATIVE = (
  "photograph, photorealistic, 3d render, smooth shading, airbrush, soft gradient, blurry, " +
  "anti-aliased, painterly, watercolour, oil painting, glow, bloom, rim light, lens flare, " +
  "purple, violet, magenta, text, letters, watermark, signature, border, frame, background " +
  "scenery, vignette, extra people, hands, full body"
).slice(0, 500);

/** Pinned. A fixed seed means a retry of the same selfie returns the same character rather than a
 *  different stranger, which matters when the person has already been told a character is coming. */
export const SEED = 20260716;

/** 2:3, inside the endpoint's 768x768..1280x1280 bounds. */
const IMAGE_SIZE = { width: 1024, height: 1536 };

export const FAL_ENDPOINT = "fal-ai/wan-25-preview/image-to-image";

/** The style anchor: a committed roster portrait, handed to the model as reference image 2.
 *
 *  Upscaled 6x with NEAREST (72x108 -> 432x648) because FAL rejects references under 384x384. The
 *  upscale must be nearest: the anchor's entire job is to carry the pixel grid, and a smooth
 *  upscale would hand the model exactly the anti-aliased mush we are telling it not to produce. */
let anchorCache: Blob | null = null;
async function styleAnchor(): Promise<Blob> {
  if (anchorCache) return anchorCache;
  const sharp = (await import("sharp")).default;
  const p = join(process.cwd(), "public", "assets", "roster", "premade_11888.png");
  const src = await readFile(p);
  const meta = await sharp(src).metadata();
  const k = 6;
  const up = await sharp(src)
    .resize((meta.width ?? 72) * k, (meta.height ?? 108) * k, { kernel: "nearest" })
    .png()
    .toBuffer();
  anchorCache = new Blob([new Uint8Array(up)], { type: "image/png" });
  return anchorCache;
}

function promptFor(): string {
  return (
    `Redraw the person in image 1 as a character portrait in EXACTLY the art style of image 2. ` +
    `Keep the person's face, hair colour, hair shape and skin tone from image 1. Take the pixel-art ` +
    `technique, palette, lighting, framing and flat ink background from image 2. ` +
    `Wearing a muted forest-green (#3f8a64) roughspun tunic with a bark-brown collar. ` +
    `Calm, reserved, quietly watchful expression, looking straight at the viewer, head and ` +
    `shoulders only. ${FRAME} ${BG} ${LIGHT} ${STYLE} ${NO_ECHO}`
  );
}

export const hasFal = () => Boolean(process.env.FAL_KEY);

export interface SubmitResult {
  requestId: string;
  selfieUrl: string;
}

/**
 * Upload the selfie and submit the job. Returns immediately with a request id — generation takes
 * ~60s, which no serverless response can wait for.
 *
 * The selfie goes to fal.storage, NOT to our own bucket: it never sits on a URL we host, and the
 * `characters` bucket is not a dependency of this path at all.
 */
export async function submitPortrait(selfie: Buffer, webhookUrl: string): Promise<SubmitResult> {
  fal.config({ credentials: process.env.FAL_KEY });

  const selfieUrl = await fal.storage.upload(
    new Blob([new Uint8Array(selfie)], { type: "image/jpeg" }),
  );
  const anchorUrl = await fal.storage.upload(await styleAnchor());

  const { request_id } = await fal.queue.submit(FAL_ENDPOINT, {
    input: {
      prompt: promptFor(),
      // image 1 = the face to keep. image 2 = the style to copy. Named by index in the prompt so
      // the model is told what each reference is FOR, not just handed two pictures.
      image_urls: [selfieUrl, anchorUrl],
      negative_prompt: NEGATIVE,
      image_size: IMAGE_SIZE,
      num_images: 1,
      seed: SEED,
      enable_safety_checker: true,
    },
    webhookUrl,
  });

  return { requestId: request_id, selfieUrl };
}

/** Pull a finished job's result. Used by the webhook (which carries the payload) and by the sweeper
 *  (which does not, and has to ask). */
export async function fetchResult(requestId: string): Promise<unknown> {
  fal.config({ credentials: process.env.FAL_KEY });
  return fal.queue.result(FAL_ENDPOINT, { requestId });
}

export interface Extracted {
  imageUrl: string | null;
  nsfw: boolean;
  actualPrompt?: string;
}

/**
 * Read a FAL payload. Tolerant of shape because a webhook body and a polled result differ, and
 * both have changed shape before.
 *
 * A safety-checker hit is surfaced as `nsfw`, never swallowed: a false flag on someone's face must
 * fail visibly and get them an honest email, not silently produce nothing.
 */
export function extract(payload: unknown): Extracted {
  const p = payload as Record<string, any>;
  const d = p?.payload ?? p?.data ?? p ?? {};
  const images = d.images ?? [];
  const flags = d.has_nsfw_concepts ?? d.nsfw_content_detected ?? [];
  return {
    imageUrl: images?.[0]?.url ?? null,
    nsfw: Array.isArray(flags) ? flags.some(Boolean) : Boolean(flags),
    actualPrompt: d.actual_prompt,
  };
}
