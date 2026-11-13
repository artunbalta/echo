"use client";

/**
 * The short way onto the waitlist (DECISIONS C97): a name, an email, one button.
 *
 * WHY IT EXISTS. Joining meant scrolling four screens to a roster, picking a figure, and only then
 * finding two fields; the page's first button walked into the village instead. The village now opens
 * in turns, so the list is the page's main action and has to be the first thing a hand can reach. This
 * is that: it stands at the head of the landing and at the end of a ten-second look at the village
 * (`components/world/PreviewGate.tsx`). The roster is still there for whoever wants a figure
 * (`app/_landing/CharacterSelect.tsx`), and reads who joined from `lib/waitlistSeat.ts`.
 *
 * It posts what the roster's form posts, without a figure: the route takes that as a place with no
 * character yet. Its checks are the route's own, made here first so a person reads them in their own
 * language; the route makes them again, because anyone can post to it.
 */
import { useEffect, useId, useRef, useState } from "react";

import { useLang, type Lang } from "@/lib/lang";
import { step } from "@/lib/steps";
import { setSeat } from "@/lib/waitlistSeat";

interface Copy {
  name: string;
  namePh: string;
  email: string;
  emailPh: string;
  join: string;
  joining: string;
  note: string;
  err: { name: string; email: string; many: string; full: string; closed: string; save: string; reach: string };
  done: { title: (name: string) => string; seat: (seat: number) => string; fresh: (email: string) => string; already: string };
}

const COPY: Record<Lang, Copy> = {
  en: {
    name: "Your name",
    namePh: "Deniz",
    email: "Your email",
    emailPh: "deniz@example.com",
    join: "Join the waitlist",
    joining: "Joining…",
    note: "Name and email only. We write to you when it is your turn.",
    err: {
      name: "Tell us what to call you.",
      email: "That email address does not look right.",
      many: "Too many signups from here. Try again a little later.",
      full: "Every place is taken.",
      closed: "The waitlist is not available right now. Please try again later.",
      save: "Could not save that. Please try again.",
      reach: "Could not reach the waitlist. Check your connection and try again.",
    },
    done: {
      title: (name) => `You are on the list, ${name}.`,
      seat: (seat) => `Your place in the line: ${seat}.`,
      fresh: (email) => `When it is your turn we will write to ${email}.`,
      already: "You were already on the list. Your place has not changed.",
    },
  },
  tr: {
    name: "Adın",
    namePh: "Deniz",
    email: "E-posta adresin",
    emailPh: "deniz@ornek.com",
    join: "Sıraya gir",
    joining: "Kaydediliyor…",
    note: "Yalnızca ad ve e-posta. Sıran geldiğinde sana yazarız.",
    err: {
      name: "Sana ne diyeceğimizi yaz.",
      email: "E-posta adresi doğru görünmüyor.",
      many: "Buradan çok fazla kayıt geldi. Biraz sonra yeniden dene.",
      full: "Bütün yerler doldu.",
      closed: "Bekleme listesi şu an açık değil. Lütfen biraz sonra yeniden dene.",
      save: "Kaydedilemedi. Lütfen yeniden dene.",
      reach: "Bekleme listesine ulaşılamadı. Bağlantını kontrol edip yeniden dene.",
    },
    done: {
      title: (name) => `Sıradasın, ${name}.`,
      seat: (seat) => `Sıra numaran: ${seat}.`,
      fresh: (email) => `Sıran geldiğinde ${email} adresine yazacağız.`,
      already: "Zaten sıradaydın. Yerin değişmedi.",
    },
  },
};

/** The route's own shape check, so the same address passes or fails in both places. */
function looksLikeEmail(s: string): boolean {
  return s.length >= 3 && s.length <= 254 && /^[^@\s]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s) && !s.includes("..");
}

export default function WaitlistForm({ where, after = null, className = "" }: { where: "landing" | "gate"; after?: React.ReactNode; className?: string }) {
  const lang = useLang();
  const copy = COPY[lang];
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot; a human never sees or fills this
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ already: boolean; seat: number | null; name: string; email: string } | null>(null);

  // "Join the waitlist" in the header leads here (`/#waitlist`) and says so (`echo:join`). The page
  // scrolls to the form; this puts the caret in its first field, so the button is followed by typing
  // and not by a second press.
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (where !== "landing") return;
    const arrive = () => first.current?.focus({ preventScroll: true });
    window.addEventListener("echo:join", arrive);
    return () => window.removeEventListener("echo:join", arrive);
  }, [where]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const who = name.trim();
    const mail = email.trim().toLowerCase();
    if (!who) return setError(copy.err.name);
    if (!looksLikeEmail(mail)) return setError(copy.err.email);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: who, email: mail, website, characterSource: "premade", characterRef: null }),
      });
      const data = (await res.json().catch(() => ({}))) as { already?: boolean; seat?: number | null };
      if (!res.ok) {
        setError(res.status === 429 ? copy.err.many : res.status === 409 ? copy.err.full : res.status === 503 ? copy.err.closed : res.status === 400 ? copy.err.email : copy.err.save);
        return;
      }
      const seat = typeof data.seat === "number" ? data.seat : null;
      setSeat({ name: who, email: mail, seat });
      setDone({ already: Boolean(data.already), seat, name: who, email: mail });
      // How far people come (C92): a place taken. A second press by the same person is the same place.
      if (!data.already) step("joined");
    } catch {
      setError(copy.err.reach);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div data-waitlist-done={where} role="status" className={className}>
        <p className="text-[1.25rem] font-semibold leading-snug tracking-[-.01em] text-parchment">{copy.done.title(done.name)}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-parchment/70">
          {done.already ? copy.done.already : `${done.seat !== null ? `${copy.done.seat(done.seat)} ` : ""}${copy.done.fresh(done.email)}`}
        </p>
        {after}
      </div>
    );

  const label = "mb-1.5 block text-[13px] text-parchment/65";
  return (
    <form data-waitlist-form={where} onSubmit={submit} noValidate className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}n`} className={label}>
            {copy.name}
          </label>
          <input ref={first} id={`${id}n`} value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePh} autoComplete="name" maxLength={80} className="field h-12" />
        </div>
        <div>
          <label htmlFor={`${id}e`} className={label}>
            {copy.email}
          </label>
          <input id={`${id}e`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={copy.emailPh} type="email" inputMode="email" autoComplete="email" maxLength={254} className="field h-12" />
        </div>
      </div>

      {/* Honeypot. Hidden from people and from assistive tech; only a bot fills it in. Not
          display:none — some bots skip those. Off-screen + aria-hidden + tabIndex -1. */}
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error ? (
        <p role="alert" data-waitlist-error className="mt-3 text-[13.5px] leading-snug text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn btn-primary mt-4 h-12 w-full text-[15px] sm:w-auto sm:px-8">
        {busy ? copy.joining : copy.join}
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-parchment/50">{copy.note}</p>
    </form>
  );
}
