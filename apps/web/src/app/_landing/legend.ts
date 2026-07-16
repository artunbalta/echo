/**
 * The legend (landing §1a). Seven beats of ECHO's story, told as a myth rather than a pitch.
 *
 * THE COPY LIVES HERE, IN ONE PLACE, AS TEXT. It is never baked into an illustration: the whole
 * pitch has to stay selectable, translatable, crawlable and screen-readable, and you have to be able
 * to edit a line without regenerating art. The plates are illustration only.
 *
 * THE ARC IS DELIBERATE. Beats 1-4 stay quiet and observational: the world is empty, the echo only
 * watches. Beat 5 is the turn — it acts for the first time. Beats 6 and 7 open outward, and 7 is an
 * invitation: the door is open, now, and the shore is small.
 *
 * The excitement has to come from what the story PROMISES, never from adjectives claiming it. So:
 * no exclamation marks, no "extraordinary", no "revolutionary", nothing telling you how to feel. The
 * last line is a plain statement of an open door, which is thrilling precisely because it is plain.
 * The real number of remaining places is rendered by the waitlist below, from the real row count —
 * the copy deliberately names no figure, so it can never drift from the cap or become a fake.
 *
 * No em-dashes anywhere: they are banned in user-facing copy.
 */

export interface Beat {
  id: string;
  /** The legend line. Real DOM text, always. */
  line: string;
  /** Committed plate from `npm run gen:plates`. Absent art degrades to a text-only page. */
  plate: string;
  /** Real alt text. The illustration carries mood, so the alt describes what is depicted. */
  alt: string;
}

export const BEATS: Beat[] = [
  {
    id: "1_wake",
    line: "You wake on a shore that is on no map. No one here knows you. Not even your echo.",
    plate: "/assets/legend/1_wake.png",
    alt: "A lone figure waking on a wide, empty dusk beach, with a distant island on the horizon.",
  },
  {
    id: "2_gather",
    line: "It asks you nothing. It watches what you gather, what you walk past, and how long you stand still.",
    plate: "/assets/legend/2_gather.png",
    alt: "A figure gathering berries on a hillside, with a tilled patch and a dark cave mouth nearby.",
  },
  {
    id: "3_manner",
    line: "It is not learning your answers. It is learning your manner. The shape you make when nobody is asking.",
    plate: "/assets/legend/3_manner.png",
    alt: "A still tide pool at dusk, holding a pale reflection whose posture does not quite match the figure standing over it.",
  },
  {
    id: "4_crossing",
    line: "Then others cross the water. How you meet a stranger tells it more than a season alone.",
    plate: "/assets/legend/4_crossing.png",
    alt: "A bark raft crossing dusk water toward a far shore, where a single hooded figure waits.",
  },
  {
    id: "5_speaks",
    line: "One dusk it speaks before you do, and it is not wrong.",
    plate: "/assets/legend/5_speaks.png",
    alt: "A warm, lantern-lit clearing where a small group talks, with one figure listening at the edge of the light.",
  },
  {
    id: "6_goes",
    line: "It goes where you cannot. It sits with people you have not met, and it carries your name well.",
    plate: "/assets/legend/6_goes.png",
    alt: "A wide dusk valley seen from a ridge, with a lit settlement below and a causeway running out toward distant lights.",
  },
  {
    id: "7_networks",
    line: "It learns you, then it networks for you. The shore is small, and it is open now.",
    plate: "/assets/legend/7_networks.png",
    alt: "Two figures meeting on a lantern-lit pier at dusk, with a settlement behind them and open water beyond.",
  },
];

/** The cover. The ECHO mark on parchment, quiet. This and the empty roster slot are the only two
 *  places echo-violet is allowed on the entire landing, so it appears here once and barely. */
export const COVER = {
  mark: "echo",
  line: "A country that does not exist",
} as const;
