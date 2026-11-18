"use client";

/**
 * The door of a village room (DECISIONS C101), the room's chip while you are in one, and the line you say.
 *
 * THE DOOR. A room is a copy of this village for the people who share its code. One person starts a
 * room and sends the link (`/parcel/<cell>?room=<code>`); whoever opens it comes into the same copy.
 * The link is the whole invitation: a link opened by someone who has been in a room here before goes
 * straight in; anyone else sees the door first, with the code filled, and what it says.
 *
 * NO NAME AT THE DOOR (C107). Inside, you are someone of this land: a name in the village's own tongue,
 * an age and a trade, drawn from how your body looks in this copy, the same plate a visitor wears. The door
 * tells you who you are here; nobody else is told who that is.
 *
 * WHAT IT SAYS BEFORE ANYONE IS IN: that some of the people met here are villagers and that nobody is
 * marked. That is true of every room, and it is said once, at the door, rather than over anyone's head.
 *
 * SAYING SOMETHING. Enter opens a line at the foot of the screen, Enter says it to whoever stands
 * within earshot, Escape puts it away. While it is open the world's keys wait (`input.ts` lets a field
 * keep its keys).
 *
 * A COPY HAS ITS OWN WORLD (C102). Which world the page is in is the address's `?room=`, and this is the
 * one thing that writes it: on coming into a room, and on leaving one. Whenever it changes, the village is
 * built again with that world's changes and marks, so a copy's people are as its own visitors left them.
 * Someone who opens a room's link but has not come in yet is already in that copy's world, alone.
 *
 * WHEN YOU LEAVE (C103). The door is also where a person lets their echo take their place when they leave a
 * room, and sees, for every kind of situation, whether it has earned the right to (`standing.ts`). A no
 * erases what was kept.
 *
 * WHILE YOU WERE AWAY (C104). Coming back to a body your echo kept, the door opens on what it did: each
 * moment it met, and whether it did what it said you would or held back, and what it would have done.
 *
 * WATCHING IT, AND "NOT ME" (C105). Having left a room with your echo standing in, the door offers to
 * watch it from outside (`/watch`, in a tab of its own). The last time it kept your place is read back
 * from the server and shown under "When you leave", and beside each moment it could stand in at, you can
 * say it was not you: the echo then has more to show there before it acts again.
 *
 * LEARNING HOW YOU TALK (C108). Under "When you leave" is a second yes, of its own: to keep what you type, so
 * that your echo can learn to talk as you do. With it, before each of your answers to a villager your echo
 * seals a guess of it, and its last guesses are shown here beside what you said and whether they were taken
 * for the same; that is the record talking is earned from. Lines said here, aloud, are kept with the rest.
 * A no erases every line and every guess.
 */
import { useEffect, useRef, useState } from "react";
import { newRoomCode, normalizeRoomCode } from "@echo/shared";

import type { InteractLayer } from "@/game/world/interactLayer";
import type { PlanetWorld } from "@/game/world/PlanetWorld";
import type { VillagersLayer } from "@/game/world/villagersLayer";
import type { AwayEntry } from "@echo/shared";

import { ensureIdentity, identityHeaders } from "@/lib/identity";
import type { Standing } from "@/lib/knowable/standing";
import { t, useLang, type Key } from "@/lib/i18n";
import { keepSaid } from "@/lib/echoWords";
import { closePanel, openPanel, usePanel } from "@/lib/panels";
import { ROOM_PARAM, dismissAway, joinRoom, keptIn, leaveRoom, recentRooms, roomSelfLook, roomable, sayInRoom, useRoomView, worldQuery, worldRoom } from "@/lib/villageRoom";

import { AwayList, awaySum, shown, vetoKey, vetoMoment } from "./AwayList";

import EchoPanel from "./Panel";
import type { StandIn } from "./useStandIn";
import type { Words } from "./useWords";

const ERROR_KEY: Record<string, Key> = { full: "room.err.full", refused: "room.err.refused", offline: "room.err.offline" };

/** The page's address with the room's code in it, or without one. */
function withRoom(code: string | null): string {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set(ROOM_PARAM, code);
  else url.searchParams.delete(ROOM_PARAM);
  return url.toString();
}

