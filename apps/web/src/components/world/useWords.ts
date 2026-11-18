"use client";

/**
 * Your yes to keeping your words, for your echo to learn to talk from (DECISIONS C108), from the page: the yes,
 * how many lines are kept, and its last guesses beside what you said.
 *
 * The yes is the server's (`/api/echo/words`); this reads it, says it to the page (`setWordsKept`, which the
 * talk panel and the room's line read before sending anything), and changes it. Asked only on a yes to
 * watching, as the stand-in is: the card is where a person first says what may be noticed.
 */
import { useCallback, useEffect, useState } from "react";

import type { ConsentState } from "@/game/world/measure";
import { onWordsKept, setWordsKept } from "@/lib/echoWords";
import { ensureIdentity, identityHeaders } from "@/lib/identity";

/** One settled guess, as "When you leave" shows it. */
export interface ShownGuess {
  heard: string;
  guess: string;
  said: string;
  hit: boolean;
  why: string | null;
  at: string;
}

export interface Words {
  can: boolean;
  on: boolean;
  kept: number;
  guesses: ShownGuess[];
  busy: boolean;
  error: boolean;
  setOn: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useWords(consent: ConsentState): Words {
  const can = consent === "accepted";
  const [on, setOnState] = useState(false);
  const [kept, setKept] = useState(0);
  const [guesses, setGuesses] = useState<ShownGuess[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      await ensureIdentity();
      const r = await fetch("/api/echo/words", { headers: identityHeaders() });
      if (!r.ok) return;
      const d = (await r.json()) as { on?: boolean; kept?: number; guesses?: ShownGuess[] };
      setOnState(d.on === true);
      setWordsKept(d.on === true);
      setKept(d.kept ?? 0);
      setGuesses(Array.isArray(d.guesses) ? d.guesses : []);
    } catch {
      // Asked again on the next change.
    }
  }, []);

  useEffect(() => {
    if (can) void load();
    else setWordsKept(false);
  }, [can, load]);

  // A send refused because the yes was taken back elsewhere says so here too.
  useEffect(() => onWordsKept((yes) => setOnState(yes)), []);

  const setOn = useCallback(
    async (yes: boolean) => {
      setBusy(true);
      setError(false);
      try {
        await ensureIdentity();
        const r = await fetch("/api/echo/words", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ on: yes }) });
        if (!r.ok) {
          setError(true);
          return;
        }
        setOnState(yes);
        setWordsKept(yes);
        await load();
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return { can, on, kept, guesses, busy, error, setOn, refresh: load };
}
