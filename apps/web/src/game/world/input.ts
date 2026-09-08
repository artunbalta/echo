/**
 * Keyboard, pointer and touch for the planet world (plan W3-3, DECISIONS C23).
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
 *   - `touch-action` is "none" only while this input is ENABLED. A disabled world is furniture, and
 *     furniture may not eat a page scroll: the landing's arrival-view preview builds a player layer
 *     with the input off, and a thumb dragged up through that box has to scroll the landing.
 *
 * Dragging orbits the camera. Pointer capture keeps the drag alive when the pointer leaves the
 * canvas mid-gesture; there is no pointer lock, so the cursor is always where the user left it and
 * the page never asks for anything.
 *
 * Movement is camera relative: W walks the way the camera looks. The camera's yaw is the follow
 * camera's, so `read` takes it and rotates the axes with the same helper the camera uses to face,
 * and a MoveInput in tile space comes out ready for stepMover.
 *
 * TWO SOURCES, ONE FRAME (C23). A phone has no W, no Shift and no Space, so walking, running and
 * jumping arrive from a thumbstick and a button in the HUD instead — real DOM elements, because a
 * canvas cannot hold one with an accessible name and a second <canvas> on this page is forbidden by
 * tests/e2e/minimap.spec.ts. They state a demand through a TouchControlHandle and THIS FILE merges
 * it with the keys, because playerLayer says in its own header that it decides nothing about
 * movement, and choosing between two inputs is a decision. Whichever of the two is asking for more
 * wins the direction; run and jump are the OR of both. Downstream, nothing can tell a thumb from a
 * keyboard: one InputFrame, the same one, which is why every rule controller.test.mts and
 * followCamera.test.mts already pin covers the phone for free.
 *
 * THE GESTURE STATE IS NOT HERE. Which finger looks, which pair pinches, what a separation is worth
 * in wheel pixels and where the dead zones are all live in touchInput.ts as pure functions over
 * plain coordinates, so node can script a pinch. What is left here is the part only a browser can
 * do: listen, capture, and translate an event into a call. Before C23 this file was one closure
 * with the arithmetic inside it, and it was the only input module in this tree with no test.
 */

import { cameraRelativeMove } from "./followCamera";
import type { MoveInput } from "./controller";
import {
  MOUSE,
  TOUCH,
  drainGesture,
  gestureCancel,
  gestureDown,
  gestureMove,
  gestureUp,
  initialGesture,
  type GestureState,
  type TouchControlHandle,
} from "./touchInput";

export interface InputFrame {
  /** Ready for stepMover: direction in tile space, run and jump held. */
  move: MoveInput;
  /** Pixels dragged since the last read. Right and down are positive. */
  orbitDx: number;
  orbitDy: number;
  /** Wheel pixels since the last read. Positive zooms out. */
  zoom: number;
}

