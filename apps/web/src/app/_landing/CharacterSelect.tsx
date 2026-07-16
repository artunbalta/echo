"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarPreview from "@/components/AvatarPreview";
import { createFromPremade, type CharacterResult } from "@/lib/character";
import { resolveUserId } from "@/lib/identity";
import { EMPTY_INDEX, EMPTY_SLOT, GRID, GRID_COLS, type RosterEntry } from "./roster";

/**
 * JOIN WAITLIST — the character select (§1b). A fighting-game roster with a hole in the middle:
 * the empty centre slot is you, and filling it is the primary call to action.
 *
 * Reuses the world's character pipeline rather than duplicating it: tiles are art, but picking one
 * calls createFromPremade(id) — the same function /onboard calls — so the character a person is
 * promised here is the exact procedural sprite they will get in the world. Nothing here writes the
 * localStorage keys /onboard owns, and nothing here routes into /play: joining a waitlist is not
 * entering the world.
 *
 * Zero-key by construction: styleFromId + buildCharacterSheet are pure canvas, and uploadSheet
 * degrades to an inline data URL when Storage is unset. Only the final POST needs a backend.
 */

type Selection = RosterEntry | typeof EMPTY_SLOT | null;
type Fill = "photo" | "premade" | null;

/**
 * Portraits are 72x107 (pipeline/process-roster-portraits.py). Scale is INTEGER ONLY, and sizing
 * steps between whole multiples at breakpoints rather than interpolating — a fractional scale would
 * smear the pixel grid (Appendix A). Width alone is set; height follows the image's own aspect, so
 * the multiple stays exact. Tiles: 1x on phones, 2x from sm. Hero: 2x on phones, 3x from md.
 *
 * `box-content` is LOAD-BEARING, not decoration. Tailwind defaults to box-border, so on a bordered
 * element `w-[144px]` is the border-box width and the 2px border on each side eats into the image:
 * it rendered 140px from a 72px source (1.94x) and 68px on mobile — actually DOWNSCALING the pixel
 * art. content-box makes the declared width the image's width and pushes the border outside it, so
 * these stay exact 1x/2x/3x. Never drop box-content from an element carrying one of these.
 */
const TILE_SIZE = "box-content w-[72px] sm:w-[144px]";
const HERO_SIZE = "box-content w-[144px] md:w-[216px]";

