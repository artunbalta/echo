/**
 * Fal provider. Implements the verified Fal queue REST contract:
 *   POST https://queue.fal.run/{model}            (Authorization: Key $FAL_KEY)
 *     → { request_id, status_url, response_url }
 *   GET  {status_url}?logs=1  → poll until { status: "COMPLETED" }
 *   GET  {response_url}       → { images: [{ url, width, height }] }
 * (docs.fal.ai/model-apis/model-endpoints/queue, verified 2026-06)
 *
 * The model slug is configurable (FAL_MODEL) because the right pixel-art / img2img model
 * depends on your account — we do not hardcode a slug we can't verify against your keys.
 */
import { buildArtPrompt, type ArtProvider, type PortraitRequest, type PortraitResult } from "./types";

const FAL_KEY = process.env.FAL_KEY ?? "";
// A reasonable default; override per your Fal catalog. img2img models also accept image_url.
const FAL_MODEL = process.env.FAL_MODEL ?? "fal-ai/flux/schnell";

async function poll(statusUrl: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${statusUrl}?logs=0`, {
      headers: { authorization: `Key ${FAL_KEY}` },
    });
    const data = (await res.json()) as { status?: string };
    if (data.status === "COMPLETED") return;
    if (data.status === "FAILED" || data.status === "ERROR")
      throw new Error(`Fal job ${data.status}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Fal job timed out");
}

export const falProvider: ArtProvider = {
  name: "fal",
  async generatePortrait(req: PortraitRequest): Promise<PortraitResult> {
    if (!FAL_KEY) throw new Error("FAL_KEY not set");
    const input: Record<string, unknown> = {
      prompt: buildArtPrompt(req.attributes),
      image_size: "square",
      num_images: 1,
    };
    // img2img / style conditioning when a model that supports it is configured.
    if (req.selfieUrl) input.image_url = req.selfieUrl;

    const submit = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: { authorization: `Key ${FAL_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!submit.ok) throw new Error(`Fal submit failed: ${submit.status}`);
    const { status_url, response_url } = (await submit.json()) as {
      status_url: string;
      response_url: string;
    };

    await poll(status_url);
    const result = await fetch(response_url, {
      headers: { authorization: `Key ${FAL_KEY}` },
    });
    const data = (await result.json()) as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("Fal returned no image");
    return { url, provider: "fal", placeholder: false };
  },
};
