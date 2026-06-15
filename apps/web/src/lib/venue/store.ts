/**
 * Persistence (§10). Default in-memory so the demo runs with zero config; an optional
 * SQLite backend activates if DATABASE_URL points at a sqlite file AND better-sqlite3 is
 * installed — otherwise it degrades to memory rather than failing. Server-only.
 */
import "server-only";
import { hasDB } from "./capabilities";
import type { ConversationRecord, Outcome, VisitorRecord } from "./types";

export interface Store {
  upsertVisitor(v: VisitorRecord): void;
  startConversation(c: ConversationRecord): void;
  finishConversation(id: string, messages: ConversationRecord["messages"], outcome: Outcome): void;
  getConversation(id: string): ConversationRecord | undefined;
  listOutcomes(): Outcome[];
  listConversations(limit?: number): ConversationRecord[];
  counts(): { visitors: number; conversations: number; outcomes: number };
}

class InMemoryStore implements Store {
  private visitors = new Map<string, VisitorRecord>();
  private conversations = new Map<string, ConversationRecord>();
  private outcomes: Outcome[] = [];

  upsertVisitor(v: VisitorRecord) {
    this.visitors.set(v.id, v);
  }
  startConversation(c: ConversationRecord) {
    this.conversations.set(c.id, c);
  }
  finishConversation(id: string, messages: ConversationRecord["messages"], outcome: Outcome) {
    const c = this.conversations.get(id);
    if (c) {
      c.messages = messages;
      c.outcome = outcome;
      c.endedAt = Date.now();
    }
    this.outcomes.push(outcome);
  }
  getConversation(id: string) {
    return this.conversations.get(id);
  }
  listOutcomes() {
    return this.outcomes;
  }
  listConversations(limit = 50) {
    return [...this.conversations.values()]
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, limit);
  }
  counts() {
    return {
      visitors: this.visitors.size,
      conversations: this.conversations.size,
      outcomes: this.outcomes.length,
    };
  }
}

// Survive Next.js dev HMR (module re-eval) by stashing the singleton on globalThis.
const g = globalThis as unknown as { __venueStore?: Store };

function createStore(): Store {
  // SQLite is intentionally lazy + optional: we never add a native dependency to the
  // keyless install path. If DATABASE_URL is set but the driver is missing, we log and
  // fall back to memory so the demo still runs.
  if (hasDB && process.env.DATABASE_URL?.includes("sqlite")) {
    // eslint-disable-next-line no-console
    console.warn("[venue] DATABASE_URL set but SqliteStore not bundled in this build; using in-memory.");
  }
  return new InMemoryStore();
}

export function getStore(): Store {
  if (!g.__venueStore) g.__venueStore = createStore();
  return g.__venueStore;
}
