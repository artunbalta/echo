/**
 * Who has just joined the waitlist on this page (DECISIONS C97), so the page need not ask twice.
 *
 * The landing now takes a name and an email at its head, and lower down offers a character to go with
 * the place. Someone who joined at the head and then picks a figure has already said who they are: the
 * second form reads it from here and sends the same name and email with the figure, which the list
 * takes as the same person and the same place (`waitlist_join` updates in place).
 *
 * Kept for the life of the page and nowhere else: not in storage, not in a cookie. A reload asks again.
 */
import { useSyncExternalStore } from "react";

export interface Seat {
  name: string;
  email: string;
  /** The place in the line the database gave, when it gave one. */
  seat: number | null;
}

let current: Seat | null = null;
const listeners = new Set<() => void>();

export function setSeat(seat: Seat): void {
  current = seat;
  for (const l of listeners) l();
}

/** The person who joined on this page, or null. Null on the server and until someone joins. */
export function useSeat(): Seat | null {
  return useSyncExternalStore<Seat | null>(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => current,
    () => null,
  );
}
