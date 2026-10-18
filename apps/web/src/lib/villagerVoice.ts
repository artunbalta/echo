/**
 * A villager's voice (DECISIONS C44): their reply, spoken, by the browser.
 *
 * LOCAL VOICES ONLY. The browser's speech synthesis can be backed by a cloud service — Chrome's
 * "Google" voices send the text to Google — and the panel promises that what is said goes to Claude
 * and nowhere else. So only voices the browser marks `localService` are used, and a browser with
 * none stays silent rather than quietly sending the reply somewhere. Nothing here listens: there is
 * no speech-to-text, for the same reason in the other direction.
 *
 * ONE VOICE PER PERSON. Pitch and rate come from the villager — their sex, their age, and a number
 * from their id — so the same person sounds the same every visit, and two people in a village do not
 * sound alike. The voice itself is the language's first local voice; there are rarely more.
 *
 * Off by default, remembered per browser (`localStorage`, wrapped: a private window may refuse it).
 */

const KEY = "echo.villagerVoice";

export function voiceWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setVoiceWanted(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // a private window: the toggle still works for this page
  }
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Turkish if the text looks Turkish, else the page's language. The villager answers in yours. */
export function languageOf(text: string): string {
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return "tr";
  return (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
}

function localVoiceFor(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.localService);
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

/** A number in [0, 1) from an id, so a person's voice does not change between visits. */
function unit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export interface Speaker {
  id: string;
  sex: "f" | "m";
  age: number;
}

/** Pitch and rate for a person. Children high and quick, the old lower and slower. */
export function voiceFor(p: Speaker): { pitch: number; rate: number } {
  const u = unit(p.id);
  let pitch = p.sex === "f" ? 1.15 : 0.85;
  if (p.age < 13) pitch += 0.35;
  else if (p.age >= 65) pitch -= 0.12;
  pitch += (u - 0.5) * 0.25;
  const rate = (p.age < 13 ? 1.08 : p.age >= 65 ? 0.86 : 0.97) + (unit(`${p.id}/rate`) - 0.5) * 0.12;
  return { pitch: Math.min(2, Math.max(0.1, pitch)), rate };
}

/** Speak a line in a person's voice. False if there is no local voice to speak it with. */
export function speak(text: string, p: Speaker): boolean {
  if (!canSpeak()) return false;
  const voice = localVoiceFor(languageOf(text));
  if (!voice) return false;
  const u = new SpeechSynthesisUtterance(text);
  const { pitch, rate } = voiceFor(p);
  u.voice = voice;
  u.lang = voice.lang;
  u.pitch = pitch;
  u.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

export function hush(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
