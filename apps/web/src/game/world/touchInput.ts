/**
 * The gestures a phone has, as pure functions (DECISIONS C23).
 *
 * Renderer-free and DOM-free on purpose, the way followCamera.ts and controller.ts are: this module
 * takes coordinates the caller has already read off an event and returns new state, so node can
 * script a two-finger pinch the way controller.test.mts scripts a walk. input.ts is the shell that
 * turns PointerEvents into these calls and nothing else. That split is the whole reason the file
 * exists: input.ts was the one input module in this tree with no pure core and, as a direct
 * consequence, the only one with no test at all.
 *
 * WHAT A PHONE WAS MISSING, AND WHERE EACH PIECE LANDS. A finger could already orbit the camera,
 * because the canvas carries `touch-action: none` and the orbit path is pointer events. Everything
 * else was keyboard: walking is WASD, running is Shift, jumping is Space. So there are two sources
 * here and they meet in input.ts, never in the mover:
 *
 *   the CANVAS gestures   one finger looks, two fingers pinch to zoom. A reducer, below.
 *   the HUD controls      a thumbstick and a jump button, which are real DOM elements in
 *                         TouchControls.tsx. They cannot be canvas gestures: a canvas cannot hold
 *                         an element with an accessible name, and a stick drawn INTO the canvas
 *                         would be a second <canvas> on the page, which tests/e2e/minimap.spec.ts
 *                         forbids by name. They push into the handle at the bottom of this file.
 *
 * Both arrive at `WorldInput.read` and leave as one InputFrame, so playerLayer.ts is untouched and
 * the mover cannot tell a thumb from a keyboard. That is the property worth having: every rule the
 * follow camera and the controller are already tested under covers the phone for free.
 *
 * THE STICK CANNOT BE ANALOG, and it is worth saying why here rather than discovering it later.
 * stepMover normalises the direction it is given and picks its speed from the boolean `run`, and
 * MOVER.WALK is frozen for parity with WorldRoom.integrate on the server. So deflection can buy
 * exactly one thing — the run flag — and a later change that makes the mover speed-proportional
 * would drift the client off the authority on the first step. Hence `runFrom`, with hysteresis,
 * rather than a fourth button.
 *
 * THE PINCH CONSTANT IS COMPUTED, NEVER WRITTEN DOWN. FollowInput.zoom is in WHEEL pixels and
 * stepFollowCamera spends them as `distance * zoomPerNotch^(zoom/100)`. For the boom to track the
 * fingers exactly, the wheel pixels a pinch is worth are 100/ln(zoomPerNotch) * ln(before/after) —
 * so the number follows FOLLOW_CAMERA.zoomPerNotch if that constant ever moves. A literal 715.5
 * here would be the same class of bug as the two copies of the layer list parcelWorld.ts's header
 * is about, and tests/touchInput.test.mts checks the round trip against the camera's own formula
 * rather than against the constant.
 */

import { FOLLOW_CAMERA } from "./followCamera";

/** One pointer, in CSS pixels. Whatever the DOM called it is the `id`. */
export interface Finger {
  id: number;
  x: number;
  y: number;
}

export interface TouchOptions {
  /** Pixels from where the thumb landed to full deflection. 56 is a 112 px circle. */
  stickRadiusPx: number;
  /** Under this the stick is neutral, so a resting thumb does not walk. */
  deadZonePx: number;
  /** Fraction of full deflection that starts a run, and the lower one that ends it. */
  runOn: number;
  runOff: number;
  /** Below this separation a pinch is ignored: the ratio blows up as two fingers meet. */
  pinchMinSepPx: number;
  /** The separation must move this far before any zoom is emitted, and it rebases there. */
  pinchStartPx: number;
  /** Multipliers on FOLLOW_CAMERA.orbitRadPerPx for this pointer kind. */
  yawGain: number;
  pitchGain: number;
  /** The camera's own zoom base, so the pinch cannot drift from it. */
  zoomPerNotch: number;
}

/**
 * The numbers, derived rather than chosen wherever there was something to derive them from.
 *
 * YAW IS GAINED UP AND PITCH IS NOT. orbitRadPerPx is 0.006, so a quarter turn costs 262 px — 67%
 * of a 390 px phone, and you cannot turn around in one swipe. At 1.7 a quarter turn is 154 px,
 * about a comfortable thumb. Pitch keeps the mouse's gain because its whole range, pitchMin -0.2 to
 * pitchMax 1.35, is already only a 258 px sweep, and gaining it up would turn the 20 px of vertical
 * wobble in a horizontal swipe into 12 degrees of unasked-for pitch instead of 7.
 *
 * RUN HYSTERESIS IS NOT DECORATION. MOVER.ACCEL is 28 tiles/s² and the walk-to-run gap is 2.4
 * tiles/s, so the mover crosses it in 86 ms; a thumb resting on the rim of a single threshold would
 * flip the state several times a second, and poseCharacter drives leg swing off that speed, so the
 * flicker is visible on the body. The 0.15 band is about 7 px of thumb travel, twice a capacitive
 * screen's resting jitter.
 */
