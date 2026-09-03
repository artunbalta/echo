/**
 * Keyboard and pointer for the planet world (plan W3-3).
 *
 * The world sits on a landing page, and a landing page scrolls. So the rules here are about NOT
 * taking more than the world is owed:
 *
 *   - Keys are read on the window, so you can walk without first clicking the world, but never
 *     while an input, textarea or contenteditable has focus: typing an email into the waitlist
 *     form must not walk anyone into the sea.
 *   - preventDefault is called only for the arrows and space, and only while the canvas has focus.
 *     Unfocused, space and the arrows keep scrolling the page the way they do everywhere else.
 *   - The wheel zooms only while the canvas has focus, and only then is the page's scroll stopped.
 *   - Every key is released on blur, because a keyup fired in another tab never reaches us and a
 *     stuck W walks the player into the sea while they read their mail.
 *
 * Dragging the canvas orbits the camera. Pointer capture keeps the drag alive when the pointer
 * leaves the canvas mid-gesture; there is no pointer lock, so the cursor is always where the user
 * left it and the page never asks for anything.
 *
 * Movement is camera relative: W walks the way the camera looks. The camera's yaw is the follow
 * camera's, so `read` takes it and rotates the axes with the same helper the camera uses to face,
 * and a MoveInput in tile space comes out ready for stepMover.
 */

import type { MoveInput } from "./controller";
import { cameraRelativeMove } from "./followCamera";

export interface InputFrame {
  /** Ready for stepMover: direction in tile space, run and jump held. */
  move: MoveInput;
  /** Pixels dragged since the last read. Right and down are positive. */
  orbitDx: number;
  orbitDy: number;
  /** Wheel pixels since the last read. Positive zooms out. */
  zoom: number;
}

export interface WorldInput {
  /** Drain the pointer deltas and read the held keys, as one frame's input. */
  read(cameraYaw: number): InputFrame;
  /** Off: keys are dropped and released, drags end, and read() is neutral. */
  setEnabled(enabled: boolean): void;
  /** Whether the canvas has keyboard focus, i.e. whether the world owns the arrows and space. */
  readonly focused: boolean;
  dispose(): void;
}

/** Physical keys (KeyboardEvent.code), so WASD is WASD on an AZERTY keyboard too. */
const FORWARD = new Set(["KeyW", "ArrowUp"]);
const BACK = new Set(["KeyS", "ArrowDown"]);
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const RUN = new Set(["ShiftLeft", "ShiftRight"]);
const JUMP = new Set(["Space"]);
/** The keys whose default action (scrolling) is suppressed while the world has focus. */
const SCROLLING = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

const NEUTRAL: MoveInput = { dx: 0, dy: 0, run: false, jump: false, activity: null };

/** Whether the element the page is typing into should keep every key to itself. */
function typing(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function createInput(canvas: HTMLCanvasElement): WorldInput {
  const held = new Set<string>();
  let enabled = true;
  let dragging = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let orbitDx = 0;
  let orbitDy = 0;
  let zoom = 0;

  // A canvas is not focusable until it has a tabIndex; without one "while the canvas has focus"
  // could never be true and the arrows would scroll the page forever. No focus ring: the world is
  // its own indication that it is listening.
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.style.touchAction = "none";
  canvas.style.userSelect = "none";

  const focused = () => document.activeElement === canvas;

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || typing()) return;
    if (SCROLLING.has(e.code) && focused()) e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
  };
  // A release always counts, whatever has focus: the key that went down in the world and came up
  // in a text field must not stay down.
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const endDrag = () => {
    if (dragging && pointerId >= 0 && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    dragging = false;
    pointerId = -1;
  };
  const onBlur = () => {
    held.clear();
    endDrag();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // Clicking the world gives it the keys. preventScroll: the hero must not jump the page.
    canvas.focus({ preventScroll: true });
    if (!enabled) return;
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    orbitDx += e.clientX - lastX;
    orbitDy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === pointerId) endDrag();
  };
  const onWheel = (e: WheelEvent) => {
    if (!enabled || !focused()) return; // the page scrolls
    e.preventDefault();
    // deltaMode 1 is lines, 2 is pages; pixels are what the zoom is tuned in.
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    zoom += e.deltaY * scale;
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);

  const axis = (neg: Set<string>, pos: Set<string>) => {
    let v = 0;
    for (const code of held) {
      if (pos.has(code)) v += 1;
      else if (neg.has(code)) v -= 1;
    }
    return Math.max(-1, Math.min(1, v));
  };
  const any = (keys: Set<string>) => {
    for (const code of held) if (keys.has(code)) return true;
    return false;
  };

  return {
    get focused() {
      return focused();
    },
    read(cameraYaw) {
      const frame: InputFrame = { move: NEUTRAL, orbitDx, orbitDy, zoom };
      orbitDx = 0;
      orbitDy = 0;
      zoom = 0;
      if (!enabled) return { move: NEUTRAL, orbitDx: 0, orbitDy: 0, zoom: 0 };
      const forward = axis(BACK, FORWARD);
      const right = axis(LEFT, RIGHT);
      if (forward !== 0 || right !== 0 || any(RUN) || any(JUMP)) {
        const { dx, dy } = cameraRelativeMove(cameraYaw, forward, right);
        frame.move = { dx, dy, run: any(RUN), jump: any(JUMP), activity: null };
      }
      return frame;
    },
    setEnabled(next) {
      enabled = next;
      if (!next) {
        held.clear();
        endDrag();
        orbitDx = 0;
        orbitDy = 0;
        zoom = 0;
      }
    },
    dispose() {
      endDrag();
      held.clear();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
