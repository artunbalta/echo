/**
 * DialogueEngine (§8): one interface, two implementations. The rest of the app depends
 * only on this contract and never knows whether dialogue is LLM-driven or scripted.
 */
import type { ConversationContext, DialogueMode, Outcome, SalesState, TravelerProfile } from "../types";

export interface SalesTurn {
  text: string;
  nextState: SalesState;
  done?: boolean;
}
export interface VisitorTurn {
  text: string;
  /** Signals the visitor revealed (destination, budget, decision to leave, …). */
  intent?: Partial<ConversationContext["qualification"]> & { leaving?: boolean };
}

export interface DialogueEngine {
  readonly mode: DialogueMode;
  /** The salesperson's next line for ctx.state, plus the state to advance to. */
  salesTurn(ctx: ConversationContext): Promise<SalesTurn>;
  /** A simulated visitor's reply (auto-sim only). */
  visitorTurn(ctx: ConversationContext, profile: TravelerProfile): Promise<VisitorTurn>;
  /** Resolve the research record at the end of a conversation. */
  finalize(ctx: ConversationContext): Promise<Outcome>;
}