export const TOUCH: TouchOptions = {
  stickRadiusPx: 56,
  deadZonePx: 8,
  runOn: 0.85,
  runOff: 0.7,
  pinchMinSepPx: 24,
  pinchStartPx: 12,
  yawGain: 1.7,
  pitchGain: 1,
  zoomPerNotch: FOLLOW_CAMERA.zoomPerNotch,
};

/**
 * The same reducer, for a mouse or a pen: one pointer, no gain, no pinch. A mouse has a wheel and
 * therefore needs none of the above, and its orbit must stay exactly what it was before this file
 * existed — so the desktop path is this options object and nothing else.
 */
export const MOUSE: TouchOptions = { ...TOUCH, yawGain: 1, pitchGain: 1 };

/** Wheel pixels per natural log of a boom ratio. See the header: computed, never a literal. */
export function zoomPxPerLn(zoomPerNotch: number): number {
  return 100 / Math.log(zoomPerNotch);
}

/**
 * The wheel pixels a separation change is worth. Spreading the fingers (after > before) returns a
 * negative number, which is what followCamera calls zooming in.
 */
export function pinchZoomPx(before: number, after: number, zoomPerNotch: number): number {
  if (!(before > 0) || !(after > 0)) return 0;
  return zoomPxPerLn(zoomPerNotch) * Math.log(before / after);
}

export interface StickReading {
  /** Ready for cameraRelativeMove: 1 walks the way the camera looks. */
  forward: number;
  right: number;
  /** 0 at the dead zone's edge, 1 at full deflection. */
  magnitude: number;
}

const NEUTRAL_STICK: StickReading = { forward: 0, right: 0, magnitude: 0 };

/**
 * A thumb's offset from where it landed, as stick axes. Screen y grows DOWNWARD and forward is up,
 * which is the one sign in this file. The magnitude is remapped across the dead zone rather than
 * clipped at it, so there is no step at the edge: a thumb that has just started moving produces a
 * small deflection and not a sudden full one.
 */
export function stickAxes(dx: number, dy: number, o: Partial<TouchOptions> = {}): StickReading {
  const { stickRadiusPx, deadZonePx } = { ...TOUCH, ...o };
  const len = Math.hypot(dx, dy);
  if (len <= deadZonePx || stickRadiusPx <= deadZonePx) return NEUTRAL_STICK;
  const magnitude = Math.min(1, (len - deadZonePx) / (stickRadiusPx - deadZonePx));
  return { forward: (-dy / len) * magnitude, right: (dx / len) * magnitude, magnitude };
}

/** Whether the stick is asking for a run, given what it was asking for a moment ago. */
export function runFrom(was: boolean, magnitude: number, o: Partial<TouchOptions> = {}): boolean {
  const { runOn, runOff } = { ...TOUCH, ...o };
  if (magnitude >= runOn) return true;
  if (magnitude <= runOff) return false;
  return was;
}

// ── the canvas gestures ─────────────────────────────────────────────────────────────────────────

export interface GestureState {
  /** Every pointer down on the canvas, in the order they arrived. The two oldest own the gesture. */
  readonly fingers: readonly Finger[];
  /** The separation the next zoom is measured from, or null when fewer than two fingers are down. */
  readonly pairSep: number | null;
  /** True once the separation has moved past pinchStartPx, i.e. this is a pinch and not a two-thumb drag. */
  readonly pinching: boolean;
  /** Accumulated since the last drain, in the pixels FollowInput is documented in. */
  readonly orbitDx: number;
  readonly orbitDy: number;
  readonly zoom: number;
}

export function initialGesture(): GestureState {
  return { fingers: [], pairSep: null, pinching: false, orbitDx: 0, orbitDy: 0, zoom: 0 };
}

const separation = (a: Finger, b: Finger) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A pointer went down. A third finger is remembered but drives nothing: two is all any gesture here
 * needs, and dropping the extra is what keeps a palm resting on the glass from stealing the drag.
 */
export function gestureDown(s: GestureState, f: Finger): GestureState {
  if (s.fingers.some((p) => p.id === f.id)) return gestureMove(s, f);
  const fingers = [...s.fingers, { ...f }];
  const pair = fingers.length === 2 ? separation(fingers[0]!, fingers[1]!) : s.pairSep;
  return { ...s, fingers, pairSep: fingers.length === 2 ? pair : s.pairSep, pinching: false };
}

/**
 * A pointer moved.
 *
 * ONE FINGER LOOKS. Two fingers look with their CENTROID and pinch with their separation, which is
 * why a pinch that also slides does both instead of freezing the camera. The centroid delta is
 * derived rather than stored: exactly one finger moves per event, so the midpoint of the pair moves
 * by half of that finger's own delta. Storing a centroid instead is what puts a jump in the camera
 * when a pinch ends, because the stored reference then means something different from one frame to
 * the next; here every finger carries its own last position, so lifting one leaves the other's
 * reference already correct and there is nothing to rebase.
 */
