"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SitePage from "@/components/site/SitePage";
import { getPersona, type PersonaSnapshot } from "@/lib/agent";
import { IDENTITY_TOKEN_KEY, identityHeaders, refusedUnsigned } from "@/lib/identity";
import { eraseEnvelopes, type CountErased } from "@/lib/knowable/erase";
import { useLang, type Lang } from "@/lib/lang";
import { OPEN_VILLAGE_PATH } from "@/lib/openVillage";

interface Consent {
  world: boolean;
  telemetry: boolean;
  voice: boolean;
  biometric: boolean;
}

const CONSENTS = ["world", "telemetry", "voice", "biometric"] as const;

/**
 * The page's words, in both languages (C96). What each permission is called and what it covers is
 * what `/onboard` said when it was asked (the one place a person ever read it), so the switch and
 * the question it answers read the same.
 */
const COPY: Record<
  Lang,
  {
    eyebrow: string;
    title: string;
    lead: string;
    allow: string;
    required: string;
    consent: Record<keyof Consent, { name: string; what: string }>;
    learned: string;
    nothing: string;
    traits: string;
    forming: string;
    signals: string;
    contexts: string;
    eraseTitle: string;
    eraseLead: string;
    erase: string;
    confirm: string;
    yes: string;
    cancel: string;
    notErased: string;
    notErasedWhy: (what: string) => string;
    erased: string;
    erasedLine: string;
    countLeft: string;
    back: string;
  }
> = {
  en: {
    eyebrow: "Privacy",
    title: "Your data",
    lead: "What echo may learn is yours to control. Selfies are never stored, only the style derived from them.",
    allow: "What you allow",
    required: "required",
    consent: {
      world: { name: "Join the shared world", what: "Be present and visible to others." },
      telemetry: { name: "Learn from how I behave", what: "Movement, approach and avoid, hesitation, reply timing." },
      voice: { name: "Voice", what: "Push-to-talk conversations and the spoken narrator." },
      biometric: { name: "Use a selfie for my character", what: "A photo is processed to derive style only, then discarded. Never stored." },
    },
    learned: "What your echo has learned",
    nothing: "Nothing yet.",
    traits: "Traits",
    forming: "still forming",
    signals: "Signals recorded",
    contexts: "Autonomy contexts",
    eraseTitle: "Erase everything",
    eraseLead: "Your persona model, every behavioral signal, your character and all narrations, deleted for good.",
    erase: "Erase everything",
    confirm: "This permanently deletes your persona model, every behavioral signal, your character, and all narrations. It cannot be undone.",
    yes: "Yes, erase",
    cancel: "Cancel",
    notErased: "Not erased.",
    notErasedWhy: (what) => `Some of your data is still on the server and the erasure stopped rather than pretend otherwise. Nothing was cleared locally, so you can try again. If it keeps failing, this needs a person: ${what}`,
    erased: "Erased.",
    erasedLine: "No one knows you here again, not even your echo.",
    countLeft: "One thing could not be reached: what you added to a village's count. The envelopes in a village (O) can remove it.",
    back: "Back to the village",
  },
  tr: {
    eyebrow: "Gizlilik",
    title: "Verilerin",
    lead: "Echo'nun ne öğrenebileceğine sen karar verirsin. Selfie'ler asla saklanmaz, yalnızca onlardan çıkarılan stil saklanır.",
    allow: "Nelere izin veriyorsun",
    required: "zorunlu",
    consent: {
      world: { name: "Ortak dünyaya katıl", what: "Orada ol ve başkalarına görün." },
      telemetry: { name: "Davranışımdan öğren", what: "Hareket, yaklaşma ve uzak durma, duraksama, yanıt süresi." },
      voice: { name: "Ses", what: "Bas-konuş sohbetleri ve sesli anlatıcı." },
      biometric: { name: "Karakterim için selfie kullan", what: "Fotoğraf yalnızca stil çıkarmak için işlenir, sonra atılır. Asla saklanmaz." },
    },
    learned: "Yankın ne öğrendi",
    nothing: "Henüz bir şey yok.",
    traits: "Özellikler",
    forming: "hâlâ oluşuyor",
    signals: "Kaydedilen sinyal",
    contexts: "Özerklik bağlamı",
    eraseTitle: "Her şeyi sil",
    eraseLead: "Kişilik modelin, bütün davranış sinyallerin, karakterin ve bütün anlatılar kalıcı olarak silinir.",
    erase: "Her şeyi sil",
    confirm: "Bu işlem kişilik modelini, bütün davranış sinyallerini, karakterini ve bütün anlatıları kalıcı olarak siler. Geri alınamaz.",
    yes: "Evet, sil",
    cancel: "Vazgeç",
    notErased: "Silinmedi.",
    notErasedWhy: (what) => `Verilerinin bir kısmı hâlâ sunucuda; silme işlemi, olmuş gibi yapmak yerine durdu. Bu tarayıcıda hiçbir şey temizlenmedi, yeniden deneyebilirsin. Yine olmazsa buna bir insanın bakması gerekiyor: ${what}`,
    erased: "Silindi.",
    erasedLine: "Burada seni yine kimse tanımıyor, yankın bile.",
    countLeft: "Bir şeye ulaşılamadı: bir köyün sayımına eklediklerin. Köydeki zarflar (O) bunu kaldırabilir.",
    back: "Köye dön",
  },
};

