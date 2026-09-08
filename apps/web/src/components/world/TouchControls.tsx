"use client";

/**
 * The controls a phone has (DECISIONS C23): a thumbstick, a jump, and a way into the inspector.
 *
 * Everything a keyboard did and a finger could not. Looking around already worked — the canvas
 * carries `touch-action: none` and the orbit path is pointer events — and pinch-to-zoom is a canvas
 * gesture too, handled in game/world/input.ts. What could not be a canvas gesture is what is drawn
 * here, for two reasons that both settle it: a canvas cannot hold an element with an accessible
 * name, and a second <canvas> on this page is forbidden by name in tests/e2e/minimap.spec.ts, whose
 * comment records the three specs an extra canvas broke the last time one appeared.
 *
 * IT STATES A DEMAND, IT DOES NOT DRIVE THE PLAYER. Every control writes into the same
 * TouchControlHandle, which game/world/input.ts drains once a frame and merges with the keys into
 * ONE InputFrame. So there is no second path to the mover, and nothing downstream can tell a thumb
 * from a keyboard. The geometry — where the thumb landed, how far it has travelled — is this file's;
 * what that means in forward, right and run is touchInput.ts's, where node can test it.
 *
 * THE STICK FLOATS. Its origin is wherever the thumb lands inside the pad, not a painted circle you
 * have to hit, which removes the aiming problem entirely on a screen you are not looking at the
 * bottom of. The pad is inset from the left edge, because iOS claims an edge swipe as its back
 * gesture and the left edge is exactly where a left thumb wants to sit.
 *
 * NOTHING HERE IS A <button>, AND THAT IS DELIBERATE. RecognitionMeter.tsx already recorded the
 * reason for itself and C23 makes it the rule for this HUD: Space is jump in this world, so a
 * focused button would eat the spacebar, and a click that moved focus off the canvas would take
 * WASD with it. So these are role="button" divs that cancel both pointerdown and mousedown — the
 * first is not enough to stop focus in Chrome — and they are not in the tab order. The cost is
 * real and is named rather than hidden: these three controls are not keyboard reachable. What makes
 * that acceptable and not merely convenient is that every one of them exists to replace a key that
 * still works: a keyboard user has W, Shift, Space and the backtick, and needs none of this.
 *
 * IT IS NOT SHOWN UNTIL THE QUESTION IS ANSWERED. The consent card is a gate that stands in the
 * bottom band of a phone screen, exactly where the stick goes, and it is the first thing the route
 * says. Rather than stack a control over a question, the controls wait for it — which is also the
 * order the page means: you are asked, and then the world is handed over.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { TOUCH, stickAxes, type TouchControlHandle } from "@/game/world/touchInput";

export interface TouchControlsProps {
  /** The handle game/world/input.ts reads. The same object the world was built with. */
  handle: TouchControlHandle;
  /** Opens and closes the measurement panel, which otherwise answers only to a key nobody has. */
  onToggleInspector: () => void;
  /** Whether that panel is open, so the control can say which way it goes. */
  inspecting: boolean;
}

/** Where the thumb is, in the pad's own pixels. Null when nothing is down. */
interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

const RING = TOUCH.stickRadiusPx;
const KNOB = 26;

