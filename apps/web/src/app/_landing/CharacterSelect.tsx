"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarPreview from "@/components/AvatarPreview";
import { createFromPremade, type CharacterResult } from "@/lib/character";
import { resolveUserId } from "@/lib/identity";
import { useLang, type Lang } from "@/lib/lang";
import { EMPTY_INDEX, EMPTY_SLOT, GRID, GRID_COLS, type RosterEntry } from "./roster";
import { SECTION, SectionHead, WRAP } from "./Section";
import { VACANCY } from "./vacancy";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";

/**
 * The waitlist — the character select (§1b). A roster with a hole in the middle: the empty centre
 * slot is you.
 *
 * LAID OUT AS A FORM WITH A ROSTER BESIDE IT (C96). It was a spaced pixel title, nine large portraits
 * and then, a screen and a half down, the form they were for. Now the title, the one sentence and
 * the form stand on the left and the roster on the right; on a narrow screen the roster is nine
 * small tiles between the title and the form, so the fields are on the first screen of the section.
 * Nothing it does changed: the same picks, the same two ways to fill the empty slot, the same
 * checks with the same words, the same POST.
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
 * The section's words, in both languages (C96): the server's own refusals arrive in English and are
 * shown as they come. The English of every check is word for word what it was.
 */
interface Copy {
  eyebrow: string;
  title: string;
  lead: string;
  left: (remaining: string, cap: string) => string;
  taken: (cap: string) => string;
  group: string;
  emptySlot: string;
  you: string;
  chosen: string;
  pickHint: string;
  fill: { title: string; photo: string; photoOn: string; photoOff: string; premade: string; premadeHint: string; choose: string; change: string; alt: string; consent: string; note: string };
  err: { type: string; size: string; read: string; small: string; large: string; notImage: string; pick: string; fill: string; photo: string; consent: string; save: string; reach: string };
  name: string;
  namePh: string;
  email: string;
  emailPh: string;
  join: string;
  joining: string;
  full: string;
  note: string;
  joined: { kept: string; yours: string; arrival: (seat: number) => string; pending: string; already: string; fresh: string; open: string; walkIn: string };
}