export default function CharacterSelect() {
  const [selected, setSelected] = useState<Selection>(null);
  const [fill, setFill] = useState<Fill>(null);
  const [focusIndex, setFocusIndex] = useState(EMPTY_INDEX);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot; a human never sees or fills this
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ already: boolean } | null>(null);

  // The result of createFromPremade — held so a failed submit never loses the chosen character (§1b).
  const characterRef = useRef<CharacterResult | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  const isEmpty = selected === EMPTY_SLOT;
  const entry = selected && selected !== EMPTY_SLOT ? selected : null;

  // Build the character as soon as one is picked, not at submit: it is pure local canvas work, so
  // doing it early means the submit is just the network call, and any (unlikely) failure surfaces
  // while the person is still looking at the roster rather than after they hit join.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    characterRef.current = null;
    createFromPremade(entry.id, resolveUserId())
      .then((res) => {
        if (!cancelled) characterRef.current = res;
      })
      .catch(() => {
        // uploadSheet swallows its own errors and falls back to a data URL, so this is close to
        // unreachable. If it ever fires, submit still works — character_ref alone rebuilds the
        // sprite, because styleFromId is deterministic.
        if (!cancelled) characterRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const choose = useCallback((cell: RosterEntry | typeof EMPTY_SLOT, index: number) => {
    setError(null);
    setFocusIndex(index);
    setSelected(cell);
    setFill(cell === EMPTY_SLOT ? null : "premade");
  }, []);

  /** Roving-tabindex grid: one tab stop, arrows move within it. */
  const onGridKey = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const cols = GRID_COLS;
      const rows = Math.ceil(GRID.length / cols);
      let next = index;
      if (e.key === "ArrowRight") next = index % cols === cols - 1 ? index : index + 1;
      else if (e.key === "ArrowLeft") next = index % cols === 0 ? index : index - 1;
      else if (e.key === "ArrowDown") next = index + cols >= GRID.length ? index : index + cols;
      else if (e.key === "ArrowUp") next = index - cols < 0 ? index : index - cols;
      else if (e.key === "Home") next = Math.floor(index / cols) * cols;
      else if (e.key === "End") next = Math.min(Math.floor(index / cols) * cols + cols - 1, GRID.length - 1);
      else return;
      e.preventDefault();
      void rows;
      setFocusIndex(next);
      tileRefs.current[next]?.focus();
    },
    [],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selected) {
      setError("Choose a character first, or take the empty slot.");
      return;
    }
    if (isEmpty && fill !== "premade") {
      setError("Choose how to fill your slot.");
      return;
    }

    setBusy(true);
    try {
      const character = characterRef.current;
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          website, // honeypot — server answers 200 and discards if this is non-empty
          characterSource: character?.source ?? "premade",
          characterRef: entry?.id ?? null,
          characterSpriteUrl: character?.spriteUrl ?? "",
          characterAttributes: character?.attributes ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; already?: boolean };
      if (!res.ok) {
        // Keep name, email AND the chosen character — never lose the selection on a failed submit.
        setError(data.error ?? "Could not save that. Please try again.");
        return;
      }
      setDone({ already: Boolean(data.already) });
    } catch {
      setError("Could not reach the waitlist. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Joined already={done.already} entry={entry} />;

  return (
    <section id="waitlist" className="relative bg-ink px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <h2 className="font-pixel text-3xl font-bold uppercase tracking-[0.3em] text-parchment sm:text-4xl">
            Join Waitlist
          </h2>
          <p className="mx-auto mt-4 max-w-md font-pixel text-sm leading-relaxed text-parchment/60 sm:text-base">
            Every figure here is someone who already arrived. The space in the middle is yours.
          </p>
        </header>

        {/* Hero and roster are centred as one unit, and the form sits under BOTH rather than under
            the roster column — otherwise the hero column leaves a large dead space beside it. */}
        <div className="mt-12 flex flex-col items-center gap-10 md:flex-row md:items-center md:justify-center md:gap-14">
          <Hero selected={selected} entry={entry} />

          <div>
            <div
              role="radiogroup"
              aria-label="Choose your character"
              className="mx-auto grid w-max grid-cols-3 gap-2 sm:gap-3"
            >
              {GRID.map((cell, i) =>
                cell === EMPTY_SLOT ? (
                  <EmptyTile
                    key="empty"
                    ref={(el) => {
                      tileRefs.current[i] = el;
                    }}
                    selected={isEmpty}
                    tabIndex={focusIndex === i ? 0 : -1}
                    onSelect={() => choose(EMPTY_SLOT, i)}
                    onKeyDown={(e) => onGridKey(e, i)}
                  />
                ) : (
                  <Tile
                    key={cell.id}
                    ref={(el) => {
                      tileRefs.current[i] = el;
                    }}
                    entry={cell}
                    selected={entry?.id === cell.id}
                    tabIndex={focusIndex === i ? 0 : -1}
                    onSelect={() => choose(cell, i)}
                    onKeyDown={(e) => onGridKey(e, i)}
                  />
                ),
              )}
            </div>

            {isEmpty && <FillChoice fill={fill} onPick={setFill} formRef={formRef} />}
          </div>
        </div>

        <div ref={formRef} className="mt-12">
          <Form
            name={name}
            email={email}
            website={website}
            busy={busy}
            error={error}
            disabled={!selected || (isEmpty && fill !== "premade")}
            onName={setName}
            onEmail={setEmail}
            onWebsite={setWebsite}
            onSubmit={submit}
          />
        </div>
      </div>
    </section>
  );
}

/* ── the large selected portrait ─────────────────────────────────────────────────────────────── */

function Hero({ selected, entry }: { selected: Selection; entry: RosterEntry | null }) {
  return (
    <div className="shrink-0">
      <div
        className={`${HERO_SIZE} relative flex aspect-[72/107] items-end justify-center overflow-hidden rounded-lg border-2 border-echo/20 bg-[#120c19]`}
      >
        {entry ? (
          <Portrait entry={entry} />
        ) : selected === EMPTY_SLOT ? (
          <Silhouette />
        ) : (
          <p className="self-center px-4 text-center font-pixel text-xs leading-relaxed text-parchment/30">
            No one yet.
          </p>
        )}
      </div>
      <p className="mt-3 text-center font-pixel text-xs uppercase tracking-[0.2em] text-parchment/50">
        {entry ? entry.label : selected === EMPTY_SLOT ? "You" : "Choose"}
      </p>
    </div>
  );
}

/* ── tiles ───────────────────────────────────────────────────────────────────────────────────── */

/** Portrait with an honest fallback: if the committed PNG is missing, draw the procedural sprite
 *  instead. Never a broken slot (§2), and it keeps the roster keyless. */
function Portrait({ entry, fallbackScale = 4 }: { entry: RosterEntry; fallbackScale?: number }) {
  const [failed, setFailed] = useState(false);
  const style = useMemo(() => entry.style, [entry]);
  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <AvatarPreview style={style} scale={fallbackScale} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel art must not be resampled by
    // next/image; `pixel` + an integer scale is the whole point, and these are already 6KB.
    <img
      src={entry.portrait}
      alt=""
      width={72}
      height={107}
      draggable={false}
      onError={() => setFailed(true)}
      className="pixel block h-auto w-full select-none"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// forwardRef, not a `ref` prop. React 19 lets a function component take `ref` as an ordinary prop;
// this repo is React 18.3.1, where `ref` is reserved — React strips it, the tileRefs array stays
// null, and the arrow-key focus management fails silently. TypeScript cannot catch that, because
// declaring `ref` in the props type typechecks fine while React ignores it at runtime.
const Tile = forwardRef<
  HTMLButtonElement,
  {
    entry: RosterEntry;
    selected: boolean;
    tabIndex: number;
    onSelect: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }
>(function Tile({ entry, selected, tabIndex, onSelect, onKeyDown }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={entry.label}
      tabIndex={tabIndex}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      className={`${TILE_SIZE} relative block overflow-hidden rounded border-2 bg-[#120c19] outline-none transition-colors ${
        selected
          ? "border-parchment/70"
          : "border-echo/15 hover:border-parchment/40 focus-visible:border-parchment/60"
      }`}
    >
      <Portrait entry={entry} fallbackScale={2} />
    </button>
  );
});

/**
 * The hole in the roster. Deliberately vacant, and the only echo-violet on the page (§1b).
 *
 * The glow is styled with arbitrary Tailwind values rather than a new globals.css rule on purpose:
 * globals.css is the only file this landing shares with the live game routes and the in-flight
 * embodied-activities branch, so keeping its diff empty keeps that merge clean. It is also static —
 * a pulse would read as urgency, and nothing here is urgent.
 */
const EmptyTile = forwardRef<
  HTMLButtonElement,
  {
    selected: boolean;
    tabIndex: number;
    onSelect: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }
>(function EmptyTile({ selected, tabIndex, onSelect, onKeyDown }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label="The empty slot — this one is you"
      tabIndex={tabIndex}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      className={`${TILE_SIZE} relative flex aspect-[72/107] items-end justify-center overflow-hidden rounded border-2 bg-[#120c19] outline-none transition-all ${
        selected
          ? "border-echo shadow-[0_0_28px_rgba(160,108,213,0.55),inset_0_0_18px_rgba(160,108,213,0.22)]"
          : "border-echo/50 shadow-[0_0_14px_rgba(160,108,213,0.25)] hover:border-echo/80 hover:shadow-[0_0_22px_rgba(160,108,213,0.4)] focus-visible:border-echo"
      }`}
    >
      <Silhouette />
    </button>
  );
});

