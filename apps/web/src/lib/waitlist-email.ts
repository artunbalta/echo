import "server-only";

/**
 * The waitlist's two emails, via Resend's REST API: the confirmation of a place taken
 * (`sendJoinedEmail`, C97) and the portrait drawn from a photo (`sendWaitlistEmail`).
 *
 * WHY THERE IS A CONFIRMATION. There was none: an email went out only when a portrait had been
 * drawn, so someone who left a name and an address heard nothing, and had no way to tell a place
 * taken from a form that had done nothing. The owner joined to try it and waited for a message that
 * no code sent. Now a place taken is answered at once, in the language the form was read in.
 *
 * No SDK: the whole surface used here is one POST to /emails. Adding a dependency to build one JSON
 * body is not worth the supply chain, and `fetch` is already the house style for provider calls
 * (see lib/art/fal.ts).
 *
 * THE PORTRAIT IS ATTACHED, NEVER HOTLINKED. A remote <img> is blocked by default in Gmail,
 * Outlook and Apple Mail, so the one thing the email exists to deliver would be a grey box for most
 * people. It is also a tracking vector, and this email is not doing that. Attached, it is theirs,
 * offline, forever.
 *
 * EVERY SEND CARRIES A PLAIN-TEXT ALTERNATIVE. Not a courtesy: a multipart message with no text
 * part is a spam signal, and the text part is what a screen reader and a text client actually read.
 *
 * REGISTER: the world's. No exclamation marks, no "Welcome aboard!", no adjectives claiming the
 * thing is exciting. It states what happened and stops. Em-dashes are banned in user-facing copy.
 */

const RESEND_URL = "https://api.resend.com/emails";

/** The From address. Must be on a domain verified in Resend or every send 403s. */
const FROM = process.env.RESEND_FROM || "echo <hello@echovirtualworld.com>";

export const hasResend = () => Boolean(process.env.RESEND_API_KEY);

/** One POST to Resend. False, never a throw: a place already taken must not be lost to a mail provider's bad minute. */
async function deliver(body: Record<string, unknown>): Promise<boolean> {
  if (!hasResend()) {
    console.warn("[waitlist-email] RESEND_API_KEY unset — no email sent.");
    return false;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, ...body }),
      // The join waits for this answer so it can say truthfully whether a message went; not for long.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error("[waitlist-email] resend failed:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[waitlist-email] resend unreachable:", (err as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

/* ── a place taken ───────────────────────────────────────────────────────────────────────────── */

interface JoinedArgs {
  to: string;
  name: string;
  seat: number | null;
  /** The language the form was read in. */
  lang: "en" | "tr";
  /** A photo was sent with the place: its character comes in a second email. */
  portraitPending?: boolean;
}

/**
 * The confirmation's words. Turkish is written first and the English is its own sentence, as on the
 * landing. It says what happened, what ECHO is in one sentence (the landing's own), what comes next,
 * and what to do if the address was entered by someone else: nothing.
 */
const JOINED: Record<"en" | "tr", { subject: (seat: number | null) => string; on: string; seat: (seat: number) => string; what: string; next: string; portrait: string; notYou: string }> = {
  en: {
    subject: (seat) => (seat ? `You are on the ECHO waitlist (place ${seat})` : "You are on the ECHO waitlist"),
    on: "You are on the ECHO waitlist.",
    seat: (seat) => `Your place in the line: ${seat}.`,
    what: "ECHO is a small village you walk through in your browser. It watches what you do there, not what you say, and builds an agent that acts like you.",
    next: "The village is opening in turns. When it is your turn, we will write to this address with your way in.",
    portrait: "Your character is being drawn from your photo. It will arrive in a second email.",
    notYou: "If you did not sign up, you can ignore this email.",
  },
  tr: {
    subject: (seat) => (seat ? `ECHO bekleme listesindesin (sıra numaran ${seat})` : "ECHO bekleme listesindesin"),
    on: "ECHO\u2019nun bekleme listesindesin.",
    seat: (seat) => `Sıra numaran: ${seat}.`,
    what: "ECHO, tarayıcında gezdiğin küçük bir köy. Orada ne söylediğine değil, ne yaptığına bakar ve senin gibi davranan bir agent çıkarır.",
    next: "Köy sırayla açılıyor. Sıran geldiğinde bu adrese, içeri gireceğin bağlantıyla birlikte yazacağız.",
    portrait: "Karakterin fotoğrafından çiziliyor. Hazır olduğunda ikinci bir e-postayla gelecek.",
    notYou: "Bu kaydı sen yapmadıysan bu e-postayı yok sayabilirsin.",
  },
};

