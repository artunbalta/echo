"use client";

/**
 * The pilot's debrief (C80) with made-up answers, to look at it without playing two visits a day apart.
 * Dev only: renders nothing in production, not linked from anywhere.
 */
import PilotReveal, { type Debrief } from "@/components/pilot/PilotReveal";
import { setLang, useLang } from "@/lib/i18n";

const SAMPLE: Debrief = {
  ready: true,
  shareable: true,
  rows: [
    { paradigm: "give", said: 2 / 3, friends: 2 / 3, friendsCount: 3, echo: 0.43, did: 1 / 3, looks: 1, closest: ["echo"] },
    { paradigm: "lend", said: 1, friends: 1, friendsCount: 3, echo: 0.8, did: 1, looks: 1, closest: ["said", "friends"] },
    { paradigm: "bet", said: 0.5, friends: 0, friendsCount: 2, echo: 0.72, did: 1, looks: 1, closest: ["echo"] },
    { paradigm: "seed", said: 1, friends: null, friendsCount: 1, echo: 0.24, did: 0, looks: 1, closest: ["echo"] },
    { paradigm: "path", said: 1, friends: 1, friendsCount: 2, echo: 0.62, did: 1, looks: 1, closest: ["said", "friends"] },
    { paradigm: "greet", said: 0, friends: 1, friendsCount: 3, echo: null, did: null, looks: 0, closest: [] },
  ],
  tally: { said: 2, friends: 2, echo: 3 },
  knows: { give: { looks: 2, share: 0.75 }, lend: { looks: 2, share: 0.75 }, bet: { looks: 2, share: 0.75 }, seed: { looks: 2, share: 0.75 }, path: { looks: 2, share: 0.75 }, greet: { looks: 1, share: 0.6 } },
};

export default function PilotRevealPreview() {
  const lang = useLang();
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="flex min-h-full w-full justify-center overflow-y-auto bg-ink px-5 py-10">
      <div className="w-[min(560px,100%)] text-parchment">
        <div className="mb-6 flex justify-end gap-3 text-xs text-parchment/50">
          <button type="button" onClick={() => setLang("tr")}>TR</button>
          <button type="button" onClick={() => setLang("en")}>EN</button>
        </div>
        <PilotReveal debrief={SAMPLE} lang={lang} onBack={() => undefined} />
      </div>
    </div>
  );
}
