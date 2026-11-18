"use client";

/**
 * Your echo standing in for you (DECISIONS C103), from the page: the yes, the record it earns the right
 * from, and where it stands.
 *
 * The record is the envelopes (`Envelopes.tsx`): every call the echo sealed before a moment, settled with
 * what you did. With a yes, settled envelopes go to `/api/echo/looks` a few seconds after they settle and
 * once more as the page closes, each once (`kept`); with a no, nothing goes and what had gone is erased by
 * the server. Where the echo stands is the server's answer (`/api/echo/standin`), read off what it kept.
 *
 * With the yes comes the brief the server signs from that record (C104): what the echo keeps your body by
 * in a village room when you leave it. It is handed to the room (`setStandInBrief`), asked for afresh well
 * before it runs out, and taken back from the room with a no.
 *
 * Only on a yes to watching: an echo that has not watched has nothing to stand in from.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConsentState } from "@/game/world/measure";
import { ensureIdentity, identityHeaders } from "@/lib/identity";
import { markKept, unkept } from "@/lib/knowable/envelopes";
import type { Standing } from "@/lib/knowable/standing";
import { setStandInBrief } from "@/lib/villageRoom";

import type { Envelopes } from "./Envelopes";

/** Seconds after an envelope settles before it goes: a few settle together when a moment ends. */
const SEND_MS = 3000;
const ROWS_MAX = 200;
/** A brief is good for two hours (`STAND_IN.briefMs`); it is asked for afresh every twenty minutes. */
const BRIEF_EVERY_MS = 20 * 60 * 1000;

export interface StandIn {
  /** Whether it can be asked for at all here: a yes to watching. */
  can: boolean;
  on: boolean;
  /** Calls the server keeps. */
  kept: number;
  standing: Standing[] | null;
  busy: boolean;
  error: boolean;
  setOn: (on: boolean) => Promise<void>;
  /** Ask the server again: after a "that was not me", the standing and the brief that follow (C105). */
  refresh: () => Promise<void>;
}

export function useStandIn(env: Envelopes, consent: ConsentState, cell: string): StandIn {
  const can = consent === "accepted";
  const [on, setOnState] = useState(false);
  const [kept, setKept] = useState(0);
  const [standing, setStanding] = useState<Standing[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // The record and the cell as they are now, read when a send goes: the page re-renders far more often than
  // envelopes settle, and a timer re-armed on every render would never go off.
  const envRef = useRef(env);
  envRef.current = env;
  const cellRef = useRef(cell);
  cellRef.current = cell;

  const load = useCallback(async () => {
    try {
      await ensureIdentity();
      const r = await fetch("/api/echo/standin", { headers: identityHeaders() });
      if (!r.ok) return;
      const d = (await r.json()) as { on?: boolean; kept?: number; standing?: Standing[]; brief?: string };
      setOnState(d.on === true);
      setStandInBrief(d.on === true && typeof d.brief === "string" ? d.brief : null);
      setKept(d.kept ?? 0);
      setStanding(d.standing ?? null);
    } catch {
      // Asked again on the next change.
    }
  }, []);

  useEffect(() => {
    if (can) void load();
  }, [can, load]);

  useEffect(() => {
    if (!can || !on) return;
    const id = setInterval(() => void load(), BRIEF_EVERY_MS);
    return () => clearInterval(id);
  }, [can, on, load]);

  const send = useCallback(
    async (closing = false) => {
      const rows = unkept(envRef.current.book, cellRef.current).slice(0, ROWS_MAX);
      if (rows.length === 0) return;
      try {
        const r = await fetch("/api/echo/looks", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ rows }), keepalive: closing });
        if (r.status === 409) {
          // The yes was taken back elsewhere: nothing more goes until it is given again.
          setOnState(false);
          return;
        }
        const d = r.ok ? ((await r.json()) as { taken?: string[]; refused?: string[] }) : null;
        const done = [...(d?.taken ?? []), ...(d?.refused ?? [])];
        if (done.length) envRef.current.apply((b) => markKept(b, done));
        if (!closing && d) void load();
      } catch {
        // They go with the next.
      }
    },
    [load],
  );

  const waiting = useMemo(() => unkept(env.book, cell).length, [env.book, cell]);
  useEffect(() => {
    if (!can || !on || waiting === 0) return;
    const id = setTimeout(() => void send(), SEND_MS);
    const closing = () => void send(true);
    window.addEventListener("pagehide", closing);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pagehide", closing);
    };
  }, [can, on, waiting, send]);

  const setOn = useCallback(
    async (yes: boolean) => {
      setBusy(true);
      setError(false);
      try {
        await ensureIdentity();
        const r = await fetch("/api/echo/standin", { method: "POST", headers: identityHeaders({ "content-type": "application/json" }), body: JSON.stringify({ on: yes }) });
        if (!r.ok) {
          setError(true);
          return;
        }
        setOnState(yes);
        if (yes) await send();
        else {
          // The room lets the body go when you do, from now on.
          setStandInBrief(null);
          // What went is gone on the server; the envelopes here may go again after a new yes.
          envRef.current.apply((b) => ({ ...b, chain: b.chain.map((e) => (e.kept ? { ...e, kept: false } : e)) }));
        }
        await load();
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [send, load],
  );

  return { can, on, kept, standing, busy, error, setOn, refresh: load };
}
