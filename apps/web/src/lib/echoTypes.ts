/**
 * The echo's outings (DECISIONS C64), as they are stored and shown. Shared by the server, which makes
 * them, and the page, which tells them.
 */

/** One line said in an encounter. */
export interface EchoLine {
  who: "echo" | "villager";
  text: string;
}

/** What the gate said about one line the echo would say: kept so the stranger's answer to it trains the right bucket. */
export interface EchoTurn {
  line: string;
  bucket: string;
  context: string;
  confidence: number;
  p_hat: number;
  tau: number;
  decision: "auto" | "ask" | "copilot";
  explored: boolean;
}

export interface Encounter {
  cell: string;
  village: string;
  person: string;
  given: string;
  family: string;
  age: number;
  occupation: string;
  /** The world day and hour it happened, and where, in the parcel's local metres. */
  day: number;
  hour: number;
  x: number;
  y: number;
  activity: string;
  /** The gate let it speak at all. */
  spoke: boolean;
  lines: EchoLine[];
  /** One per line the echo would say, in order: spoken, or held back. */
  turns: EchoTurn[];
  /** The stranger's answer to each turn: true "that's me", false "not me", null unanswered. */
  feedback: (boolean | null)[];
}

export interface Outing {
  id: string;
  subject: string;
  /** Where it went: a village's cell and name, or null when it found nobody to go to. */
  cell: string | null;
  village: string | null;
  /** The absence it filled. */
  awayFrom: string;
  awayTo: string;
  madeAt: string;
  readAt: string | null;
  encounters: Encounter[];
  /** Where the echo stands waiting: the spot of its last encounter. */
  waits: { cell: string; x: number; y: number } | null;
  /** Why nothing happened, when nothing did. */
  reason: string | null;
}
