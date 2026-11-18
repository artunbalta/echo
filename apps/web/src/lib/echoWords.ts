/**
 * Your words kept for your echo to learn to talk from (DECISIONS C108), as the page holds it: whether you
 * said yes, and the three things the page sends while you did.
 *
 * `useWords` (components/world/useWords.ts) reads the yes from the server and sets it here; the talk panel
 * and the room's line read it when a line is said, so nothing is sent before a yes or after a no.
 *
 *   - `askGuess`: a villager has just spoken; the echo's guess of your answer, sealed, comes back as a box
 *     this page cannot open.
 *   - `settleGuess`: you have answered; the box goes back with your answer.
 *   - `keepSaid`: a line with no guess waiting for it (to someone in a room, aloud in one, or your first line
 *     to a villager). What anyone else said to you is never sent.
 *
 * Every send is quiet: it changes nothing on the screen, in a village room least of all, where a mark under
 * one kind of line would tell a villager from a person.
 */
import { identityHeaders } from "@/lib/identity";

let on = false;
const subs = new Set<(on: boolean) => void>();

/** Whether you said yes to keeping your words, as last read. */
export function wordsKept(): boolean {
  return on;
}

export function setWordsKept(yes: boolean): void {
  if (on === yes) return;
  on = yes;
  for (const fn of subs) fn(on);
}

export function onWordsKept(fn: (on: boolean) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** The echo's guess of your answer to the villager's last line, sealed; null when there is none to be had. */
export async function askGuess(a: { cell: string; room: string | null; person: string; conv: string; history: { role: "stranger" | "villager"; text: string }[] }): Promise<string | null> {
  if (!on) return null;
  try {
    const r = await fetch("/api/echo/guess", {
      method: "POST",
      headers: identityHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ cell: a.cell, room: a.room ?? undefined, person: a.person, conv: a.conv, history: a.history }),
    });
    if (r.status === 409) setWordsKept(false);
    const d = r.ok ? ((await r.json()) as { box?: string }) : null;
    return typeof d?.box === "string" ? d.box : null;
  } catch {
    return null;
  }
}

/** Your answer, with the box that was sealed before it. */
export function settleGuess(box: string, said: string): void {
  if (!on) return;
  void fetch("/api/echo/settle", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ box, said }), keepalive: true })
    .then((r) => r.status === 409 && setWordsKept(false))
    .catch(() => {});
}

/** One line of yours with no guess waiting for it. `heard` only for a villager's line. */
export function keepSaid(a: { cell: string; room: string | null; to: "villager" | "person" | "aloud"; said: string; heard?: string | null }): void {
  if (!on || !a.said.trim()) return;
  void fetch("/api/echo/said", {
    method: "POST",
    headers: identityHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ cell: a.cell, room: a.room ?? undefined, to: a.to, said: a.said, ...(a.to === "villager" && a.heard ? { heard: a.heard } : {}) }),
    keepalive: true,
  })
    .then((r) => r.status === 409 && setWordsKept(false))
    .catch(() => {});
}
