/**
 * The debrief's share card (C83): a picture of how well a person was known, for a circle of friends to
 * pass on. It carries the tally alone (how many of the six each witness came closest on) and the way to
 * start a circle, never a choice, a guess or a name. Only a circle's debrief offers it: in the study, a
 * card passed to someone who has not finished could change what they do.
 */
import { t, type Lang } from "@/lib/i18n";

type Witness = "said" | "friends" | "echo";

export interface ShareText {
  title: string;
  lines: { witness: Witness; text: string; n: number }[];
  footer: string;
  /** The same in one line, for where only text can go. */
  plain: string;
}

/** The card's words. `of` is how many of the six they met on their last visit. */
export function shareText(lang: Lang, tally: Record<Witness, number>, of: number, url: string): ShareText {
  const lines = (["echo", "friends", "said"] as const).map((w) => ({ witness: w, n: tally[w], text: t(lang, `pilot.share.${w}`, { n: tally[w], of }) }));
  const title = t(lang, "pilot.share.title");
  const footer = t(lang, "pilot.share.footer", { url });
  return { title, lines, footer, plain: `${title} ${lines.map((l) => l.text).join(" · ")}. ${footer}` };
}

/** The card as a PNG, 1080 × 1350, in the pilot's palette. */
export async function shareCard(text: ShareText, of: number): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#1b1426";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#f3e9d2";
  g.font = "600 76px Georgia, 'Times New Roman', serif";
  wrap(g, text.title, 96, 220, W - 192, 92);
  const top = 470;
  text.lines.forEach((l, i) => {
    const y = top + i * 200;
    g.fillStyle = "rgba(243,233,210,0.85)";
    g.font = "44px system-ui, -apple-system, 'Segoe UI', sans-serif";
    g.fillText(l.text, 96, y);
    g.fillStyle = "rgba(243,233,210,0.15)";
    g.fillRect(96, y + 34, W - 192, 26);
    g.fillStyle = l.witness === "echo" ? "#7fd1c2" : "rgba(243,233,210,0.7)";
    g.fillRect(96, y + 34, ((W - 192) * l.n) / Math.max(of, 1), 26);
  });
  g.fillStyle = "rgba(243,233,210,0.7)";
  g.font = "36px system-ui, -apple-system, 'Segoe UI', sans-serif";
  wrap(g, text.footer, 96, H - 190, W - 192, 48);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) g.fillText(line, x, y);
}

/** Shares the card where the browser can, and otherwise saves it. Returns which it did. */
export async function shareOrSave(png: Blob, text: ShareText): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([png], "who-knows-you-best.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: text.plain });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(png);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "saved";
}
