import "server-only";

/**
 * The waitlist confirmation email, via Resend's REST API.
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
    `The island is not open yet. When it is, this address is how we reach you.`,
    ``,
    `No one knows you there. That is the point.`,
    ``,
    `echo`,
    `echovirtualworld.com`,
  ];
  return lines.join("\n");
}

function htmlBody({ name, seat, hasPortrait }: { name: string; seat: number | null; hasPortrait: boolean }) {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
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
  ${p("The island is not open yet. When it is, this address is how we reach you.")}
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
  if (!hasResend()) {
    console.warn("[waitlist-email] RESEND_API_KEY unset — no email sent.");
    return false;
  }
  const hasPortrait = Boolean(portraitPng?.length);
  const body: Record<string, unknown> = {
    from: FROM,
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

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[waitlist-email] resend failed:", res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}
