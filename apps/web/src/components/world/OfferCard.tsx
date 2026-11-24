"use client";

/**
 * An offer someone in a village room made you (DECISIONS C110): what they hold out, offer in trade, or ask for
 * their help, as a villager is offered those things at arm's length. You take it or not; for a trade or an
 * ask, you choose what goes back from your pack. The room makes the hand-over on your yes and both packs come
 * back as they now are; nothing of it is measured or kept.
 *
 * One at a time: a second offer waits behind the first. An offer not answered before its time is gone, as one
 * made to someone who did not turn round is.
 */
import { useEffect, useState } from "react";
import { ITEMS, type Pack } from "@echo/planet";
import type { OfferedMsg } from "@echo/shared";

import { t as tr, useLang } from "@/lib/i18n";
import { answerOffer, onOffered, onSettled } from "@/lib/villageRoom";

const itemName = (id: string | null) => (id ? (ITEMS[id]?.name ?? id) : "");

export default function OfferCard({ pack, onPack, nameOf, say }: { pack: Pack; onPack: (p: Pack) => void; nameOf: (id: string) => string | null; say: (text: string) => void }) {
  const lang = useLang();
  const [queue, setQueue] = useState<OfferedMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const now = queue[0] ?? null;

  useEffect(() => onOffered((m) => setQueue((q) => (q.some((o) => o.id === m.id) ? q : [...q, m]))), []);
  useEffect(
    () =>
      onSettled((m) => {
        if (m.side !== "to") return;
        setQueue((q) => q.filter((o) => o.id !== m.id));
        setBusy(false);
        if (m.pack) onPack(m.pack);
        if (m.ok) say(m.kind === "give" ? tr(lang, "offer.gotGift", { item: itemName(m.item) }) : m.kind === "trade" ? tr(lang, "offer.gotTrade", { item: itemName(m.item), back: itemName(m.back) }) : tr(lang, "offer.gotAsk", { back: itemName(m.back) }));
      }),
    [lang, onPack, say],
  );
  // An offer past its time is gone from the card; the room says the same to whoever made it.
  useEffect(() => {
    if (!now) return;
    const t = setTimeout(() => setQueue((q) => q.filter((o) => o.id !== now.id)), Math.max(0, now.until - Date.now()));
    return () => clearTimeout(t);
  }, [now]);

  if (!now) return null;
  const name = nameOf(now.from)?.split(" ")[0] ?? "Someone";
  const theirs = Object.keys(pack).filter((id) => (pack[id] ?? 0) > 0 && ITEMS[id]).slice(0, 4);
  const answer = (yes: boolean, back: string | null) => {
    if (busy) return;
    setBusy(true);
    if (!answerOffer(now.id, yes, back)) {
      setBusy(false);
      setQueue((q) => q.filter((o) => o.id !== now.id));
    }
    // A no is not waited on: the card goes, and the room tells both.
    if (!yes) setQueue((q) => q.filter((o) => o.id !== now.id));
  };
  const line = now.kind === "give" ? tr(lang, "offer.give", { name, item: itemName(now.item) }) : now.kind === "trade" ? tr(lang, "offer.trade", { name, item: itemName(now.item) }) : tr(lang, "offer.ask", { name });
  const button = "rounded-full px-3 py-1 text-xs disabled:opacity-40";

  return (
    <section data-offer-card={now.kind} aria-live="polite" className="absolute bottom-[13.5rem] left-1/2 z-40 w-[min(440px,92vw)] -translate-x-1/2 hud-pop hud-in px-4 py-3 text-parchment">
      <p className="text-sm">{line}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {now.kind === "give" ? (
          <button type="button" data-offer-take disabled={busy} onClick={() => answer(true, null)} className={`${button} bg-parchment font-medium text-ink`}>
            {tr(lang, "offer.take")}
          </button>
        ) : theirs.length ? (
          theirs.map((id) => (
            <button key={id} type="button" data-offer-back={id} disabled={busy} onClick={() => answer(true, id)} className={`${button} bg-parchment font-medium text-ink`}>
              {tr(lang, "offer.giveBack", { item: itemName(id) })}
            </button>
          ))
        ) : (
          <span className="text-xs italic text-parchment/50">{tr(lang, "offer.nothing")}</span>
        )}
        <button type="button" data-offer-no disabled={busy} onClick={() => answer(false, null)} className={`${button} border border-parchment/20`}>
          {tr(lang, "offer.no")}
        </button>
      </div>
    </section>
  );
}
