/**
 * The pure parts of two echoes meeting (DECISIONS C71) that the villagers' notes need: kept apart from
 * `echoMeeting.ts`, which reaches the engine and the outings, so that `strangerNotes.ts` (which the
 * outings use) imports nothing that imports it back.
 */
import type { EchoMeeting } from "@/lib/echoTypes";

/** Which side of a meeting the caller is, or null when it is not theirs. */
export function sideOf(m: Pick<EchoMeeting, "a" | "b">, subject: string): "a" | "b" | null {
  return m.a === subject ? "a" : m.b === subject ? "b" : null;
}

/** What a villager who saw them talk can say of it to either of them: the last two, and only what was said aloud. */
export function seenTalkingLine(meetings: readonly EchoMeeting[], subject: string, cell: string, person: string, day: number): string {
  const seen = meetings
    .filter((m) => m.status === "made" && m.cell === cell && m.day !== null && m.day <= day && m.witnesses.includes(person) && sideOf(m, subject) !== null)
    .sort((a, b) => (b.day ?? 0) - (a.day ?? 0))
    .slice(0, 2);
  if (!seen.length) return "";
  const when = (d: number) => (d === day ? "earlier today" : d === day - 1 ? "yesterday" : `${day - d} days ago`);
  const items = seen.map((m) => {
    const side = sideOf(m, subject)!;
    const said = m.lines.filter((l) => l.said);
    const theirs = said.find((l) => l.who === side);
    const caught = theirs ? ` You caught this stranger saying: "${theirs.text.slice(0, 160)}"` : said.length ? " You did not catch what this stranger said." : "";
    return `${when(m.day!)}, on the green, talking with another stranger they seemed to know.${caught}`;
  });
  return `You saw this stranger ${items.join(" And ")}`;
}
