"use client";

/**
 * The film (landing §1, DECISIONS C100): half a minute that says the whole thing, where the page's
 * words used to try to.
 *
 * It is not a video file. The film is drawn live by its own script (`public/film/echo-calls-it.html`,
 * 56 kB with its sound), so it is sharp at any size, wide on a wide screen and tall on a phone, and
 * costs the page nothing until its frame is near the screen. It opens on its own poster with its own
 * Play, so the press that starts the sound is made inside it, which is where a browser wants it made.
 * Its last button is the page's waitlist.
 *
 * The frame is told the page's language. A film cannot be skimmed, so the section has a title for a
 * screen reader and the hero's link to land on, and no words of its own on the screen: the poster
 * says what it is.
 */
import { useLang, type Lang } from "@/lib/lang";
import { SECTION, WRAP } from "./Section";

const COPY: Record<Lang, { title: string }> = {
  en: { title: "The film: ECHO in half a minute" },
  tr: { title: "Film: yarım dakikada ECHO" },
};

export default function Film() {
  const lang = useLang();
  return (
    <section id="film" className={SECTION} aria-labelledby="film-title">
      <div className={WRAP}>
        <h2 id="film-title" className="sr-only">
          {COPY[lang].title}
        </h2>
        <div className="px-frame mx-auto max-w-[1040px]">
          <iframe key={lang} src={`/film/echo-calls-it.html?lang=${lang}`} title={COPY[lang].title} loading="lazy" allow="autoplay" className="film-frame block w-full border-0 bg-[#07040b]" />
        </div>
      </div>
    </section>
  );
}