/**
 * Privacy & data controls (§13). Review consent, see what's been learned, erase everything.
 *
 * In the site's frame now (C96): its header and footer, one readable column, the serif title, the
 * four permissions as rows with a switch each, and the site's danger button for the one thing that
 * cannot be undone. It was a monospace card alone on a page, whose only way out said "back to your
 * island" and led to a world that is no longer the one people walk into. WHAT IT DOES IS UNTOUCHED:
 * the same keys, the same order, the same refusals read the same way.
 */
export default function Account() {
  const router = useRouter();
  const copy = COPY[useLang()];
  const [uid, setUid] = useState("");
  const [consent, setConsent] = useState<Consent>({ world: true, telemetry: true, voice: false, biometric: false });
  const [snap, setSnap] = useState<PersonaSnapshot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // What the server said went wrong, when erasure was only partial. Null means it was clean.
  const [eraseError, setEraseError] = useState<string | null>(null);
  // What became of what this browser added to a village's count (C91): "left" is said, not hidden.
  const [count, setCount] = useState<CountErased>("none");

  useEffect(() => {
    const id = localStorage.getItem("echo.userId") ?? "";
    setUid(id);
    try {
      setConsent(JSON.parse(localStorage.getItem("echo.consent") ?? "{}"));
    } catch {
      /* defaults */
    }
    if (id) getPersona(id).then(setSnap);
  }, []);

  function updateConsent(key: keyof Consent, value: boolean) {
    const next = { ...consent, [key]: value };
    setConsent(next);
    localStorage.setItem("echo.consent", JSON.stringify(next));
  }

  async function eraseEverything() {
    // The response was being discarded, so a refused table still ended at "Erased." A page that
    // claims someone's data is gone has to have been told that it is. On a partial wipe say which
    // tables held, and do NOT clear the local id: it is the only handle left to retry with.
    let failed: string[] = [];
    // The envelopes and the village's count (C89, C91) go first and whatever the server answers: this
    // page cleared five keys, none of them theirs, and then said "not even your echo".
    const counted = await eraseEnvelopes();
    setCount(counted);
    try {
      // With no id there is nothing on the server to ask about (and the route would answer 400).
      const res = !uid ? null : await fetch("/api/account/delete", {
        method: "POST",
        headers: identityHeaders(),
        body: JSON.stringify({ userId: uid }),
      });
      const body = res ? ((await res.json().catch(() => ({}))) as { error?: string; supabaseTablesFailed?: string[] }) : {};
      // Refused for want of a signature this browser never had: nothing was kept there to erase.
      if (res && !res.ok && !refusedUnsigned(body.error)) failed = body.supabaseTablesFailed?.length ? body.supabaseTablesFailed : [`server ${res.status}`];
    } catch (err) {
      failed = [(err as Error).message];
    }
    if (failed.length) {
      setEraseError(failed.join(", "));
      setConfirming(false);
      return;
    }
    // THE TOKEN GOES WITH THE ID. This list predates C39 and kept removing four keys while leaving
    // `echo.identityToken` — a signature for a subject that no longer exists anywhere. The next
    // visit minted a fresh anonymous id under the dead signature and every write was refused with
    // identity_mismatch, permanently, because the mint short-circuited on "I have both keys".
    // `tokenMatchesSubject` now heals a browser already in that state; this stops creating new ones,
    // and leaving a credential behind after "erase everything" was never right on its own terms.
    ["echo.userId", "echo.name", "echo.consent", "echo.character", IDENTITY_TOKEN_KEY].forEach((k) => localStorage.removeItem(k));
    setDeleted(true);
    // Long enough to read the one thing that could not be reached, where there is one.
    setTimeout(() => router.push("/"), counted === "left" ? 9000 : 1800);
  }

  if (deleted) {
    return (
      <SitePage>
        <div className="mx-auto w-full max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28 [&>*]:max-w-[640px]" role="status">
          <h1 className="font-serif text-[clamp(2.1rem,5vw,3rem)] leading-[1.05] tracking-[-.02em] text-parchment">{copy.erased}</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-parchment/70">{copy.erasedLine}</p>
          {count === "left" ? (
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-parchment/60" data-account-count-left>
              {copy.countLeft}
            </p>
          ) : null}
        </div>
      </SitePage>
    );
  }

  const learned: [string, string][] = snap && snap.behaviors > 0 ? [[copy.traits, snap.traits.join(", ") || copy.forming], [copy.signals, String(snap.behaviors)], [copy.contexts, String(Object.keys(snap.buckets).length)]] : [];
  const h2 = "font-serif text-[1.35rem] leading-snug text-parchment";

  return (
    <SitePage>
      {/* The site's column, and one readable measure inside it, hung from the header's left edge. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-12 sm:px-8 sm:pt-16 [&>*]:max-w-[640px]">
        <p className="eyebrow mb-4">{copy.eyebrow}</p>
        <h1 className="font-serif text-[clamp(2.1rem,5vw,3rem)] leading-[1.05] tracking-[-.02em] text-parchment">{copy.title}</h1>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-parchment/70">{copy.lead}</p>

        <section className="mt-12" aria-labelledby="account-allow">
          <h2 id="account-allow" className={h2}>
            {copy.allow}
          </h2>
          <ul className="mt-4 divide-y divide-parchment/10 border-y border-parchment/10">
            {CONSENTS.map((k) => (
              <li key={k}>
                <label className={`flex items-center justify-between gap-6 py-4 ${k === "world" ? "" : "cursor-pointer"}`}>
                  <span>
                    <span className="block text-[15px] text-parchment">
                      {copy.consent[k].name}
                      {k === "world" ? <span className="text-parchment/45"> ({copy.required})</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-parchment/55">{copy.consent[k].what}</span>
                  </span>
                  {/* A real checkbox, drawn as a switch: the track is the box and the thumb is its ::before. */}
                  <input
                    type="checkbox"
                    role="switch"
                    data-account-consent={k}
                    checked={!!consent[k]}
                    disabled={k === "world"}
                    onChange={(e) => updateConsent(k, e.target.checked)}
                    className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-parchment/25 bg-ink-deep transition-colors before:absolute before:left-[3px] before:top-[3px] before:h-4 before:w-4 before:rounded-full before:bg-parchment/60 before:transition-transform checked:border-echo checked:bg-echo checked:before:translate-x-5 checked:before:bg-parchment focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-echo-soft disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="account-learned">
          <h2 id="account-learned" className={h2}>
            {copy.learned}
          </h2>
          {learned.length ? (
            <dl className="mt-4 divide-y divide-parchment/10 border-y border-parchment/10 text-[15px]">
              {learned.map(([name, value]) => (
                <div key={name} className="flex items-baseline justify-between gap-6 py-3">
                  <dt className="text-parchment/60">{name}</dt>
                  <dd className="text-right tabular-nums text-parchment">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-[15px] text-parchment/55">{copy.nothing}</p>
          )}
        </section>

        <section className="mt-12" aria-labelledby="account-erase">
          <h2 id="account-erase" className={h2}>
            {copy.eraseTitle}
          </h2>

          {eraseError ? (
            <div role="alert" data-account-erase-failed className="mt-4 rounded-xl border border-danger/50 px-4 py-3 text-[14px] leading-relaxed text-danger">
              <p className="font-medium">{copy.notErased}</p>
              <p className="mt-1 text-danger/85">{copy.notErasedWhy(eraseError)}</p>
            </div>
          ) : null}

          {!confirming ? (
            <>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-parchment/60">{copy.eraseLead}</p>
              <button type="button" data-account-erase onClick={() => setConfirming(true)} className="btn btn-danger mt-5">
                {copy.erase}
              </button>
            </>
          ) : (
            <div className="mt-4">
              <p className="max-w-md text-[15px] leading-relaxed text-danger">{copy.confirm}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" data-account-erase-yes onClick={eraseEverything} className="btn btn-danger bg-danger text-ink-deep hover:bg-danger/90">
                  {copy.yes}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost">
                  {copy.cancel}
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-14 text-sm">
          <Link href={OPEN_VILLAGE_PATH} className="text-link">
            <span aria-hidden>←</span> {copy.back}
          </Link>
        </p>
      </div>
    </SitePage>
  );
}
