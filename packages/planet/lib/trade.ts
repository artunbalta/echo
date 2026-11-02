/**
 * A stranger trading with a villager, and labour for labour (DECISIONS C58).
 *
 * NO PRICE, NO VALUE, NO NUMBER (Design Law 1, the shape C58 chose instead of a SOC-7.B exemption).
 * Nothing here weighs one thing against another. A villager takes what is offered for a reason they
 * could say, or turns it down for one:
 *
 * - **they take it** if it is the very thing they need this week (`needs.ts`), something they are
 *   glad of (their trade, their age: `items.ts`), or something their work uses;
 * - **they take it as a favour** if the stranger has been good to them or theirs;
 * - **they turn it down** if they make it themselves, if they have no use for it, if the stranger has
 *   wronged them, or if they have already traded with the stranger today.
 *
 * What they give is what their own work leaves them to spare: a fisher a fish, a smith a knife, a
 * trader what came back from market (`markets.ts`). One thing for one thing, because nothing here
 * counts.
 *
 * LABOUR FOR LABOUR. A stranger who helped a household — weeded its field, bailed its boat, worked a
 * shift beside it — may ask for something back. It is owed while the help is more recent than the
 * last return, within {@link TRADING}.owedDays. That is a promise someone remembers, not a balance:
 * once it is returned, it is square.
 *
 * Pure. The trade route asks this, and records what it answers.
 */

import { grievance, knownDeeds, type Deed } from "./deeds.js";
import { ITEMS, gladOf } from "./items.js";
import { stockOn, TRADE_GOODS } from "./markets.js";
import type { Need } from "./needs.js";
import { TRADE_WANTS } from "./needs.js";
import { ageYears, occupationOn, type Person, type Settlement } from "./society.js";
import type { VillagePlan } from "./village.js";

export const TRADING = {
  /** Help is owed back for this many world days. */
  owedDays: 30,
  /** Kindness and help this recent make a villager oblige a stranger. */
  friendDays: 60,
  /** Under this age a villager has nothing of their own to trade. */
  minAgeYears: 16,
} as const;

export type TradeWhy =
  /** Accepted. */
  | "need" | "glad" | "wants" | "friend" | "owed"
  /** Turned down. */
  | "young" | "wronged" | "busy" | "spare" | "own" | "no-use" | "not-owed";

export interface TradeAsk {
  /** What the stranger holds out, by item id; null to ask for something back for their help. */
  offered: string | null;
  /** What they ask for, by item id; null for whatever the villager can spare. */
  asked: string | null;
}

export interface TradeAnswer {
  ok: boolean;
  why: TradeWhy;
  /** What the villager hands over, when they do. */
  gives: string | null;
  /** What they could spare today, so a refusal can say so. */
  spares: string[];
}

const householdOf = (p: Person, day: number) => (p.partnerDay !== null && p.partnerDay <= day ? p.household : p.bornInto);

/** What a villager's work leaves them to spare today: their trade's good, and a trader's market stock. */
export function sparesOf(s: Settlement, plan: VillagePlan | null, p: Person, day: number): string[] {
  if (ageYears(p, day) < TRADING.minAgeYears) return [];
  const out: string[] = [];
  const own = TRADE_GOODS[occupationOn(p, day)];
  if (own) out.push(own);
  const m = plan?.market ?? null;
  if (m && m.goers.includes(p.id)) out.push(...stockOn(m, day));
  return [...new Set(out)];
}

/** Whether this villager's household owes the stranger for help: help more recent than the last return. */
export function owes(s: Settlement, p: Person, deeds: readonly Deed[], day: number): boolean {
  const home = householdOf(p, day);
  const family = new Set(s.people.filter((q) => householdOf(q, day) === home).map((q) => q.id));
  const theirs = (d: Deed) => d.owners.some((o) => family.has(o)) && day - d.day <= TRADING.owedDays && d.day <= day;
  const lastHelp = Math.max(-Infinity, ...deeds.filter((d) => theirs(d) && d.reading === "help").map((d) => d.day + d.hour));
  const lastReturn = Math.max(-Infinity, ...deeds.filter((d) => theirs(d) && d.verb === "ask-back").map((d) => d.day + d.hour));
  return lastHelp > lastReturn;
}

