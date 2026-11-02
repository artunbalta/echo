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

// ── two echoes meeting (C71) ────────────────────────────────────────────────────

/**
 * Two people who have said their echoes may meet: one asked (a), the other accepted (b). Each gave the
 * name the other knows them by.
 */
export interface EchoPair {
  id: string;
  a: string;
  b: string;
  aName: string;
  bName: string;
  createdAt: string;
}

/** A code one person hands another, so their echoes may meet. Single use, and short-lived. */
export interface EchoInvite {
  code: string;
  subject: string;
  name: string;
  createdAt: string;
  expiresAt: string;
}

/** One line in a meeting: whose echo, what it would say, and whether its own gate let it say it aloud. */
export interface MeetingLine {
  who: "a" | "b";
  text: string;
  /** Said aloud in the village. False: the gate held it back, and it is only what the echo would have said. */
  said: boolean;
  /** The gate's reading, kept so the owner's answer trains the right bucket. Never shown to the other person. */
  turn: EchoTurn;
}

/**
 * Two echoes meeting while both their people were away (C71). Planned when one of them comes back
 * (`planned`), filled by the engine afterwards (`making`, then `made`), or given up (`failed`).
 */
export interface EchoMeeting {
  id: string;
  pair: string;
  a: string;
  b: string;
  aName: string;
  bName: string;
  status: "planned" | "making" | "made" | "failed";
  /** The overlap of the two absences it happened in. */
  from: string;
  to: string;
  cell: string | null;
  village: string | null;
  /** The world day and hour, and where on the parcel, in local metres; each echo stands a step either side. */
  day: number | null;
  hour: number | null;
  x: number | null;
  y: number | null;
  /** What the village was talking about that day, in its own words; null for an ordinary day. */
  topic: string | null;
  lines: MeetingLine[];
  /** `Person.id`s of villagers who saw them talk: only when something was said aloud. */
  witnesses: string[];
  madeAt: string;
  /** When `making` began, so a fill that died can be taken over. */
  makingAt: string | null;
  readA: string | null;
  readB: string | null;
  /**
   * Each person's answers to their own echo's lines, by line index: true "that's me" (or "I'd have said
   * that"), false "not me". Kept apart, each written only by its person, so two answering at once lose nothing.
   */
  feedbackA: Record<string, boolean>;
  feedbackB: Record<string, boolean>;
  reason: string | null;
}

// ── five minutes to you (C72) ───────────────────────────────────────────────────

/** A visit made for showing the world to someone: whose echo theirs meets, and their own voice, if they gave it. */
export interface DemoVisit {
  subject: string;
  host: string;
  /** What the host's echo calls them. */
  name: string;
  startedAt: string;
  /** Their voice, cloned at ElevenLabs with their yes; null when they gave none, or it is gone. */
  voiceId: string | null;
  /** The voice must be deleted by then. */
  voiceUntil: string | null;
  /** When it was deleted at ElevenLabs. */
  voiceDeletedAt: string | null;
}