export interface WorldInputOptions {
  /**
   * The HUD's thumbstick and buttons, where a mount has them. Absent on desktop-only mounts and on
   * the landing preview, and its absence is the whole difference: with no handle this file behaves
   * exactly as it did before touch existed.
   */
  touch?: TouchControlHandle;
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

export function createInput(canvas: HTMLCanvasElement, options: WorldInputOptions = {}): WorldInput {
  const touch = options.touch;
  const held = new Set<string>();
  let enabled = true;
  let gesture: GestureState = initialGesture();

  // A canvas is not focusable until it has a tabIndex; without one "while the canvas has focus"
  // could never be true and the arrows would scroll the page forever. No focus ring: the world is
  // its own indication that it is listening.
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.style.userSelect = "none";
  // Safari needs both of these by their prefixed names. Without the callout a long press on the
  // world raises the iOS selection magnifier over it, which is the wrong answer to a thumb that is
  // trying to turn around.
  const style = canvas.style as CSSStyleDeclaration & { webkitUserSelect?: string; webkitTouchCallout?: string };
  style.webkitUserSelect = "none";
  style.webkitTouchCallout = "none";
  canvas.style.setProperty("-webkit-tap-highlight-color", "transparent");

  /** None while the world is driveable, so a two-finger gesture is ours; a page scroll when it is not. */
  const applyTouchAction = () => {
    canvas.style.touchAction = enabled ? "none" : "pan-y";
  };
  applyTouchAction();

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

  /**
   * Capture is best-effort. It throws NotFoundError for a pointer id the browser does not own —
   * which is exactly what a synthetic PointerEvent from a test harness is — and a throw inside a
   * listener surfaces as a page error that fails specs about something else entirely.
   */
  const capture = (id: number) => {
    try {
      canvas.setPointerCapture?.(id);
    } catch {
      /* not ours to capture; the window-level up still ends the gesture */
    }
  };
  const uncapture = (id: number) => {
    try {
      if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    } catch {
      /* already gone */
    }
  };

  const endAll = () => {
    for (const finger of gesture.fingers) uncapture(finger.id);
    gesture = gestureCancel(gesture);
  };
  const onBlur = () => {
    held.clear();
    endAll();
  };

  /** A mouse gets the gains it always had; a finger gets the phone's. See touchInput's TOUCH. */
  const optionsFor = (e: PointerEvent) => (e.pointerType === "touch" ? TOUCH : MOUSE);
  const finger = (e: PointerEvent) => ({ id: e.pointerId, x: e.clientX, y: e.clientY });

  const onPointerDown = (e: PointerEvent) => {
    // The button guard is about a mouse's right and middle click and was only ever about those; a
    // touch reports button 0 and would pass either way, but saying so keeps the intent legible.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!enabled) return;
    // Clicking the world gives it the keys. preventScroll: the hero must not jump the page. Below
    // the guard, because a world nobody can drive has no business taking the document's focus.
    canvas.focus({ preventScroll: true });
    gesture = gestureDown(gesture, finger(e));
    capture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!enabled) return;
    gesture = gestureMove(gesture, finger(e), optionsFor(e));
  };
  const onPointerUp = (e: PointerEvent) => {
    uncapture(e.pointerId);
    gesture = gestureUp(gesture, e.pointerId);
  };
  const onWheel = (e: WheelEvent) => {
    if (!enabled || !focused()) return; // the page scrolls
    e.preventDefault();
    // deltaMode 1 is lines, 2 is pages; pixels are what the zoom is tuned in.
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    gesture = { ...gesture, zoom: gesture.zoom + e.deltaY * scale };
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  // iOS reclaims a gesture (the left-edge back swipe is the common one, and the left edge is where
  // a thumbstick wants to live) without always sending a cancel. Without this the finger stays in
  // the state with a stale position and the next move injects one enormous orbit delta.
  canvas.addEventListener("lostpointercapture", onPointerUp);
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
      const drained = drainGesture(gesture);
      gesture = drained.state;
      // Exactly one read per frame, because the handle's jump latch is spent here: a tap that began
      // and ended between two frames survives as one true, and only one.
      const demand = touch?.read();
      if (!enabled) return { move: NEUTRAL, orbitDx: 0, orbitDy: 0, zoom: 0 };

      let forward = axis(BACK, FORWARD);
      let right = axis(LEFT, RIGHT);
      if (demand && Math.hypot(demand.forward, demand.right) > Math.hypot(forward, right)) {
        forward = demand.forward;
        right = demand.right;
      }
      const run = any(RUN) || !!demand?.run;
      const jump = any(JUMP) || !!demand?.jump;

      const frame: InputFrame = { move: NEUTRAL, orbitDx: drained.orbitDx, orbitDy: drained.orbitDy, zoom: drained.zoom };
      if (forward !== 0 || right !== 0 || run || jump) {
        const { dx, dy } = cameraRelativeMove(cameraYaw, forward, right);
        frame.move = { dx, dy, run, jump, activity: null };
      }
      return frame;
    },
    setEnabled(next) {
      enabled = next;
      applyTouchAction();
      if (!next) {
        held.clear();
        endAll();
        gesture = initialGesture();
        // The same reason the keys are cleared: a stick held when the world was taken away would
        // latch its axes and walk the player off on their own the moment it came back.
        touch?.clear();
      }
    },
    dispose() {
      endAll();
      held.clear();
      touch?.clear();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
