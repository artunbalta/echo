/**
 * Shared, isomorphic types for the THY brand-stand demo (concert venue scene).
 * Safe to import from both the PixiJS client and server API routes — NO process.env
 * or server-only resources here.
 */

// ── Traveler (visitor NPC or human) ──────────────────────────────────────────
export type Segment = "leisure" | "business" | "family" | "student" | "VFR";
export type BudgetSensitivity = "low" | "medium" | "high";
export type Loyalty = "none" | "occasional" | "frequent";
export type Objection =
  | "price"
  | "schedule"
  | "route"
  | "loyalty-to-competitor"
  | "just-browsing";

export interface TravelerProfile {
  id: string;
  segment: Segment;
  desiredDestination: string;
  flexibleDestination: boolean;
  travelMonth: string;
  partySize: number;
  budgetSensitivity: BudgetSensitivity;
  loyalty: Loyalty; // THY Miles&Smiles standing
  primaryObjection: Objection;
  consideredAlternatives: string[]; // other "islands"/airlines they might defect to
}

// ── Conversation ─────────────────────────────────────────────────────────────
export type SalesState =
  | "GREET"
  | "QUALIFY"
  | "PITCH"
  | "OBJECTION"
  | "CLOSE"
  | "CAPTURE"
  | "DONE";

export type Speaker = "sales" | "visitor";

export interface DialogueMessage {
  who: Speaker;
  text: string;
  state: SalesState;
}

/** Running, partially-filled qualification gathered during the conversation. */
export interface Qualification {
  destination?: string;
  travelMonth?: string;
  partySize?: number;
  budgetBand?: BudgetBand;
  purpose?: Segment;
}

export interface ConversationContext {
  conversationId: string;
  state: SalesState;
  history: DialogueMessage[];
  qualification: Qualification;
  /** Present when the counterpart is a simulated visitor (full auto sim). */
  profile?: TravelerProfile;
  isHuman: boolean;
}

// ── Outcome (the research record) ─────────────────────────────────────────────
export type BudgetBand = "low" | "mid" | "high";
export type NoPurchaseReason =
  | "price"
  | "schedule"
  | "route"
  | "competitor"
  | "browsing"
  | "other";
export type Sentiment = "positive" | "neutral" | "negative";

export interface Outcome {
  visitorId: string;
  isHuman: boolean;
  segment: string;
  destinationRequested: string;
  budgetBand: BudgetBand;
  partySize: number;
  booked: boolean;
  noPurchaseReason?: NoPurchaseReason;
  defectedTo?: string; // which alternative island/airline they left for, if any
  sentiment: Sentiment;
  dwellSeconds: number;
  transcriptId: string;
}

// ── Persisted records ─────────────────────────────────────────────────────────
export interface VisitorRecord {
  id: string;
  isHuman: boolean;
  profile?: TravelerProfile;
  createdAt: number;
}

export interface ConversationRecord {
  id: string;
  visitorId: string;
  isHuman: boolean;
  startedAt: number;
  endedAt?: number;
  messages: DialogueMessage[];
  outcome?: Outcome;
}

// ── Capability summary surfaced to the UI ─────────────────────────────────────
export type DialogueMode = "live" | "mock";
export interface ModeSummary {
  dialogue: DialogueMode;
  art: DialogueMode;
  voice: DialogueMode;
  persistence: "db" | "memory";
  /** One-line human summary, e.g. "mock mode (no keys)". */
  label: string;
}