/**
 * A person-shaped absence, framed exactly like a real portrait so the hole reads as a hole rather
 * than as a missing image. Drawn, never generated: this one must not be able to 404.
 *
 * Built from grid-aligned rectangles only — no curves. An SVG curve scales as a smooth vector and
 * would sit visibly off the pixel grid next to the 72px portraits; axis-aligned rects on whole-pixel
 * coordinates stay sharp and grid-true at every integer scale, which is the same trick the existing
 * landing icons use (shapeRendering="crispEdges"). The stepped shoulders are the pixel-art idiom for
 * a curve, so the absence is drawn in the same language as the people around it.
 */
function Silhouette() {
  // x, y, w, h on the portraits' own 72x107 grid: a rounded head, a neck, stepped shoulders.
  const BUST: [number, number, number, number][] = [
    [30, 20, 12, 2],
    [28, 22, 16, 4],
    [27, 26, 18, 16],
    [28, 42, 16, 3],
    [31, 45, 10, 6],
    [23, 51, 26, 5],
    [18, 56, 36, 7],
    [14, 63, 44, 9],
    [11, 72, 50, 35],
  ];
  return (
    <svg
      viewBox="0 0 72 107"
      aria-hidden
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMax meet"
      className="block h-auto w-full"
    >
      {BUST.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} className="fill-echo/25" />
      ))}
    </svg>
  );
}