const COPY: Record<Lang, Copy> = {
  en: {
    eyebrow: "Waitlist",
    title: "Join the waitlist",
    lead: "Every figure here is someone who already arrived. The space in the middle is yours. Pick one, or take the empty place, and leave your name.",
    left: (remaining, cap) => `${remaining} of ${cap} places left`,
    taken: (cap) => `All ${cap} places taken`,
    group: "Choose your character",
    emptySlot: "The empty slot: this one is you",
    you: "You",
    chosen: "Your character",
    pickHint: "Pick a figure first, or take the empty place.",
    fill: {
      title: "Fill the empty slot",
      photo: "Use a photo",
      photoOn: "Your face, drawn in the world's hand.",
      photoOff: "Not open yet. Pick someone from the roster for now.",
      premade: "Pick someone already here",
      premadeHint: "Choose any figure from the roster.",
      choose: "Choose a photo",
      change: "Choose a different photo",
      alt: "The photo you chose",
      consent: "Send my photo to an image service outside the EU and UK to draw my character. It is deleted once the character is drawn. The character is kept, the photo is not. My own photo only.",
      note: "JPEG or PNG, at least 384px, under 10MB. Your place is kept the moment you join. The character is drawn afterwards and arrives by email.",
    },
    err: {
      type: "That photo must be a JPEG or PNG.",
      size: "That photo is over 10MB.",
      read: "Could not read that file.",
      small: "That photo is too small. It needs to be at least 384px on each side.",
      large: "That photo is too large. Keep it under 5000px on a side.",
      notImage: "That file is not an image we can read.",
      pick: "Choose a character first, or take the empty slot.",
      fill: "Choose how to fill your slot.",
      photo: "Choose a photo first.",
      consent: "We need your say-so before sending your photo.",
      save: "Could not save that. Please try again.",
      reach: "Could not reach the waitlist. Check your connection and try again.",
    },
    name: "Your name",
    namePh: "What should people call you?",
    email: "Your email",
    emailPh: "Where do we find you?",
    join: "Join",
    joining: "Joining…",
    full: "Full",
    note: "Name and email only. We write to you when there is something to see.",
    joined: {
      kept: "Kept your place",
      yours: "The slot is yours",
      arrival: (seat) => `Arrival ${seat}`,
      pending: "Your character is being drawn from your photo. It will reach you by email shortly. Your place is already kept, whatever the drawing does.",
      already: "We already had you. Your character is updated, and your place is unchanged.",
      fresh: "No one knows you here yet. That is the point. We will write when there is more to see.",
      open: "A village is already open.",
      walkIn: "Walk in",
    },
  },
  tr: {
    eyebrow: "Bekleme listesi",
    title: "Bekleme listesine katıl",
    lead: "Buradaki her figür çoktan gelmiş biri. Ortadaki boşluk senin. Birini seç ya da boş yeri al, sonra adını bırak.",
    left: (remaining, cap) => `${cap} yerden ${remaining} tanesi boş`,
    taken: (cap) => `${cap} yerin hepsi doldu`,
    group: "Karakterini seç",
    emptySlot: "Boş yer: bu sensin",
    you: "Sen",
    chosen: "Karakterin",
    pickHint: "Önce bir figür seç ya da boş yeri al.",
    fill: {
      title: "Boş yeri doldur",
      photo: "Fotoğraf kullan",
      photoOn: "Yüzün, bu dünyanın eliyle çizilir.",
      photoOff: "Henüz açık değil. Şimdilik listeden birini seç.",
      premade: "Buradakilerden birini seç",
      premadeHint: "Listeden istediğin figürü seç.",
      choose: "Fotoğraf seç",
      change: "Başka bir fotoğraf seç",
      alt: "Seçtiğin fotoğraf",
      consent: "Karakterimi çizmesi için fotoğrafımı AB ve Birleşik Krallık dışındaki bir görsel servisine gönder. Karakter çizilince fotoğraf silinir. Karakter saklanır, fotoğraf saklanmaz. Yalnızca kendi fotoğrafım.",
      note: "JPEG ya da PNG, en az 384 piksel, 10 MB'tan küçük. Katıldığın anda yerin ayrılır. Karakter sonra çizilir ve e-postayla gelir.",
    },
    err: {
      type: "Fotoğraf JPEG ya da PNG olmalı.",
      size: "Fotoğraf 10 MB'tan büyük.",
      read: "Dosya okunamadı.",
      small: "Fotoğraf çok küçük. Her kenarı en az 384 piksel olmalı.",
      large: "Fotoğraf çok büyük. Bir kenarı 5000 pikseli geçmesin.",
      notImage: "Bu dosya okuyabildiğimiz bir görsel değil.",
      pick: "Önce bir karakter seç ya da boş yeri al.",
      fill: "Yerini nasıl dolduracağını seç.",
      photo: "Önce bir fotoğraf seç.",
      consent: "Fotoğrafını göndermeden önce onayın gerekiyor.",
      save: "Kaydedilemedi. Lütfen yeniden dene.",
      reach: "Bekleme listesine ulaşılamadı. Bağlantını kontrol edip yeniden dene.",
    },
    name: "Adın",
    namePh: "Sana ne diyelim?",
    email: "E-postan",
    emailPh: "Seni nereden bulalım?",
    join: "Katıl",
    joining: "Katılıyorsun…",
    full: "Dolu",
    note: "Yalnızca ad ve e-posta. Görülecek bir şey olduğunda sana yazarız.",
    joined: {
      kept: "Yerin duruyor",
      yours: "Yer senin",
      arrival: (seat) => `Geliş sırası: ${seat}`,
      pending: "Karakterin fotoğrafından çiziliyor. Kısa süre içinde e-postayla ulaşacak. Çizime ne olursa olsun yerin ayrıldı.",
      already: "Seni zaten tanıyorduk. Karakterin güncellendi, yerin değişmedi.",
      fresh: "Burada seni henüz kimse tanımıyor. Mesele de bu. Görülecek yeni bir şey olduğunda yazarız.",
      open: "Bir köy şimdiden açık.",
      walkIn: "İçeri gir",
    },
  },
};

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
 * the multiple stays exact. Tiles: 1x under `lg`, where the roster sits between the title and the
 * form and must not push the form off the screen; 2x from `lg`, where it stands beside them.
 *
 * `box-content` is LOAD-BEARING, not decoration. Tailwind defaults to box-border, so on a bordered
 * element `w-[144px]` is the border-box width and the 2px border on each side eats into the image:
 * it rendered 140px from a 72px source (1.94x) and 68px on mobile — actually DOWNSCALING the pixel
 * art. content-box makes the declared width the image's width and pushes the border outside it, so
 * these stay exact 1x/2x/3x. Never drop box-content from an element carrying one of these.
 */
