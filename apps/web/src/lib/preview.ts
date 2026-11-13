/**
 * The ten-second look (DECISIONS C97): how long a visitor without a turn may walk the village before
 * the waitlist is put in front of them.
 *
 * WHY THERE IS ONE. The village opens in turns now, and the page that says so asks for a name and an
 * email. A stranger asked to wait for a thing they have not seen has no reason to. So anyone may walk
 * in and look, for this long, and then the same short form stands where the village was.
 *
 * WHAT A LOOK IS NOT. It is not a visit: the question about being watched is never asked, so for
 * someone who has never said yes nothing is measured, nothing is sealed, no identity is made and
 * nothing is kept (`ParcelCanvas`'s `preview`).
 *
 * Who is given a look and who the whole village is the server's to say, once, in `lib/previewPass.ts`.
 * This file is the number alone, so the landing can say it without carrying the server's half.
 */
export const PREVIEW_SECONDS = 10;
export const PREVIEW_MS = PREVIEW_SECONDS * 1000;
