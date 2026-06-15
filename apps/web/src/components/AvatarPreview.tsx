"use client";

import { useEffect, useRef } from "react";
import { SPRITE, FACING_ROW, type Facing } from "@echo/shared";
import { buildCharacterSheet, type CharStyle } from "@/game/art";

/** Renders an animated walking-down preview of a character sheet at a chosen scale. */
export default function AvatarPreview({
  style,
  scale = 5,
  facing = "down",
}: {
  style: CharStyle;
  scale?: number;
  facing?: Facing;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const sheet = buildCharacterSheet(style);
    const row = FACING_ROW[facing];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let frame = 0;

    const draw = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      t += dt;
      frame = 1 + (Math.floor(t * SPRITE.WALK_FPS) % (SPRITE.FRAME_COUNT - 1));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        sheet,
        frame * SPRITE.FRAME_W,
        row * SPRITE.FRAME_H,
        SPRITE.FRAME_W,
        SPRITE.FRAME_H,
        0,
        0,
        SPRITE.FRAME_W * scale,
        SPRITE.FRAME_H * scale,
      );
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [style, scale, facing]);

  return (
    <canvas
      ref={ref}
      width={SPRITE.FRAME_W * scale}
      height={SPRITE.FRAME_H * scale}
      className="pixel"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
