"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarPreview from "@/components/AvatarPreview";
import { createFromPremade, type CharacterResult } from "@/lib/character";
import { resolveUserId } from "@/lib/identity";
import { EMPTY_INDEX, EMPTY_SLOT, GRID, GRID_COLS, type RosterEntry } from "./roster";
import { VACANCY } from "./vacancy";

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

/** The real seat count from GET /api/waitlist. `available: false` means we could not read it, and
 *  in that case the UI says nothing rather than inventing a number. */
type Seats = {
  cap: number;
  taken: number | null;
  remaining: number | null;
  available: boolean;
  /** Whether the photo path can actually deliver end to end (migration 0007 + FAL + Resend). The
   *  UI does not offer a door that will not open; it degrades to the roster and says so. */
  photoPath?: boolean;
};

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
  const [done, setDone] = useState<{
    already: boolean;
    seat: number | null;
    portraitPending: boolean;
  } | null>(null);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

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

  // The real remaining count. Fetched, never assumed: if it cannot be read the line simply does not
  // render (see Scarcity), because a made-up number is the exact growth-hack pattern we refuse.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((d: Seats) => {
        if (!cancelled) setSeats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (isEmpty && fill === null) {
      setError("Choose how to fill your slot.");
      return;
    }
    if (isEmpty && fill === "photo") {
      if (!selfie) {
        setError("Choose a photo first.");
        return;
      }
      if (!consent) {
        setError("We need your say-so before sending your photo.");
        return;
      }
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
          characterSource: isEmpty && fill === "photo" ? "selfie" : "premade",
          selfie: isEmpty && fill === "photo" ? selfie : undefined,
          selfieConsent: isEmpty && fill === "photo" ? consent : undefined,
          characterRef: entry?.id ?? null,
          characterSpriteUrl: character?.spriteUrl ?? "",
          characterAttributes: character?.attributes ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        already?: boolean;
        full?: boolean;
        portraitPending?: boolean;
        seat?: number | null;
        taken?: number;
        cap?: number;
        remaining?: number;
      };
      if (!res.ok) {
        // Keep name, email AND the chosen character — never lose the selection on a failed submit.
        setError(data.error ?? "Could not save that. Please try again.");
        // A 409 means the last seat went while this form was open. Reflect the truth immediately
        // rather than leaving a stale "N left" on screen above a form that can no longer succeed.
        if (data.full) setSeats({ cap: data.cap ?? 0, taken: data.taken ?? 0, remaining: 0, available: true });
        return;
      }
      if (typeof data.taken === "number" && typeof data.cap === "number") {
        setSeats({ cap: data.cap, taken: data.taken, remaining: data.remaining ?? 0, available: true });
      }
      setDone({
        already: Boolean(data.already),
        seat: data.seat ?? null,
        portraitPending: Boolean(data.portraitPending),
      });
    } catch {
      setError("Could not reach the waitlist. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Joined
        already={done.already}
        seat={done.seat}
        entry={entry}
        portraitPending={done.portraitPending}
      />
    );

  const full = seats?.available === true && seats.remaining === 0;

  return (
    <section id="waitlist" className="relative bg-ink px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <h2 className="font-pixel text-3xl font-bold uppercase tracking-[0.3em] text-parchment sm:text-4xl">
            Join Waitlist
          </h2>
          <Scarcity seats={seats} />
          <p className="mx-auto mt-4 max-w-md font-pixel text-sm leading-relaxed text-parchment/60 sm:text-base">
            Every figure here is someone who already arrived. The space in the middle is yours.
          </p>
        </header>

        {/* The roster is the hero of this section, so it sits dead-centre on the page and the large
            portrait hangs beside it. Previously the two were centred as a PAIR, which pushed the
            grid visibly right of centre; `md:absolute` takes the preview out of flow so the grid
            centres on the section itself and the preview occupies the space that was dead anyway. */}
        <div className="relative mt-12 flex flex-col items-center gap-10">
          <div className="md:absolute md:left-0 md:top-1/2 md:-translate-y-1/2">
            <Hero selected={selected} entry={entry} />
          </div>

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

            {isEmpty && (
              <FillChoice
                fill={fill}
                onPick={setFill}
                formRef={formRef}
                photoEnabled={seats?.photoPath !== false}
                selfie={selfie}
                onSelfie={(uri, e) => {
                  setSelfie(uri);
                  if (e) setError(null);
                }}
                consent={consent}
                onConsent={setConsent}
              />
            )}
          </div>
        </div>

        <div ref={formRef} className="mt-12">
          <Form
            name={name}
            email={email}
            website={website}
            busy={busy}
            error={error}
            full={full}
            disabled={
              !selected ||
              (isEmpty && fill === null) ||
              (isEmpty && fill === "photo" && (!selfie || !consent))
            }
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

/* ── real scarcity ───────────────────────────────────────────────────────────────────────────── */

/**
 * The true remaining count, straight from the row count (§8). Everything here is load-bearing:
 *
 *  - The number is REAL. It is `cap - count(confirmed rows)`, read from GET /api/waitlist, and the
 *    server refuses signups past the cap with a 409 rather than quietly hiding the form. If it says
 *    limited, it is limited.
 *  - If the count cannot be read, this renders NOTHING. No placeholder, no cap-only teaser, no
 *    "almost gone". An invented number is precisely the pattern the brief forbids, and a fake
 *    scarcity line is worse than no scarcity line.
 *  - No countdown, no decay, no "1,247 people joined", no urgency verbs. The line states a fact in
 *    the world's register and stops. The pull is that the place is small, not that a clock is running.
 */
function Scarcity({ seats }: { seats: Seats | null }) {
  if (!seats?.available || seats.remaining === null || seats.taken === null) return null;
  const { remaining, cap } = seats;
  return (
    <p className="mt-5 font-pixel text-xs uppercase tracking-[0.25em] text-parchment/45 sm:text-sm">
      {remaining === 0 ? (
        <>All {cap} places taken</>
      ) : (
        <>
          <span className="text-parchment/80">{remaining}</span> of {cap} places left
        </>
      )}
    </p>
  );
}

/* ── the large selected portrait ─────────────────────────────────────────────────────────────── */

/**
 * The large preview of whatever is currently selected.
 *
 * It renders NOTHING until something is selected. The previous version always drew the framed
 * rectangle and filled it with "No one yet." / "CHOOSE" — a large empty box sitting next to the
 * empty slot, which both wasted the space and competed with the one deliberate vacancy on the page.
 * A preview of nothing is not a preview.
 */
function Hero({ selected, entry }: { selected: Selection; entry: RosterEntry | null }) {
  if (!selected) return null;
  return (
    <div className="shrink-0">
      <div
        className={`${HERO_SIZE} relative flex aspect-[72/108] items-end justify-center overflow-hidden rounded-lg border-2 border-echo/20 bg-[#120c19]`}
      >
        {entry ? <Portrait entry={entry} /> : <Silhouette />}
      </div>
      <p className="mt-3 text-center font-pixel text-xs uppercase tracking-[0.2em] text-parchment/50">
        {entry ? entry.name : "You"}
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
      height={108}
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
      aria-label={entry.name}
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
      className={`${TILE_SIZE} group relative flex aspect-[72/108] items-end justify-center overflow-hidden rounded border-2 border-dashed bg-[#0d0812] outline-none transition-all ${
        selected
          ? "border-echo border-solid shadow-[0_0_30px_rgba(160,108,213,0.5),inset_0_0_22px_rgba(160,108,213,0.18)]"
          : "border-echo/45 shadow-[0_0_16px_rgba(160,108,213,0.18)] hover:border-echo/75 hover:shadow-[0_0_26px_rgba(160,108,213,0.35)] focus-visible:border-echo"
      }`}
    >
      <Silhouette />
      {/* Named, not decorated: the tile has to say what it is or it reads as a missing image. Sits
          ABOVE the head, in the tile's own empty air — the derived body covers half the tile, so a
          label any lower would be buried inside the shape. A dashed border marks the slot out as a
          vacancy rather than a lit frame; it goes solid only once claimed. */}
      <span
        className={`pointer-events-none absolute inset-x-0 top-1 text-center font-pixel text-[8px] uppercase tracking-[0.18em] transition-colors sm:top-2 sm:text-[10px] ${
          selected ? "text-echo" : "text-echo/60 group-hover:text-echo/90"
        }`}
      >
        You
      </span>
    </button>
  );
});

/**
 * The empty centre slot's shape. DERIVED FROM THE EIGHT PORTRAITS, never hand-drawn — the geometry
 * comes from _landing/vacancy.ts, which pipeline/derive-vacancy.mjs computes by overlaying the eight
 * committed masks and keeping the pixels a majority agree on.
 *
 * WHY DERIVED. Three hand-authored versions failed identically: built from abstract tapering blocks,
 * they read as an object rather than a person — a tombstone, then a chess pawn, then a pawn with an
 * outline. The fault was the source, not the rendering. A shape invented in the abstract matches
 * nothing in the grid, so it reads as nothing. The eight portraits are all normalised to the same
 * canvas, baseline and scale, so the shape they SHARE is by construction the shape of a person in
 * this lineup — head, neck and shoulders, at exactly their crop. Match their outline and the hole
 * reads instantly as "someone is missing here, and it's you".
 *
 * FLAT FILLS ONLY. No gradient anywhere: a soft vertical gradient would break the same hard-palette
 * pixel rule the portraits are held to, and it is what made the earlier version read as a purple
 * mass. The violet is spent on the RIM — a 1px edge that breathes — with the interior barely there.
 * An inviting absence, not a blob.
 */
function Silhouette({ breathing = true }: { breathing?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${VACANCY.w} ${VACANCY.h}`}
      aria-hidden
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMax meet"
      className="block h-auto w-full"
    >
      {/* the absence: flat, barely there, so the eye reads the edge */}
      {VACANCY.interior.map(([y, x, w]) => (
        <rect key={`i${y}-${x}`} x={x} y={y} width={w} height={1} fill="#a06cd5" fillOpacity={0.09} />
      ))}
      {/* the rim: the only echo-violet on the page, and the only thing that moves */}
      <g className={breathing ? "animate-breathe motion-reduce:animate-none" : undefined}>
        {VACANCY.edge.map(([y, x, w]) => (
          <rect key={`e${y}-${x}`} x={x} y={y} width={w} height={1} fill="#a06cd5" fillOpacity={0.85} />
        ))}
      </g>
    </svg>
  );
}

/* ── the two ways to fill the empty slot ─────────────────────────────────────────────────────── */

/**
 * The two ways to fill the empty slot. The photo path is the hero path.
 *
 * VALIDATION HERE IS A COURTESY, NOT A CONTROL. Everything checked in the browser is checked again
 * on the server (api/waitlist readSelfie), because anyone can POST that endpoint directly and it
 * spends money. What this buys is a person finding out their photo is too small before they wait,
 * rather than after.
 */
function FillChoice({
  fill,
  onPick,
  formRef,
  photoEnabled,
  selfie,
  onSelfie,
  consent,
  onConsent,
}: {
  fill: Fill;
  onPick: (f: Fill) => void;
  formRef: React.RefObject<HTMLDivElement | null>;
  photoEnabled: boolean;
  selfie: string | null;
  onSelfie: (dataUri: string | null, err?: string) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setErr(null);
    onSelfie(null);
    if (!/^image\/(jpeg|jpg|png)$/.test(file.type)) {
      const m = "That photo must be a JPEG or PNG.";
      setErr(m);
      onSelfie(null, m);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const m = "That photo is over 10MB.";
      setErr(m);
      onSelfie(null, m);
      return;
    }
    const dataUri = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUri) {
      setErr("Could not read that file.");
      return;
    }
    // Dimensions and alpha are checked from the decoded image, not from the file name.
    const img = new Image();
    img.onload = () => {
      if (Math.min(img.width, img.height) < 384) {
        const m = "That photo is too small. It needs to be at least 384px on each side.";
        setErr(m);
        onSelfie(null, m);
        return;
      }
      if (Math.max(img.width, img.height) > 5000) {
        const m = "That photo is too large. Keep it under 5000px on a side.";
        setErr(m);
        onSelfie(null, m);
        return;
      }
      onSelfie(dataUri);
    };
    img.onerror = () => {
      const m = "That file is not an image we can read.";
      setErr(m);
      onSelfie(null, m);
    };
    img.src = dataUri;
  }

  return (
    <div className="mt-6 rounded-lg border-2 border-echo/25 bg-[#120c19] p-4">
      <p className="mb-3 text-center font-pixel text-xs uppercase tracking-[0.2em] text-echo">
        Fill the empty slot
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Not offered when it cannot deliver. A disabled button that says why beats a live one that
            takes a photo, takes a seat, and returns nothing. */}
        <button
          type="button"
          disabled={!photoEnabled}
          onClick={() => onPick("photo")}
          className={`flex-1 rounded border-2 px-4 py-3 text-left font-pixel text-sm transition-colors disabled:cursor-not-allowed ${
            !photoEnabled
              ? "border-echo/10 text-parchment/25"
              : fill === "photo"
                ? "border-parchment/60 text-parchment"
                : "border-echo/25 text-parchment/80 hover:border-parchment/40"
          }`}
        >
          Use a photo
          <span className="mt-1 block text-[11px] leading-snug text-parchment/40">
            {photoEnabled
              ? "Your face, drawn in the world's hand."
              : "Not open yet. Pick someone from the roster for now."}
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

      {fill === "photo" && (
        <div className="mt-4 border-t border-echo/15 pt-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded border-2 border-parchment/25 px-3 py-2 font-pixel text-xs text-parchment/80 transition-colors hover:border-parchment/60"
            >
              {selfie ? "Choose a different photo" : "Choose a photo"}
            </button>
            {selfie && (
              // eslint-disable-next-line @next/next/no-img-element -- a local data URI preview
              <img
                src={selfie}
                alt="The photo you chose"
                className="h-12 w-12 rounded object-cover"
              />
            )}
          </div>

          {/* CONSENT AT THE POINT OF UPLOAD, not buried in a footer link. It says where the photo
              goes, what is kept, and for how long, in the same breath as the button that sends it. */}
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => onConsent(e.target.checked)}
              className="mt-0.5 accent-echo"
            />
            <span className="font-pixel text-[11px] leading-relaxed text-parchment/50">
              Send my photo to an image service outside the EU and UK to draw my character. It is
              deleted once the character is drawn. The character is kept, the photo is not. My own
              photo only.
            </span>
          </label>

          {err && (
            <p role="alert" className="mt-3 font-pixel text-[11px] text-red-300">
              {err}
            </p>
          )}
          <p className="mt-3 font-pixel text-[11px] leading-relaxed text-parchment/30">
            JPEG or PNG, at least 384px, under 10MB. Your place is kept the moment you join. The
            character is drawn afterwards and arrives by email.
          </p>
        </div>
      )}
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
  full,
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
  full: boolean;
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

        {/* When the list is full the button says so and stops. The form is not hidden and the
            endpoint still refuses with a 409 — hiding it would leave the cap unenforced and make
            the scarcity a UI trick rather than a fact (§8). */}
        <button
          type="submit"
          disabled={busy || disabled || full}
          className="mt-1 w-full rounded bg-parchment px-4 py-3 font-pixel font-bold uppercase tracking-[0.2em] text-ink transition-opacity hover:bg-parchment/90 disabled:cursor-not-allowed disabled:opacity-25"
        >
          {full ? "Full" : busy ? "Joining…" : "Join"}
        </button>
        <p className="text-center font-pixel text-[11px] leading-relaxed text-parchment/35">
          Name and email only. We write to you when there is something to see.
        </p>
      </div>
    </form>
  );
}

/* ── confirmation ────────────────────────────────────────────────────────────────────────────── */

function Joined({
  already,
  seat,
  entry,
  portraitPending,
}: {
  already: boolean;
  seat: number | null;
  entry: RosterEntry | null;
  portraitPending: boolean;
}) {
  return (
    <section id="waitlist" className="bg-ink px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="box-content w-[144px] overflow-hidden rounded-lg border-2 border-echo/20 bg-[#120c19]">
          {entry ? <Portrait entry={entry} fallbackScale={4} /> : <Silhouette breathing={false} />}
        </div>
        <h2 className="mt-8 font-pixel text-2xl font-bold uppercase tracking-[0.25em] text-parchment">
          {already ? "Kept your place" : "The slot is yours"}
        </h2>
        {/* A real seat number, assigned by the database, not a flourish. It is the one number here
            that means something, so it is the one number shown. No confetti. */}
        {seat !== null && (
          <p className="mt-4 font-pixel text-xs uppercase tracking-[0.25em] text-parchment/45">
            Arrival {seat}
          </p>
        )}
        <p className="mt-4 font-pixel text-sm leading-relaxed text-parchment/60">
          {portraitPending
            ? // Honest about the wait AND about the seat: the place is already theirs, the drawing
              // is the only thing outstanding. No progress bar, because we cannot honestly promise
              // a time — generation is someone else's queue.
              "Your character is being drawn from your photo. It will reach you by email shortly. Your place is already kept, whatever the drawing does."
            : already
              ? "We already had you. Your character is updated, and your place is unchanged."
              : "No one knows you here yet. That is the point. We will write when the island is ready."}
        </p>
      </div>
    </section>
  );
}