/** The village again, as the world the address now names has it: its changes and its marks. */
async function showWorld(world: PlanetWorld | null, cell: string): Promise<void> {
  if (!world || world.region.cell !== cell) return;
  try {
    const r = await fetch(`/api/village/changes?${worldQuery(cell)}`);
    const d = r.ok ? ((await r.json()) as { changes?: unknown; effects?: unknown }) : null;
    if (!d) return;
    world.revillage(Array.isArray(d.changes) ? d.changes : []);
    world.context().layer<InteractLayer>("interact")?.setMarks(Array.isArray(d.effects) ? d.effects : []);
  } catch {
    // The village stays as it was; the next change of room asks again.
  }
}

/** One kind of situation, as the door says where the echo stands in it. Talking needs your words first (C108). */
function standingLine(lang: ReturnType<typeof useLang>, s: Standing, words: boolean): string {
  if (s.bucket === "talk" && !words) return t(lang, "standin.talkOff");
  if (s.looks === 0) return t(lang, "standin.none");
  if (s.level === "act") return t(lang, s.bucket === "talk" ? "standin.talkReady" : "standin.act");
  if (s.overconfident) return t(lang, "standin.over");
  const head = t(lang, s.level === "ask" ? "standin.ask" : "standin.watch");
  return s.toGo ? `${head} · ${t(lang, "standin.toGo", { n: s.toGo })}` : head;
}

/** What your echo did while you were away (C104), with "not me" beside what it could stand in at (C105). */
function AwayCard({
  lang,
  away,
  title,
  vetoed,
  onVeto,
  onOk,
}: {
  lang: ReturnType<typeof useLang>;
  away: { since: number; until: number; log: AwayEntry[] };
  title: string;
  vetoed: ReadonlySet<string>;
  onVeto: (e: AwayEntry) => void;
  onOk?: () => void;
}) {
  // Moments it met, and lines it said for you (C109).
  const met = away.log.filter(shown);
  const minutes = Math.max(1, Math.round((away.until - away.since) / 60000));
  return (
    <div className="mt-4 rounded-xl border border-echo/30 bg-echo/[0.06] p-3" data-standin-away={met.length}>
      <p className="font-serif text-[16px]">{title}</p>
      <p className="mt-1 text-[13px] text-parchment/75">{t(lang, "standin.away.kept", { m: minutes })}</p>
      {met.length === 0 ? (
        <p className="mt-2 text-[12px] text-parchment/55">{t(lang, "standin.away.none")}</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-parchment/55">{t(lang, "standin.away.sum", awaySum(met))}</p>
          <AwayList lang={lang} entries={met} vetoed={vetoed} onVeto={onVeto} />
        </>
      )}
      {onOk ? (
        <button type="button" data-standin-away-ok onClick={onOk} className="btn btn-sm btn-primary mt-3">
          {t(lang, "standin.away.ok")}
        </button>
      ) : null}
    </div>
  );
}

