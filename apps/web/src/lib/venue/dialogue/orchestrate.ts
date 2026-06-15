/**
 * Conversation orchestration (§7.2/§8). Two entry points share one engine:
 *  - simulateConversation: full autonomous visitor↔salesperson run (drives both sides).
 *  - humanSalesTurn: one salesperson reply to a human's typed message, advancing state.
 * Both persist to the Store so the research dashboard fills in either mode. Server-only.
 */
import "server-only";
import type {
  ConversationContext,
  ConversationRecord,
  DialogueMessage,
  Outcome,
  SalesState,
  TravelerProfile,
} from "../types";
import { getStore } from "../store";
import { getDialogueEngine } from "./factory";

const SALES_SEQUENCE: SalesState[] = ["GREET", "QUALIFY", "PITCH", "OBJECTION", "CLOSE", "CAPTURE"];

function newId(prefix: string): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Run a complete autonomous conversation for a simulated visitor, persist, and return it. */
export async function simulateConversation(
  profile: TravelerProfile,
  dwellSeconds: number,
): Promise<ConversationRecord> {
  const engine = getDialogueEngine();
  const store = getStore();
  const conversationId = newId("c");
  store.upsertVisitor({ id: profile.id, isHuman: false, profile, createdAt: Date.now() });

  const ctx: ConversationContext = {
    conversationId,
    state: "GREET",
    history: [],
    qualification: {},
    profile,
    isHuman: false,
  };
  const record: ConversationRecord = {
    id: conversationId,
    visitorId: profile.id,
    isHuman: false,
    startedAt: Date.now(),
    messages: [],
  };
  store.startConversation(record);

  for (const state of SALES_SEQUENCE) {
    ctx.state = state;
    const s = await engine.salesTurn(ctx);
    push(ctx, "sales", s.text, state);
    if (state === "CAPTURE" || s.done) break;
    const v = await engine.visitorTurn(ctx, profile);
    push(ctx, "visitor", v.text, state);
    if (v.intent) Object.assign(ctx.qualification, stripLeaving(v.intent));
  }

  const outcome: Outcome = { ...(await engine.finalize(ctx)), dwellSeconds, transcriptId: conversationId };
  store.finishConversation(conversationId, ctx.history, outcome);
  return { ...record, messages: ctx.history, outcome, endedAt: Date.now() };
}

/** Begin a human-led conversation; returns the salesperson's opening line. */
export async function startHumanConversation(): Promise<{ conversationId: string; reply: DialogueMessage; state: SalesState }> {
  const engine = getDialogueEngine();
  const store = getStore();
  const conversationId = newId("h");
  store.upsertVisitor({ id: conversationId, isHuman: true, createdAt: Date.now() });
  store.startConversation({ id: conversationId, visitorId: conversationId, isHuman: true, startedAt: Date.now(), messages: [] });

  const ctx: ConversationContext = { conversationId, state: "GREET", history: [], qualification: {}, isHuman: true };
  const s = await engine.salesTurn(ctx);
  push(ctx, "sales", s.text, "GREET");
  persist(conversationId, ctx);
  return { conversationId, reply: ctx.history[0], state: s.nextState };
}

/** One salesperson reply to a human message. Advances state; finalizes at CAPTURE. */
export async function humanSalesTurn(
  conversationId: string,
  userText: string,
  state: SalesState,
): Promise<{ reply: DialogueMessage; nextState: SalesState; done: boolean; outcome?: Outcome }> {
  const engine = getDialogueEngine();
  const store = getStore();
  const existing = store.getConversation(conversationId);
  const history: DialogueMessage[] = existing?.messages ? [...existing.messages] : [];

  history.push({ who: "visitor", text: userText, state });
  const ctx: ConversationContext = {
    conversationId,
    state,
    history,
    qualification: extractQualification(history),
    isHuman: true,
  };
  const s = await engine.salesTurn(ctx);
  push(ctx, "sales", s.text, state);
  const done = state === "CAPTURE" || !!s.done;

  let outcome: Outcome | undefined;
  if (done) {
    outcome = await engine.finalize(ctx);
    store.finishConversation(conversationId, ctx.history, outcome);
  } else {
    persist(conversationId, ctx);
  }
  return { reply: ctx.history[ctx.history.length - 1], nextState: s.nextState, done, outcome };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function push(ctx: ConversationContext, who: "sales" | "visitor", text: string, state: SalesState) {
  ctx.history.push({ who, text, state });
}
function stripLeaving(intent: Record<string, unknown>) {
  const { leaving, ...rest } = intent;
  void leaving;
  return rest;
}
function persist(conversationId: string, ctx: ConversationContext) {
  const store = getStore();
  const rec = store.getConversation(conversationId);
  if (rec) rec.messages = ctx.history;
}

/** Lightweight keyword extraction so the human path gathers some qualification too. */
function extractQualification(history: DialogueMessage[]): ConversationContext["qualification"] {
  const said = history.filter((m) => m.who === "visitor").map((m) => m.text).join(" ");
  const q: ConversationContext["qualification"] = {};
  const party = said.match(/(\d+)\s*(kişi|kisi|person|people)/i);
  if (party) q.partySize = parseInt(party[1], 10);
  if (/pahal|bütçe|ucuz|fiyat/i.test(said)) q.budgetBand = "low";
  return q;
}