export function gestureMove(s: GestureState, f: Finger, o: Partial<TouchOptions> = {}): GestureState {
  const opts = { ...TOUCH, ...o };
  const index = s.fingers.findIndex((p) => p.id === f.id);
  if (index < 0) return s;
  const previous = s.fingers[index]!;
  const dx = f.x - previous.x;
  const dy = f.y - previous.y;
  const fingers = s.fingers.map((p, i) => (i === index ? { ...f } : p));
  // Only the two oldest drive anything; a third finger updates its position and is otherwise inert.
  if (index > 1) return { ...s, fingers };

  const scale = fingers.length >= 2 ? 0.5 : 1;
  let { pairSep, pinching, zoom } = s;
  if (fingers.length >= 2) {
    const sep = separation(fingers[0]!, fingers[1]!);
    if (sep < opts.pinchMinSepPx || pairSep === null) {
      pairSep = sep;
      pinching = false;
    } else if (pinching) {
      zoom += pinchZoomPx(pairSep, sep, opts.zoomPerNotch);
      pairSep = sep;
    } else if (Math.abs(sep - pairSep) > opts.pinchStartPx) {
      // Rebase at the crossing rather than spending the dead band, so the first emitted frame is
      // not a jump of pinchStartPx worth of boom.
      pinching = true;
      pairSep = sep;
    }
  }
  return {
    fingers,
    pairSep,
    pinching,
    orbitDx: s.orbitDx + dx * scale * opts.yawGain,
    orbitDy: s.orbitDy + dy * scale * opts.pitchGain,
    zoom,
  };
}

/** A pointer went up, was cancelled, or had its capture taken away. An unknown id is a no-op. */
export function gestureUp(s: GestureState, id: number): GestureState {
  const fingers = s.fingers.filter((p) => p.id !== id);
  if (fingers.length === s.fingers.length) return s;
  const pair = fingers.length >= 2 ? separation(fingers[0]!, fingers[1]!) : null;
  return { ...s, fingers, pairSep: pair, pinching: false };
}

/**
 * Everything off. The same invariant input.ts keeps for keys on blur: a gesture that ended
 * somewhere this code cannot see must not still be held here. The accumulators survive, because
 * they are pixels that were really dragged and the frame that drains them has not run yet.
 */
export function gestureCancel(s: GestureState): GestureState {
  return { ...s, fingers: [], pairSep: null, pinching: false };
}

/** Take the accumulated pixels and leave the fingers where they are. */
export function drainGesture(s: GestureState): {
  orbitDx: number;
  orbitDy: number;
  zoom: number;
  state: GestureState;
} {
  return {
    orbitDx: s.orbitDx,
    orbitDy: s.orbitDy,
    zoom: s.zoom,
    state: { ...s, orbitDx: 0, orbitDy: 0, zoom: 0 },
  };
}

// ── the HUD's controls ──────────────────────────────────────────────────────────────────────────

/** What the stick and the buttons want this frame. input.ts merges it with the keys. */
export interface TouchDemand {
  forward: number;
  right: number;
  run: boolean;
  jump: boolean;
}

/**
 * The one mutable thing in this file: a handle the React overlay writes and the input reads.
 *
 * It is a handle rather than a second InputFrame on purpose. If the HUD produced its own frame,
 * playerLayer would have to merge two sources, and merging inputs is a decision — which that layer
 * says in its own header it does not make. So the HUD states a demand, input.ts owns the merge, and
 * there stays exactly one place that answers "what does the player want this frame".
 */
export interface TouchControlHandle {
  /** Deflection, already through stickAxes. The HUD holds the geometry; this holds the intent. */
  setStick(reading: StickReading): void;
  clearStick(): void;
  /** The jump button went down. Latched: see read(). */
  pressJump(): void;
  releaseJump(): void;
  /** Drain. Exactly one caller per frame, because the jump latch is spent here. */
  read(): TouchDemand;
  /** Everything to neutral: the world was disabled, or the layer went away. */
  clear(): void;
}

export function createTouchControls(o: Partial<TouchOptions> = {}): TouchControlHandle {
  const opts = { ...TOUCH, ...o };
  let stick: StickReading = NEUTRAL_STICK;
  let run = false;
  let jumpHeld = false;
  /**
   * Set the moment the button goes down and cleared by the next read, so a tap that begins and ends
   * between two frames still yields one frame with jump true. MoveInput.jump is "held or pressed
   * this frame" and stepMover latches the rising edge itself, so one guaranteed true frame is
   * exactly one jump, and holding the button does not chain a second.
   */
  let jumpLatched = false;

  return {
    setStick(reading) {
      stick = reading;
      run = runFrom(run, reading.magnitude, opts);
    },
    clearStick() {
      stick = NEUTRAL_STICK;
      run = false;
    },
    pressJump() {
      jumpHeld = true;
      jumpLatched = true;
    },
    releaseJump() {
      jumpHeld = false;
    },
    read() {
      const demand = { forward: stick.forward, right: stick.right, run, jump: jumpHeld || jumpLatched };
      jumpLatched = false;
      return demand;
    },
    clear() {
      stick = NEUTRAL_STICK;
      run = false;
      jumpHeld = false;
      jumpLatched = false;
    },
  };
}