export default function TouchControls({ handle, onToggleInspector, inspecting }: TouchControlsProps) {
  const pad = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<Stick | null>(null);
  const [jumping, setJumping] = useState(false);

  // A component that unmounts mid-drag gets no pointerup, and a stick left deflected walks the
  // player off on their own. The same invariant input.ts keeps for keys on blur.
  useEffect(() => () => handle.clear(), [handle]);

  const place = useCallback((e: React.PointerEvent) => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: e.clientX - box.left, y: e.clientY - box.top, w: box.width, h: box.height };
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const at = place(e);
      if (!at || stick) return;
      // The origin is clamped so the ring is drawn whole even when the thumb lands in a corner.
      const ox = Math.min(Math.max(at.x, RING), at.w - RING);
      const oy = Math.min(Math.max(at.y, RING), at.h - RING);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic pointer from a test harness; the window-level up still ends it */
      }
      setStick({ id: e.pointerId, ox, oy, x: at.x, y: at.y });
      handle.setStick(stickAxes(at.x - ox, at.y - oy));
    },
    [handle, place, stick],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stick || e.pointerId !== stick.id) return;
      const at = place(e);
      if (!at) return;
      setStick({ ...stick, x: at.x, y: at.y });
      handle.setStick(stickAxes(at.x - stick.ox, at.y - stick.oy));
    },
    [handle, place, stick],
  );

  const onUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stick || e.pointerId !== stick.id) return;
      setStick(null);
      handle.clearStick();
    },
    [handle, stick],
  );

  // The knob is drawn at the thumb, clipped to the ring: past full deflection it stops moving,
  // which is the same place stickAxes stops reading further travel as more.
  const offset = stick ? { dx: stick.x - stick.ox, dy: stick.y - stick.oy } : null;
  const length = offset ? Math.hypot(offset.dx, offset.dy) : 0;
  const clamp = offset && length > RING ? RING / length : 1;

  return (
    <div data-touch-controls className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* The pad. Its whole area is live, so the stick appears under the thumb rather than asking
          for one. `touch-action: none` here and not only on the canvas: this element owns the
          gesture the moment a finger lands on it, and the page must not also try to scroll with it. */}
      <div
        ref={pad}
        data-touch-stick
        role="application"
        aria-label="Walk"
        // The inset is on the box's POSITION, not its padding. An absolutely positioned child is
        // laid out against the padding box, so padding here would offset the knob from the thumb by
        // exactly the padding — a stick that renders 20 px to the right of the finger holding it.
        className="pointer-events-auto absolute h-[42%] w-[52%] max-w-[260px] touch-none"
        style={{
          left: "max(20px, env(safe-area-inset-left))",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          WebkitTapHighlightColor: "transparent",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {stick ? (
          <>
            <span
              aria-hidden
              className="absolute rounded-full border border-[#f4e9d0]/25 bg-[#1c1326]/25 backdrop-blur-[2px]"
              style={{ left: stick.ox - RING, top: stick.oy - RING, width: RING * 2, height: RING * 2 }}
            />
            <span
              aria-hidden
              className="absolute rounded-full border border-[#f4e9d0]/50 bg-[#f4e9d0]/70"
              style={{
                left: stick.ox + (offset?.dx ?? 0) * clamp - KNOB,
                top: stick.oy + (offset?.dy ?? 0) * clamp - KNOB,
                width: KNOB * 2,
                height: KNOB * 2,
              }}
            />
          </>
        ) : (
          // A resting hint, so the pad is discoverable without a legend. It is not the stick: the
          // stick has no fixed position, and drawing one here would teach people to aim at it.
          <span
            aria-hidden
            className="absolute bottom-4 left-4 grid h-[76px] w-[76px] place-items-center rounded-full border border-dashed border-[#f4e9d0]/20 font-pixel text-[10px] leading-tight text-[#f4e9d0]/35"
          >
            walk
          </span>
        )}
      </div>

      <div
        className="pointer-events-none absolute bottom-0 right-0 flex flex-col items-end gap-3"
        style={{
          paddingRight: "max(20px, env(safe-area-inset-right))",
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
        }}
      >
        <Control
          label={inspecting ? "Close the inspector" : "Open the inspector"}
          data-touch-inspector
          onPointerUp={onToggleInspector}
          className="h-12 w-12 text-[15px]"
        >
          {inspecting ? "×" : "`"}
        </Control>
        <Control
          label="Jump"
          data-touch-jump
          pressed={jumping}
          onPointerDown={() => {
            setJumping(true);
            handle.pressJump();
          }}
          onPointerUp={() => {
            setJumping(false);
            handle.releaseJump();
          }}
          className="h-[68px] w-[68px] text-[11px] uppercase tracking-wider"
        >
          jump
        </Control>
      </div>
    </div>
  );
}

/**
 * One control. `touch-action: manipulation` is load-bearing rather than tidy: without it a fast
 * double tap on Jump is also a browser double-tap zoom, and the page ends up magnified around the
 * button in the middle of a walk.
 */
function Control({
  label,
  children,
  className = "",
  pressed,
  onPointerDown,
  onPointerUp,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  pressed?: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div
      {...rest}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      className={`pointer-events-auto grid touch-manipulation place-items-center rounded-full border font-pixel transition-colors ${
        pressed
          ? "border-[#f4e9d0]/60 bg-[#f4e9d0]/70 text-[#1c1326]"
          : "border-[#f4e9d0]/25 bg-[#1c1326]/55 text-[#f4e9d0]/80 backdrop-blur-sm"
      } ${className}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
      onPointerDown={(e) => {
        e.preventDefault();
        onPointerDown?.();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onPointerUp?.();
      }}
      onPointerCancel={() => onPointerUp?.()}
      // Both, because cancelling pointerdown alone does not stop Chrome moving focus.
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
