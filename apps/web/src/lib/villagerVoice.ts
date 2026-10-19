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

// ── voices from the cloud, and the stranger's own (C60) ─────────────────────────────

/**
 * C60 adds what C44 left out on purpose, and asks first. Villagers' replies can be spoken by
 * ElevenLabs in a voice of each person's own, and the stranger can talk aloud: held down, the key
 * records, and ElevenLabs writes it down. Both send something to a service the C44 panel promised
 * nothing went to, so neither happens until the stranger has said yes to exactly that, here, once.
 * The answer is kept in this browser. A no keeps C44: this browser's local voices and the keyboard.
 */
const CLOUD_KEY = "echo.voiceCloud";

/** Yes, no, or never asked. */
export function cloudWanted(): boolean | null {
  try {
    const v = localStorage.getItem(CLOUD_KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

export function setCloudWanted(on: boolean): void {
  try {
    localStorage.setItem(CLOUD_KEY, on ? "on" : "off");
  } catch {
    // a private window: the answer holds for this page
  }
}

/**
 * One element for every reply, so that a browser which plays sound only from inside a click or a key
 * (Safari) still plays a reply that arrives seconds after it: `unlockCloud`, called from the press
 * that sent the words, plays silence through it, and later replies play through the same element.
 */
let player: HTMLAudioElement | null = null;
let lastUrl: string | null = null;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** From a click or a key, before anything is awaited. */
export function unlockCloud(): void {
  if (typeof Audio === "undefined") return;
  if (player) return;
  player = new Audio();
  player.src = SILENCE;
  void player.play().catch(() => {});
}

/** A villager's line in their own voice. False when it could not be had, so the caller can fall back. */
export async function speakCloud(line: { cell: string; person: string; text: string; token: string | null }, headers: Record<string, string>): Promise<boolean> {
  if (!line.token || typeof Audio === "undefined") return false;
  try {
    const res = await fetch("/api/village/voice", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(line) });
    if (!res.ok) return false;
    const blob = await res.blob();
    // Your own line first, when one is being said (C62): the reply waits for it rather than cutting in.
    await selfLine;
    await playBlob(blob);
    return true;
  } catch {
    return false;
  }
}

async function playBlob(blob: Blob): Promise<HTMLAudioElement> {
  const url = URL.createObjectURL(blob);
  hushCloud();
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = url;
  player ??= new Audio();
  player.src = url;
  await player.play();
  return player;
}

/** Resolves when the element stops: ended, paused, failed, or after twenty seconds at most. */
function untilDone(a: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      for (const ev of ["ended", "pause", "error"]) a.removeEventListener(ev, done);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, 20_000);
    for (const ev of ["ended", "pause", "error"]) a.addEventListener(ev, done);
  });
}

/** The stranger's own line while it is being said; a reply waits on it. */
let selfLine: Promise<void> = Promise.resolve();

/** Whether this stranger has a voice of their own here (C62): the owner's, and nobody else's. */
export async function ownVoiceHere(headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch("/api/voice/self", { headers });
    return res.ok && ((await res.json()) as { mine?: boolean }).mine === true;
  } catch {
    return false;
  }
}

/** What the stranger typed, in their own voice (C62). Set before anything is awaited, so a reply fetched alongside waits for it. */
export async function speakSelf(text: string, headers: Record<string, string>): Promise<boolean> {
  if (typeof Audio === "undefined") return false;
  let release!: () => void;
  selfLine = new Promise<void>((r) => (release = r));
  try {
    const res = await fetch("/api/voice/self", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) return false;
    const a = await playBlob(await res.blob());
    await untilDone(a);
    return true;
  } catch {
    return false;
  } finally {
    release();
  }
}

export function hushCloud(): void {
  player?.pause();
}

/** Whether this browser can record at all. */
export function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** At most this long a held key records, milliseconds. */
export const RECORD_MS = 15_000;

/**
 * A recorder for one held key: `start` on the press, `stop` on the release. The microphone is asked
 * for on each press and let go of whenever recording ends, so the browser's recording light is on
 * only while the key is down, and at most `RECORD_MS`.
 *
 * A key let go of before the browser has handed over the microphone wins: the start that resolves
 * after it lets the microphone go at once and answers `"let-go"`, rather than recording a stranger
 * who is no longer holding anything.
 */
export function recorder() {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let began = 0;
  /** Bumped by every stop and cancel; a start from an earlier turn is stale when it resolves. */
  let turn = 0;
  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  /** Stop a recorder and wait for its last data, whether or not it has stopped already. */
  const ended = (r: MediaRecorder) =>
    r.state === "inactive"
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          r.addEventListener("stop", () => resolve(), { once: true });
          r.stop();
        });
  return {
    async start(): Promise<"on" | "denied" | "let-go"> {
      if (rec) return "on";
      const mine = ++turn;
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return "denied";
      }
      if (mine !== turn) {
        s.getTracks().forEach((t) => t.stop());
        return "let-go";
      }
      try {
        stream = s;
        const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
        const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
        chunks = [];
        r.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        // However it ends — let go, cancelled, or the time run out — the microphone is let go of.
        r.addEventListener("stop", () => {
          if (stream === s) release();
          else s.getTracks().forEach((t) => t.stop());
        });
        r.start();
        rec = r;
        began = performance.now();
        timer = setTimeout(() => {
          if (r.state === "recording") r.stop();
        }, RECORD_MS);
        return "on";
      } catch {
        rec = null;
        release();
        return "denied";
      }
    },
    /** The recording, or null for one too short to be anything, or none at all. */
    async stop(): Promise<Blob | null> {
      turn++;
      const r = rec;
      rec = null;
      if (!r) return null;
      const long = performance.now() - began;
      await ended(r);
      release();
      if (long < 400 || chunks.length === 0) return null;
      return new Blob(chunks, { type: r.mimeType || "audio/webm" });
    },
    cancel() {
      turn++;
      if (rec?.state === "recording") rec.stop();
      rec = null;
      release();
    },
    /** Whether the microphone is held just now: for tests, and the light on the button. */
    live(): boolean {
      return stream !== null;
    },
  };
}

/** What was said in a recording, written down by the hear route; null when it could not be. */
export async function hearIt(blob: Blob, headers: Record<string, string>): Promise<{ text: string } | { error: string }> {
  try {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
    const res = await fetch(`/api/village/hear?lang=${encodeURIComponent(lang)}`, { method: "POST", headers: { ...headers, "content-type": blob.type.split(";")[0] || "audio/webm" }, body: blob });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    return res.ok && typeof data.text === "string" ? { text: data.text } : { error: data.error ?? String(res.status) };
  } catch {
    return { error: "unreachable" };
  }
}