const TILE_SIZE = "box-content w-[72px] lg:w-[144px]";

export default function CharacterSelect() {
  const lang = useLang();
  const copy = COPY[lang];
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
      setError(copy.err.pick);
      return;
    }
    if (isEmpty && fill === null) {
      setError(copy.err.fill);
      return;
    }
    if (isEmpty && fill === "photo") {
      if (!selfie) {
        setError(copy.err.photo);
        return;
      }
      if (!consent) {
        setError(copy.err.consent);
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
        setError(data.error ?? copy.err.save);
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
      setError(copy.err.reach);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Joined
        copy={copy}
        already={done.already}
        seat={done.seat}
        entry={entry}
        portraitPending={done.portraitPending}
      />
    );

  const full = seats?.available === true && seats.remaining === 0;

  return (
    <section id="waitlist" className={SECTION}>
      {/* Three blocks in reading order: the words, the roster, the form. Stacked on a phone; from
          `sm` the roster takes the right column for the height of the other two, small until `lg`
          and at twice the size from there. */}
      <div className={`${WRAP} grid items-start gap-x-10 gap-y-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_640px] lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_720px] xl:gap-x-16`}>
        <div className="sm:col-start-1 sm:row-start-1">
          <SectionHead eyebrow={copy.eyebrow} title={copy.title}>
            {copy.lead}
          </SectionHead>
          <Scarcity seats={seats} copy={copy} lang={lang} />
        </div>

        <div className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
          <div role="radiogroup" aria-label={copy.group} className="mx-auto grid w-max grid-cols-3 gap-2 lg:gap-3">
            {GRID.map((cell, i) =>
              cell === EMPTY_SLOT ? (
                <EmptyTile
                  key="empty"
                  ref={(el) => {
                    tileRefs.current[i] = el;
                  }}
                  selected={isEmpty}
                  tabIndex={focusIndex === i ? 0 : -1}
                  label={copy.emptySlot}
                  you={copy.you}
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
        </div>

        <div ref={formRef} className="w-full max-w-md sm:col-start-1 sm:row-start-2">
          <Chosen selected={selected} entry={entry} copy={copy} />

          {isEmpty && (
            <FillChoice
              copy={copy}
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

          <Form
            copy={copy}
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
function Scarcity({ seats, copy, lang }: { seats: Seats | null; copy: Copy; lang: Lang }) {
  if (!seats?.available || seats.remaining === null || seats.taken === null) return null;
  // The same two numbers, written the way the reader's language writes a large one.
  const n = (x: number) => x.toLocaleString(lang === "tr" ? "tr-TR" : "en-US");
  return <p className="mt-4 text-[13px] tabular-nums text-parchment/55">{seats.remaining === 0 ? copy.taken(n(seats.cap)) : copy.left(n(seats.remaining), n(seats.cap))}</p>;
}

/* ── what is picked ──────────────────────────────────────────────────────────────────────────── */

/**
 * Who is picked, by name, at the head of the form.
 *
 * It was a large portrait hung beside the roster. With the roster beside the form the picked tile is
 * already in view, lit, at twice its size; what the form still needs is the NAME, and a line that
 * says what to do first while nothing is picked (the Join button is off until something is, and a
 * button that is off with no reason given is a dead end).
 *
 * The face is the tile's own portrait at its own 1x, cropped to the head by the frame, never scaled:
 * a fractional scale would smear the pixel grid (see TILE_SIZE).
 */
function Chosen({ selected, entry, copy }: { selected: Selection; entry: RosterEntry | null; copy: Copy }) {
  if (!selected) return <p className="mb-5 text-[14px] text-parchment/55">{copy.pickHint}</p>;
  return (
    <div className="mb-5 flex items-center gap-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-parchment/15 bg-ink-deep">
        <div className="mx-auto w-[72px] -translate-x-2">{entry ? <Portrait entry={entry} fallbackScale={2} /> : <Silhouette breathing={false} />}</div>
      </div>
      <div>
        <p className="eyebrow">{copy.chosen}</p>
        <p className="mt-0.5 font-serif text-2xl leading-tight text-parchment">{entry ? entry.name : copy.you}</p>
      </div>
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
      className={`${TILE_SIZE} relative block overflow-hidden rounded-md border-2 bg-ink-deep outline-none transition-colors ${
        selected
          ? "border-parchment/80"
          : "border-parchment/[0.07] hover:border-parchment/40 focus-visible:border-parchment/60"
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
    label: string;
    you: string;
    onSelect: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }
>(function EmptyTile({ selected, tabIndex, label, you, onSelect, onKeyDown }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      tabIndex={tabIndex}
      onClick={onSelect}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      className={`${TILE_SIZE} group relative flex aspect-[72/108] items-end justify-center overflow-hidden rounded-md border-2 border-dashed bg-ink-deep outline-none transition-all ${
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
        className={`pointer-events-none absolute inset-x-0 top-1 text-center text-[9px] font-medium uppercase tracking-[0.18em] transition-colors lg:top-2 lg:text-[11px] ${
          selected ? "text-echo-soft" : "text-echo-soft/70 group-hover:text-echo-soft"
        }`}
      >
        {you}
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
  copy,
  fill,
  onPick,
  formRef,
  photoEnabled,
  selfie,
  onSelfie,
  consent,
  onConsent,
}: {
  copy: Copy;
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
      const m = copy.err.type;
      setErr(m);
      onSelfie(null, m);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const m = copy.err.size;
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
      setErr(copy.err.read);
      return;
    }
    // Dimensions and alpha are checked from the decoded image, not from the file name.
    const img = new Image();
    img.onload = () => {
      if (Math.min(img.width, img.height) < 384) {
        const m = copy.err.small;
        setErr(m);
        onSelfie(null, m);
        return;
      }
      if (Math.max(img.width, img.height) > 5000) {
        const m = copy.err.large;
        setErr(m);
        onSelfie(null, m);
        return;
      }
      onSelfie(dataUri);
    };
    img.onerror = () => {
      const m = copy.err.notImage;
      setErr(m);
      onSelfie(null, m);
    };
    img.src = dataUri;
  }

  // Two choices and, under the first, what it needs. No box around the group: it is part of the
  // form, and the two choices are the only things here that are objects.
  const option = (on: boolean, off = false) =>
    `w-full rounded-xl border px-4 py-3 text-left text-[14px] transition-colors disabled:cursor-not-allowed ${
      off ? "border-parchment/[0.08] text-parchment/30" : on ? "border-parchment/60 text-parchment" : "border-parchment/15 text-parchment/85 hover:border-parchment/40"
    }`;
  const hint = "mt-0.5 block text-[12.5px] leading-snug text-parchment/45";

  return (
    <div className="mb-6">
      <p className="eyebrow mb-3">{copy.fill.title}</p>
      <div className="flex flex-col gap-2">
        {/* Not offered when it cannot deliver. A disabled button that says why beats a live one that
            takes a photo, takes a seat, and returns nothing. */}
        <button type="button" disabled={!photoEnabled} aria-pressed={fill === "photo"} onClick={() => onPick("photo")} className={option(fill === "photo", !photoEnabled)}>
          {copy.fill.photo}
          <span className={hint}>{photoEnabled ? copy.fill.photoOn : copy.fill.photoOff}</span>
        </button>
        <button
          type="button"
          aria-pressed={fill === "premade"}
          onClick={() => {
            onPick("premade");
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className={option(fill === "premade")}
        >
          {copy.fill.premade}
          <span className={hint}>{copy.fill.premadeHint}</span>
        </button>
      </div>

      {fill === "photo" && (
        <div className="mt-4">
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
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-ghost">
              {selfie ? copy.fill.change : copy.fill.choose}
            </button>
            {selfie && (
              // eslint-disable-next-line @next/next/no-img-element -- a local data URI preview
              <img src={selfie} alt={copy.fill.alt} className="h-12 w-12 rounded-lg object-cover" />
            )}
          </div>

          {/* CONSENT AT THE POINT OF UPLOAD, not buried in a footer link. It says where the photo
              goes, what is kept, and for how long, in the same breath as the button that sends it. */}
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} className="mt-0.5 accent-echo" />
            <span className="text-[13px] leading-relaxed text-parchment/60">{copy.fill.consent}</span>
          </label>

          {err && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {err}
            </p>
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-parchment/40">{copy.fill.note}</p>
        </div>
      )}
    </div>
  );
}

/* ── the form ────────────────────────────────────────────────────────────────────────────────── */

function Form({
  copy,
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
  copy: Copy;
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
  // The site's own field and its one filled button (C96). Parchment, not echo-violet: the violet on
  // this section is spent on the empty slot, and a violet submit would dwarf the one accent that
  // matters.
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">{copy.name}</span>
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder={copy.namePh} autoComplete="name" maxLength={80} className="field" />
        </label>
        <label className="block">
          <span className="sr-only">{copy.email}</span>
          <input value={email} onChange={(e) => onEmail(e.target.value)} placeholder={copy.emailPh} type="email" autoComplete="email" maxLength={254} className="field" />
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
          <p role="alert" data-waitlist-error className="rounded-xl border border-danger/40 px-4 py-2.5 text-[13px] leading-snug text-danger">
            {error}
          </p>
        )}

        {/* When the list is full the button says so and stops. The form is not hidden and the
            endpoint still refuses with a 409 — hiding it would leave the cap unenforced and make
            the scarcity a UI trick rather than a fact (§8). */}
        <button type="submit" disabled={busy || disabled || full} className="btn btn-primary mt-1 w-full">
          {full ? copy.full : busy ? copy.joining : copy.join}
        </button>
        <p className="text-[12.5px] leading-relaxed text-parchment/45">{copy.note}</p>
      </div>
    </form>
  );
}

/* ── confirmation ────────────────────────────────────────────────────────────────────────────── */

function Joined({
  copy,
  already,
  seat,
  entry,
  portraitPending,
}: {
  copy: Copy;
  already: boolean;
  seat: number | null;
  entry: RosterEntry | null;
  portraitPending: boolean;
}) {
  return (
    <section id="waitlist" className={SECTION}>
      <div className={`${WRAP} flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-12`}>
        <div className="box-content w-[144px] shrink-0 overflow-hidden rounded-xl border border-parchment/15 bg-ink-deep">
          {entry ? <Portrait entry={entry} fallbackScale={4} /> : <Silhouette breathing={false} />}
        </div>
        <div className="max-w-md">
          {/* A real seat number, assigned by the database, not a flourish. It is the one number here
              that means something, so it is the one number shown. No confetti. */}
          {seat !== null && <p className="eyebrow mb-4">{copy.joined.arrival(seat)}</p>}
          <h2 data-waitlist-joined className="font-serif text-[clamp(1.85rem,3.2vw,2.6rem)] leading-[1.08] tracking-[-.02em] text-parchment">{already ? copy.joined.kept : copy.joined.yours}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-parchment/65">
            {portraitPending
              ? // Honest about the wait AND about the seat: the place is already theirs, the drawing
                // is the only thing outstanding. No progress bar, because we cannot honestly promise
                // a time — generation is someone else's queue.
                copy.joined.pending
              : already
                ? copy.joined.already
                : copy.joined.fresh}
          </p>
          {/* The world is open (C89): a place kept is no reason to wait outside it. */}
          <p className="mt-6 text-[14px] text-parchment/55">{copy.joined.open}</p>
          <a href={OPEN_VILLAGE_PATH} className="btn btn-primary mt-3">
            {copy.joined.walkIn} <span aria-hidden>›</span>
          </a>
        </div>
      </div>
    </section>
  );
}
