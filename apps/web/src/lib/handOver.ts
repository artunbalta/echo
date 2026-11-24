/**
 * A hand-over between two people's packs in a village room (DECISIONS C110), read and worked out here and
 * made by `/api/village/hand`. Pure.
 */
import { OFFER_KINDS, ROOM_VILLAGES, normalizeRoomCode, type HandRequest, type OfferKind } from "@echo/shared";
import { ITEMS, add, remove, type Pack } from "@echo/planet";

const itemOrNull = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" && ITEMS[v] ? v : undefined);

/** The request as it can be made, or null. */
export function readHand(raw: unknown): HandRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || r.id.length > 120) return null;
  if (typeof r.cell !== "string" || !ROOM_VILLAGES.includes(r.cell)) return null;
  if (typeof r.room !== "string" || normalizeRoomCode(r.room) !== r.room) return null;
  if (!OFFER_KINDS.includes(r.kind as OfferKind)) return null;
  for (const s of [r.from, r.to]) if (typeof s !== "string" || !s || s.length > 200) return null;
  if (r.from === r.to) return null;
  const item = itemOrNull(r.item);
  const back = itemOrNull(r.back);
  if (item === undefined || back === undefined) return null;
  const kind = r.kind as OfferKind;
  // A gift is an item and nothing back; a trade, one for one; an ask, nothing held out and something back.
  if (kind === "give" ? item === null || back !== null : kind === "trade" ? item === null || back === null : item !== null || back === null) return null;
  if (typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  return { id: r.id, cell: r.cell, room: r.room, kind, from: r.from as string, to: r.to as string, item, back, at: r.at };
}

/** Both packs after the hand-over, or why it cannot be made. Pure. */
export function handOver(h: Pick<HandRequest, "item" | "back">, from: Pack, to: Pack): { from: Pack; to: Pack } | { error: "not_carried" | "not_theirs" | "pack_full" } {
  let a: Pack | null = from;
  let b: Pack | null = to;
  // What each lets go of first, so a trade of one thing for one thing never needs a free place.
  if (h.item) {
    a = remove(a, h.item);
    if (!a) return { error: "not_carried" };
  }
  if (h.back) {
    b = remove(b, h.back);
    if (!b) return { error: "not_theirs" };
  }
  if (h.item) {
    b = add(b, h.item);
    if (!b) return { error: "pack_full" };
  }
  if (h.back) {
    a = add(a, h.back);
    if (!a) return { error: "pack_full" };
  }
  return { from: a, to: b };
}