/** The confirmation's paragraphs, in order: the text part is these, and the HTML is these with a frame. */
function joinedLines({ name, seat, lang, portraitPending }: JoinedArgs): string[] {
  const c = JOINED[lang];
  return [`${name},`, seat ? `${c.on} ${c.seat(seat)}` : c.on, c.what, c.next, ...(portraitPending ? [c.portrait] : []), c.notYou];
}

/** Send the confirmation of a place taken. True when the provider took it. */
export async function sendJoinedEmail(args: JoinedArgs): Promise<boolean> {
  const lines = joinedLines(args);
  // The site's one face is a web font and an email cannot count on it; this is the reader's own sans.
  const face = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const p = (s: string, colour = "#e8dcc0") => `<p style="margin:0 0 18px;font-family:${face};font-size:16px;line-height:1.6;color:${colour};">${esc(s)}</p>`;
  const html = `<!doctype html>
<html lang="${args.lang}"><body style="margin:0;padding:0;background:#1c1326;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c1326;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td>
  <p style="margin:0 0 28px;font-family:${face};font-size:20px;font-weight:700;color:#f4e9d0;letter-spacing:.5px;">echo</p>
  ${lines.slice(0, -1).map((l) => p(l)).join("\n  ")}
  ${p(lines[lines.length - 1]!, "#8b8194")}
  <p style="margin:32px 0 0;font-family:${face};font-size:12px;color:#6b6478;">echovirtualworld.com</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  return deliver({
    to: [args.to],
    subject: JOINED[args.lang].subject(args.seat),
    text: [...lines, "echo", "echovirtualworld.com"].join("\n\n"),
    html,
  });
}

/* ── the portrait ────────────────────────────────────────────────────────────────────────────── */

interface SendArgs {
  to: string;
  name: string;
  seat: number | null;
  /** The generated portrait. Null means generation failed or was never asked for, and the copy
   *  says so rather than substituting something. */
  portraitPng?: Buffer | null;
}

function subjectFor(seat: number | null): string {
  return seat ? `Your place on the shore is kept (arrival ${seat})` : "Your place on the shore is kept";
}

/** The text part. Written first, on purpose: if the copy does not work as plain text it does not
 *  work. The HTML below is this, with a frame around it. */
function textBody({ name, seat, hasPortrait }: { name: string; seat: number | null; hasPortrait: boolean }) {
  const lines = [
    `${name},`,
    ``,
    `Your place is kept.${seat ? ` You are arrival ${seat}.` : ""}`,
    ``,
    hasPortrait
      ? `Your character is attached. It was drawn from the photo you sent, in the world's own hand. The photo itself is gone; we kept only the character.`
      : `We could not make your character from your photo this time. Your place is not affected, and you will choose a character when you arrive. Nothing of the photo was kept.`,
    ``,
    `The village is opening in turns. When it is your turn, this address is how we reach you.`,
    ``,
    `No one knows you there. That is the point.`,
    ``,
    `echo`,
    `echovirtualworld.com`,
  ];
  return lines.join("\n");
}

function htmlBody({ name, seat, hasPortrait }: { name: string; seat: number | null; hasPortrait: boolean }) {
  const p = (s: string) =>
    `<p style="margin:0 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;line-height:1.75;color:#e8dcc0;">${s}</p>`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#1c1326;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c1326;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td>
  <p style="margin:0 0 28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;font-weight:bold;color:#f4e9d0;letter-spacing:1px;">echo</p>
  ${p(esc(name) + ",")}
  ${p("Your place is kept." + (seat ? ` You are arrival <span style="color:#f4e9d0;">${seat}</span>.` : ""))}
  ${p(
    hasPortrait
      ? "Your character is attached. It was drawn from the photo you sent, in the world's own hand. The photo itself is gone; we kept only the character."
      : "We could not make your character from your photo this time. Your place is not affected, and you will choose a character when you arrive. Nothing of the photo was kept.",
  )}
  ${p("The village is opening in turns. When it is your turn, this address is how we reach you.")}
  ${p('<span style="color:#8b8194;">No one knows you there. That is the point.</span>')}
  <p style="margin:32px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#6b6478;">echovirtualworld.com</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/**
 * Send it. Returns false rather than throwing when Resend is not configured, so a missing key
 * degrades to "no email" instead of crashing a job that has already taken someone's seat.
 */
export async function sendWaitlistEmail({ to, name, seat, portraitPng }: SendArgs): Promise<boolean> {
  const hasPortrait = Boolean(portraitPng?.length);
  const body: Record<string, unknown> = {
    to: [to],
    subject: subjectFor(seat),
    text: textBody({ name, seat, hasPortrait }),
    html: htmlBody({ name, seat, hasPortrait }),
  };
  if (hasPortrait) {
    body.attachments = [
      { filename: "your-character.png", content: portraitPng!.toString("base64") },
    ];
  }

  return deliver(body);
}