/** Your yes to keeping your words, and the echo's last guesses of what you would say beside what you did (C108). */
function WordsSection({ lang, words }: { lang: ReturnType<typeof useLang>; words: Words }) {
  return (
    <div className="mt-4 border-t border-parchment/10 pt-3" data-words={words.on ? "on" : "off"}>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input type="checkbox" data-words-toggle checked={words.on} disabled={words.busy} onChange={(e) => void words.setOn(e.target.checked)} className="h-4 w-4 accent-echo" />
        <span>{t(lang, "words.toggle")}</span>
      </label>
      <p className="mt-2 text-[12px] leading-relaxed text-parchment/60">{t(lang, "words.what")}</p>
      <p className="mt-1 text-[12px] text-parchment/45">{t(lang, "words.off")}</p>
      {words.error ? <p className="mt-2 text-xs text-rose-300">{t(lang, "standin.error")}</p> : null}
      {words.on ? (
        <>
          <p className="mt-2 text-[11px] text-parchment/40">{t(lang, "words.kept", { n: words.kept >= 500 ? "500+" : words.kept })}</p>
          {words.guesses.length === 0 ? (
            <p className="mt-2 text-[12px] text-parchment/55">{t(lang, "words.none")}</p>
          ) : (
            <div className="mt-3" data-words-guesses={words.guesses.length}>
              <p className="text-[12px] text-parchment/60">{t(lang, "words.guesses")}</p>
              <ul className="mt-1.5 space-y-2">
                {words.guesses.map((g) => (
                  <li key={g.at} data-words-guess={g.hit ? "same" : "other"} className="rounded-lg bg-parchment/[0.04] px-2.5 py-2 text-[12px] leading-snug">
                    <p className="text-parchment/45">“{g.heard}”</p>
                    <p className="mt-1 text-parchment/75">
                      <span className="text-parchment/45">{t(lang, "words.guessed")}: </span>
                      {g.guess}
                    </p>
                    <p className="text-parchment/75">
                      <span className="text-parchment/45">{t(lang, "words.said")}: </span>
                      {g.said}
                    </p>
                    <p className={`mt-1 text-[11px] ${g.hit ? "text-echo-soft" : "text-parchment/45"}`}>
                      {t(lang, g.hit ? "words.same" : "words.notSame")}
                      {g.why ? ` · ${g.why}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function RoomPanel({ cell, world, standIn, words }: { cell: string; world: () => PlanetWorld | null; standIn: StandIn; words: Words }) {
  const lang = useLang();
  const open = usePanel() === "room";
  const room = useRoomView();
  const [theirs, setTheirs] = useState("");
  const [copied, setCopied] = useState(false);
  const [saying, setSaying] = useState(false);
  const [line, setLine] = useState("");
  const sayRef = useRef<HTMLInputElement>(null);
  const wasInside = useRef(false);
  const can = roomable(cell);
  const [last, setLast] = useState<{ since: number; until: number; log: AwayEntry[] } | null>(null);
  const [vetoed, setVetoed] = useState<ReadonlySet<string>>(new Set());
  const [kept, setKept] = useState<{ code: string } | null>(null);

  // A link with a code in it: straight in for someone who has been through a door here before (and has read
  // it), else the door with the code filled.
  useEffect(() => {
    if (!can) return;
    const code = normalizeRoomCode(new URLSearchParams(window.location.search).get(ROOM_PARAM));
    if (!code) return;
    setTheirs(code);
    if (recentRooms(cell).length > 0) void joinRoom(cell, code);
    else openPanel("room");
  }, [can, cell]);

  // Leaving the page leaves the room.
  useEffect(() => () => leaveRoom(), []);

  // Back at a body your echo kept: the door opens on what it did.
  useEffect(() => {
    if (room.away) openPanel("room");
  }, [room.away]);

  // With the door open: where your echo keeps your place now, and the last time it did, as the server kept it.
  useEffect(() => {
    if (!open || !can) return;
    setKept(keptIn(cell));
    if (!standIn.on) return;
    let live = true;
    void (async () => {
      try {
        await ensureIdentity();
        const r = await fetch("/api/echo/keeping", { headers: identityHeaders() });
        const d = r.ok ? ((await r.json()) as { records?: { since: number; until: number; log: AwayEntry[] }[]; vetoes?: { at: number; kind: string }[] }) : null;
        if (!live || !d) return;
        setLast(d.records?.[0] ?? null);
        setVetoed(new Set((d.vetoes ?? []).map(vetoKey)));
      } catch {
        // Shown the next time the door opens.
      }
    })();
    return () => {
      live = false;
    };
    // Read again once what the echo did has been read: the room's report of it may have come in meanwhile.
  }, [open, can, cell, standIn.on, room.status, room.away]);

  // With the door open: its last guesses of what you would say, and where its talking stands, read afresh.
  useEffect(() => {
    if (!open || !words.can) return;
    void words.refresh();
    if (words.on && standIn.on) void standIn.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, words.can]);

  /** "That was not me": kept, and the echo's brief asked for again so the room has the standing that follows. */
  const veto = async (e: AwayEntry) => {
    if (!(await vetoMoment(e))) return;
    setVetoed((v) => new Set([...v, vetoKey(e)]));
    await standIn.refresh();
  };

  // The address says which room's world this is, so it can be sent as it stands; and when it changes, the
  // village becomes that world's. Only coming in and leaving move it: a link opened and not yet gone
  // through stays in its copy's world.
  useEffect(() => {
    if (!can || room.status === "joining") return;
    const inside = room.status === "in" || room.status === "lost";
    const has = worldRoom(cell);
    const want = inside ? room.code : wasInside.current ? null : has;
    wasInside.current = inside;
    if (want === has) return;
    try {
      window.history.replaceState(window.history.state, "", withRoom(want));
    } catch {
      // The address is a convenience; the world follows it below either way only if it moved.
      return;
    }
    void showWorld(world(), cell);
  }, [can, cell, room.status, room.code, world]);

  // Enter to speak, while in a room and not already typing somewhere.
  useEffect(() => {
    if (room.status !== "in") {
      setSaying(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      // An Enter the line itself has handled (said, and closed) is not a second Enter to open it again.
      if (e.key !== "Enter" || saying || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
      e.preventDefault();
      setSaying(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room.status, saying]);
  useEffect(() => {
    if (saying) sayRef.current?.focus();
  }, [saying]);

  if (!can) return null;

  const start = async () => {
    const code = newRoomCode();
    setTheirs(code);
    if (await joinRoom(cell, code)) setCopied(false);
  };
  const enter = async () => {
    await joinRoom(cell, theirs);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(withRoom(room.code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const say = () => {
    // Said aloud, and kept with your other lines when you let your words be kept (C108).
    const said = line.trim() ? sayInRoom(line) : null;
    if (said) keepSaid({ cell, room: worldRoom(cell), to: "aloud", said });
    setLine("");
    setSaying(false);
    sayRef.current?.blur();
  };

  const field = "w-full rounded-lg border border-parchment/15 bg-parchment/5 px-3 py-2 text-sm text-parchment placeholder:text-parchment/35 focus:border-echo focus:outline-none";
  const button = "btn btn-sm btn-primary";
  const inside = room.status === "in" || room.status === "lost";
  // Who you are here (C107): your body's look in this copy, named as the village names a visitor.
  const look = roomSelfLook();
  const you = look ? (world()?.context().layer<VillagersLayer>("villagers")?.visitor(look.seed) ?? null) : null;
  const me = look && you ? { name: you.name, age: look.age, trade: look.trade } : null;

  return (
    <>
      {inside ? (
        <button
          type="button"
          data-room-chip={room.code ?? ""}
          data-room-status={room.status}
          onClick={() => openPanel("room")}
          className="hud-pop absolute bottom-4 left-4 z-[40] rounded-full px-3 py-1.5 text-[12px] text-parchment/85 hover:text-parchment max-sm:bottom-24"
        >
          <span className="font-mono tracking-[0.15em]">{room.code}</span>
          <span className="ml-2 text-parchment/60">{room.status === "lost" ? t(lang, "room.lost") : t(lang, "room.people", { n: room.people })}</span>
        </button>
      ) : null}

      {saying ? (
        <div className="absolute bottom-16 left-1/2 z-[46] w-[min(520px,92vw)] -translate-x-1/2 max-sm:bottom-28">
          <input
            ref={sayRef}
            data-room-say
            value={line}
            maxLength={240}
            placeholder={t(lang, "room.say")}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Stopped here: the window's Enter, which opens the line, would otherwise hear this one.
                e.preventDefault();
                e.stopPropagation();
                say();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setLine("");
                setSaying(false);
                sayRef.current?.blur();
              }
            }}
            onBlur={() => setSaying(false)}
            className={`${field} hud-pop py-2.5`}
          />
        </div>
      ) : null}

      {open ? (
        <EchoPanel tab="room" label={t(lang, "room.title")} attrs={{ "data-room-panel": room.status }}>
          <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-4 text-sm text-parchment">
            {room.away ? <AwayCard lang={lang} away={room.away} title={t(lang, "standin.away.title")} vetoed={vetoed} onVeto={(e) => void veto(e)} onOk={dismissAway} /> : null}
            <p className={`${room.away ? "mt-4 " : ""}text-[13px] leading-relaxed text-parchment/70`}>{t(lang, "room.intro")}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-parchment/55">{t(lang, "room.notice")}</p>

            {inside ? (
              <div className="mt-4 rounded-xl bg-parchment/[0.04] p-3">
                <p className="text-xs text-parchment/60">{t(lang, "room.code")}</p>
                <p className="mt-1 font-mono text-xl tracking-[0.2em]" data-room-code>
                  {room.code}
                </p>
                <p className="mt-1 text-xs text-parchment/60">{room.status === "lost" ? t(lang, "room.lost") : t(lang, "room.people", { n: room.people })}</p>
                {me ? (
                  <p className="mt-3 text-[13px] text-parchment/80" data-room-you={me.name}>
                    {t(lang, "room.you", { name: me.name, age: me.age, trade: me.trade })}
                  </p>
                ) : null}
                <p className="mt-3 text-[13px] text-parchment/70">{t(lang, "room.share")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" data-room-copy onClick={() => void copy()} className={button}>
                    {t(lang, copied ? "room.copied" : "room.copy")}
                  </button>
                  <button
                    type="button"
                    data-room-leave
                    onClick={() => {
                      leaveRoom();
                      closePanel("room");
                    }}
                    className="text-xs text-parchment/60 hover:text-parchment"
                  >
                    {t(lang, "room.leave")}
                  </button>
                </div>
                <p className="mt-3 text-xs text-parchment/45">{t(lang, "room.sayHint")}</p>
              </div>
            ) : (
              <>
                {kept ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-echo/30 bg-echo/[0.06] p-3" data-standin-keeping={kept.code}>
                    <p className="text-[13px] text-parchment/80">{t(lang, "standin.keeping", { code: kept.code })}</p>
                    <a href={`/watch/${cell}?room=${kept.code}`} target="_blank" rel="noopener" data-standin-watch className="btn btn-sm btn-primary">
                      {t(lang, "standin.watchIt")}
                    </a>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-parchment/[0.04] p-3">
                    <button type="button" data-room-new disabled={room.status === "joining"} onClick={() => void start()} className={button}>
                      {t(lang, "room.new")}
                    </button>
                  </div>
                  <div className="rounded-xl bg-parchment/[0.04] p-3">
                    <p className="text-xs text-parchment/60">{t(lang, "room.haveCode")}</p>
                    <input
                      data-room-their-code
                      value={theirs}
                      maxLength={7}
                      placeholder={t(lang, "room.code")}
                      onChange={(e) => setTheirs(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && normalizeRoomCode(theirs)) void enter();
                      }}
                      className={`${field} mt-1.5 font-mono tracking-[0.15em]`}
                    />
                    <button type="button" data-room-join disabled={room.status === "joining" || !normalizeRoomCode(theirs)} onClick={() => void enter()} className={`${button} mt-2`}>
                      {t(lang, "room.join")}
                    </button>
                  </div>
                </div>
                {recentRooms(cell).length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs text-parchment/55">{t(lang, "room.recent")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {recentRooms(cell).map((r) => (
                        <button
                          key={r.code}
                          type="button"
                          data-room-recent={r.code}
                          disabled={room.status === "joining"}
                          onClick={() => void joinRoom(cell, r.code)}
                          className="rounded-full border border-parchment/15 px-3 py-1 font-mono text-[12px] tracking-[0.15em] text-parchment/85 hover:border-parchment/40 disabled:opacity-40"
                        >
                          {r.code}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {room.status === "joining" ? <p className="mt-3 text-xs text-parchment/60">{t(lang, "room.joining")}</p> : null}
                {room.error ? (
                  <p className="mt-3 text-xs text-rose-300" data-room-error={room.error}>
                    {t(lang, ERROR_KEY[room.error] ?? "room.err.offline")}
                  </p>
                ) : null}
              </>
            )}

            <div className="mt-5 border-t border-parchment/10 pt-4" data-standin={standIn.on ? "on" : "off"}>
              <p className="font-serif text-[16px]">{t(lang, "standin.title")}</p>
              {standIn.can ? (
                <>
                  <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-[13px]">
                    <input type="checkbox" data-standin-toggle checked={standIn.on} disabled={standIn.busy} onChange={(e) => void standIn.setOn(e.target.checked)} className="h-4 w-4 accent-echo" />
                    <span>{t(lang, "standin.toggle")}</span>
                  </label>
                  <p className="mt-2 text-[12px] leading-relaxed text-parchment/60">{t(lang, "standin.what")}</p>
                  <p className="mt-1 text-[12px] text-parchment/45">{t(lang, "standin.off")}</p>
                  {standIn.error ? <p className="mt-2 text-xs text-rose-300">{t(lang, "standin.error")}</p> : null}
                  {standIn.on && standIn.standing ? (
                    <>
                      <ul className="mt-3 space-y-1.5" data-standin-list>
                        {standIn.standing.map((s) => (
                          <li key={s.bucket} data-standin-bucket={s.bucket} data-standin-level={s.level} className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className={s.level === "act" ? "text-parchment" : "text-parchment/70"}>{t(lang, `bucket.${s.bucket}` as Key)}</span>
                            <span className={`text-right text-[12px] ${s.level === "act" ? "text-echo-soft" : "text-parchment/50"}`}>{standingLine(lang, s, words.on)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] text-parchment/40">{t(lang, "standin.kept", { n: standIn.kept })}</p>
                      {last && !room.away ? <AwayCard lang={lang} away={last} title={t(lang, "standin.last")} vetoed={vetoed} onVeto={(e) => void veto(e)} /> : null}
                    </>
                  ) : null}
                  <WordsSection lang={lang} words={words} />
                </>
              ) : (
                <p className="mt-2 text-[12px] leading-relaxed text-parchment/55">{t(lang, "standin.needsWatch")}</p>
              )}
            </div>
          </div>
        </EchoPanel>
      ) : null}
    </>
  );
}