/** What a villager says to an offer, and why. */
export function tradeAnswer(
  s: Settlement,
  plan: VillagePlan | null,
  me: Person,
  day: number,
  ask: TradeAsk,
  deeds: readonly Deed[],
  need: Need | null = null,
): TradeAnswer {
  const spares = sparesOf(s, plan, me, day);
  const no = (why: TradeWhy): TradeAnswer => ({ ok: false, why, gives: null, spares });
  if (ageYears(me, day) < TRADING.minAgeYears) return no("young");
  if (grievance(s, me, deeds, day, plan)) return no("wronged");
  if (deeds.some((d) => (d.verb === "trade" || d.verb === "ask-back") && d.day === day && d.owners.includes(me.id))) return no("busy");
  const gives = ask.asked ?? spares[0] ?? null;
  if (gives === null || !spares.includes(gives)) return no("spare");
  const yes = (why: TradeWhy): TradeAnswer => ({ ok: true, why, gives, spares });

  if (ask.offered === null) return owes(s, me, deeds, day) ? yes("owed") : no("not-owed");
  const trade = occupationOn(me, day);
  if (TRADE_GOODS[trade] === ask.offered) return no("own");
  if (need?.item === ask.offered) return yes("need");
  if (gladOf(ask.offered, trade, ageYears(me, day))) return yes("glad");
  if (TRADE_WANTS[trade] === ask.offered) return yes("wants");
  const home = householdOf(me, day);
  const family = new Set(s.people.filter((q) => householdOf(q, day) === home).map((q) => q.id));
  const liked = knownDeeds(s, me, deeds, day, plan).some(
    (k) => (k.deed.reading === "kindness" || k.deed.reading === "help") && day - k.deed.day <= TRADING.friendDays && k.deed.owners.some((o) => family.has(o)),
  );
  return liked ? yes("friend") : no("no-use");
}

const named = (id: string | null) => (id ? (ITEMS[id]?.name ?? id) : "");
const bare = (id: string) => named(id).replace(/^(a|an|some) (length of |piece of |loaf of |bunch of |handful of )?/, "");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The villager's answer, in their words. No number, because there is none. */
export function tradeWords(a: TradeAnswer, ask: TradeAsk, market: { partner: string; brings: string[]; daysTo: number } | null = null): string {
  const got = named(a.gives);
  switch (a.why) {
    case "need":
      return `That's just what I was after. Take ${got}, and thank you.`;
    case "glad":
      return `${cap(named(ask.offered))}? I'll be glad of that. Here — ${got} for it.`;
    case "wants":
      return `I can use that in my work. ${cap(got)} for it, then.`;
    case "friend":
      return `I've no great need of it — but you've been good to us. Take ${got}.`;
    case "owed":
      return `You put in a day for us. Here — ${got}, and we're square.`;
    case "young":
      return "It's not mine to trade. Ask at home.";
    case "wronged":
      return "Not from you. Not after what you did.";
    case "busy":
      return "We've done our trading today, you and I.";
    case "own":
      return `${cap(named(ask.offered))}? I've plenty of those myself.`;
    case "no-use":
      return `I've no use for ${named(ask.offered)}, I'm sorry.`;
    case "not-owed":
      return "I don't owe you anything that I know of.";
    case "spare": {
      if (market && market.brings.length > 0) {
        const when = market.daysTo === 0 ? "today" : market.daysTo === 1 ? "tomorrow" : `in ${market.daysTo} days`;
        return `I've nothing left to spare. It's market ${when} — I'll have ${market.brings.map(bare).join(" and ")} from ${market.partner}.`;
      }
      if (ask.asked && a.spares.length > 0) return `I've no ${bare(ask.asked)} to spare. I could spare ${named(a.spares[0])}.`;
      return ask.asked ? `I've no ${bare(ask.asked)} to spare.` : "I've nothing to spare, I'm afraid.";
    }
  }
}