/* ── the two ways to fill the empty slot ─────────────────────────────────────────────────────── */

function FillChoice({
  fill,
  onPick,
  formRef,
}: {
  fill: Fill;
  onPick: (f: Fill) => void;
  formRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mt-6 rounded-lg border-2 border-echo/25 bg-[#120c19] p-4">
      <p className="mb-3 text-center font-pixel text-xs uppercase tracking-[0.2em] text-echo">
        Fill the empty slot
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled
          className="flex-1 rounded border-2 border-echo/15 px-4 py-3 text-left font-pixel text-sm text-parchment/35"
        >
          Use a photo
          <span className="mt-1 block text-[11px] leading-snug text-parchment/30">
            Not wired up yet. Coming in the next step.
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            onPick("premade");
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className={`flex-1 rounded border-2 px-4 py-3 text-left font-pixel text-sm transition-colors ${
            fill === "premade"
              ? "border-parchment/60 text-parchment"
              : "border-echo/25 text-parchment/80 hover:border-parchment/40"
          }`}
        >
          Pick someone already here
          <span className="mt-1 block text-[11px] leading-snug text-parchment/40">
            Choose any figure from the roster.
          </span>
        </button>
      </div>
    </div>
  );
}

/* ── the form ────────────────────────────────────────────────────────────────────────────────── */

function Form({
  name,
  email,
  website,
  busy,
  error,
  disabled,
  onName,
  onEmail,
  onWebsite,
  onSubmit,
}: {
  name: string;
  email: string;
  website: string;
  busy: boolean;
  error: string | null;
  disabled: boolean;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onWebsite: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  // Parchment, not echo-violet. The violet budget on this page is spent entirely on the empty slot
  // (§1b, art-bible §2: "sacred and rare … target <= ~5% of any frame"). A solid violet submit
  // button and a violet focus ring would dwarf the slot's glow and kill the one accent that matters.
  // Parchment is the bible's "human/warm" family, which is what a form field actually is.
  const input =
    "w-full rounded border-2 border-parchment/20 bg-ink px-3 py-2.5 font-pixel text-sm text-parchment outline-none placeholder:text-parchment/30 focus:border-parchment/60";
  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-md">
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">Your name</span>
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="What should people call you?"
            autoComplete="name"
            maxLength={80}
            className={input}
          />
        </label>
        <label className="block">
          <span className="sr-only">Your email</span>
          <input
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="Where do we find you?"
            type="email"
            autoComplete="email"
            maxLength={254}
            className={input}
          />
        </label>

        {/* Honeypot. Hidden from people and from assistive tech; only a bot fills it in. Not
            display:none — some bots skip those. Off-screen + aria-hidden + tabIndex -1. */}
        <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => onWebsite(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded border border-red-400/40 bg-red-900/20 px-3 py-2 font-pixel text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || disabled}
          className="mt-1 w-full rounded bg-parchment px-4 py-3 font-pixel font-bold uppercase tracking-[0.2em] text-ink transition-opacity hover:bg-parchment/90 disabled:cursor-not-allowed disabled:opacity-25"
        >
          {busy ? "Joining…" : "Join"}
        </button>
        <p className="text-center font-pixel text-[11px] leading-relaxed text-parchment/35">
          Name and email only. We write to you when there is something to see.
        </p>
      </div>
    </form>
  );
}

/* ── confirmation ────────────────────────────────────────────────────────────────────────────── */

function Joined({ already, entry }: { already: boolean; entry: RosterEntry | null }) {
  return (
    <section id="waitlist" className="bg-ink px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="box-content w-[144px] overflow-hidden rounded-lg border-2 border-echo/20 bg-[#120c19]">
          {entry ? <Portrait entry={entry} fallbackScale={4} /> : <Silhouette />}
        </div>
        <h2 className="mt-8 font-pixel text-2xl font-bold uppercase tracking-[0.25em] text-parchment">
          {already ? "Kept your place" : "The slot is yours"}
        </h2>
        <p className="mt-4 font-pixel text-sm leading-relaxed text-parchment/60">
          {already
            ? "We already had you. Your character is updated."
            : "No one knows you here yet. That is the point. We will write when the island is ready."}
        </p>
      </div>
    </section>
  );
}
