/**
 * Where someone else in the room is, between the poses their page sends (DECISIONS C101).
 *
 * A pose arrives ten times a second, and late by however long the network took. Drawn as it arrives, a
 * body would jump; drawn a little in the past, between the two poses either side of that moment, it
 * walks. So the body is drawn {@link DELAY_MS} behind the newest pose, which is a little more than one
 * pose's gap: there is almost always a pose on each side of the moment drawn.
 *
 * When the newest pose is older than the moment drawn (a page went quiet), the body stays where its last
 * pose put it rather than walking on into a guess.
 *
 * Pure: the clock is passed in.
 */
import type { WalkerActivity } from "@echo/shared";

export interface Sample {
  /** When the pose arrived, ms (`performance.now()`). */
  t: number;
  /** Planet-local metres. */
  x: number;
  y: number;
  /** three's yaw. */
  yaw: number;
  /** Metres a second. */
  speed: number;
  activity: WalkerActivity;
}

/** How far behind the newest pose a body is drawn, ms. */
export const DELAY_MS = 140;
/** Poses kept: a second and a bit at ten a second. */
const KEEP = 12;

/** The short way round from `a` to `b`, a share `k` of it. */
function lerpAngle(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

export class OthersTrack {
  private readonly samples: Sample[] = [];

  push(s: Sample): void {
    const last = this.samples.at(-1);
    // Out of order or the same moment twice: the newer word is the one kept.
    if (last && s.t <= last.t) {
      this.samples[this.samples.length - 1] = { ...s, t: last.t };
      return;
    }
    this.samples.push(s);
    if (this.samples.length > KEEP) this.samples.splice(0, this.samples.length - KEEP);
  }

  /** The newest pose, or null before any. */
  latest(): Sample | null {
    return this.samples.at(-1) ?? null;
  }

  /** The body as it should be drawn at `now`, or null before any pose has come. */
  at(now: number): Sample | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const t = now - DELAY_MS;
    const first = this.samples[0]!;
    if (t <= first.t) return { ...first, t };
    const last = this.samples[n - 1]!;
    if (t >= last.t) return { ...last, t };
    let i = n - 2;
    while (i > 0 && this.samples[i]!.t > t) i--;
    const a = this.samples[i]!;
    const b = this.samples[i + 1]!;
    const k = (t - a.t) / (b.t - a.t);
    return {
      t,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      yaw: lerpAngle(a.yaw, b.yaw, k),
      speed: a.speed + (b.speed - a.speed) * k,
      activity: k < 0.5 ? a.activity : b.activity,
    };
  }
}
