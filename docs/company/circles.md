# Circles: "who knows you best" for anyone

*2026-11-06. Built on branch `feat/circles` (C83), not merged and not deployed: it waits for the owner's yes.
It changes who the pilot village is for, and it needs migration 0037 (`~/Desktop/apply_0037.sql`). It is the
product's loop. The research says why (C81, C82), and the debrief (C80) is its moment.*

## Switching it on

1. Merge `feat/circles` (it is based on `feat/who-knows-you-best`).
2. Apply `apply_0037.sql` in the Supabase SQL editor, after `apply_0036.sql`. It is harmless before the code,
   and the code is harmless before it: with circles off, nothing reads the new columns.
3. Set `ECHO_CIRCLES=1` beside `ECHO_PILOT=1`. `ECHO_PILOT_CODE` can stay (the study goes on as its own circle)
   or go (circles alone).
4. Anyone opening `/pilot` can then press "No code? Start a circle for your friends", and send the link it gives.

## What is built, and what is not

- **Built.** All of it is in `apps/web/tests/circles.test.mts` (7 tests) beside the pilot's own (still green):
  - starting a circle, with an 8-character code from 31 letters and digits; the store keeps only its SHA-256;
  - joining by link or code, with the page saying what a code opens before anyone agrees to anything;
  - a yes to play (and to being 18 or older), and, apart from it, an optional yes to research;
  - nicknames unique per circle;
  - the group, ratings and the debrief's crowd, each inside the circle;
  - a circle's own number of visits (3 by default);
  - a debrief that needs no switch outside the study;
  - the owner's export, the study's alone;
  - an erasure that leaves a circle for its friends and clears who started it;
  - rate limits: five new circles a day per address, and sixty code checks per ten minutes;
  - starting a circle for other friends from one's own finished circle;
  - a share card for a circle's debrief: the tally and the way to start a circle, never a choice or a guess
    (the study's debrief has none, so it cannot reach a friend still playing).
- **Not built.**
  - Reporting a nickname through the moderation path.
  - The funnel's numbers (below), beyond what the tables already hold.
  - A per-circle research export (no circle is a research circle today).

## What

Today the pilot village is one group: one owner, one code (`ECHO_PILOT_CODE`), one export. Circles let
anyone start a group:

1. **Starting a circle.** A person starts a circle and gets a link.
2. **Joining.** Friends who open it join with a nickname. Each says what they would do in the six,
   before playing.
3. **Playing.** Everyone plays three short visits, a day apart, in the same village.
4. **Rating.** After each visit, each person guesses what their friends would do.
5. **The debrief.** After the third visit, each person sees who knew them best: their words, their
   friends' median guess, their echo.

Each circle is its own crowd, and the debrief's echo starts from the circle's first visits.

## Why it is the loop

- **Friends do two jobs.** They are the human baseline that makes "your echo knows you better than
  your friends" a measured claim. They are also the acquisition channel: every guess is an invitation.
- **The cadence is built in.** The market map's warning is that friend-guessing apps peak in weeks
  and fade in months unless they have a cadence or a utility. Here the cadence is part of the method:
  the same situations come back on the next visit, and the echo improves with each look.
- **It produces what the business sells.** It yields repeated, consented choices per person, at a cost
  below bought panel sample (docs/company/yc-application.md).

## Data (migration 0037)

- **`circles`:**
  - id;
  - the hash of its join code;
  - created_by, created_at;
  - visits (2 or 3);
  - research (whether this circle's data may be used in research).
- **`pilot_people`** gains `circle_id`, defaulting to the existing study's circle, so nothing moves.
  Nicknames are unique per circle rather than globally.
- **`pilot_ratings`:** rater and ratee must be in the same circle.
- **Export.** It is per circle, and only for research circles: the pilot owner's export stays as it is
  for the study. A person can always download and erase their own data.

## Consent and safety

- **Two yeses.** "Play" is required; "research use" is optional, separate, and has no penalty for
  declining. Only research-consented people appear in any export.
- **Adults only.** There is an age gate at joining.
- **Limits.**
  - Rate limits on joining and rating.
  - Join codes that cannot be guessed.
  - Nicknames reported through the existing moderation path.
- **Out of scope by contract.** No hiring, credit, insurance, education or electoral use of any echo
  (market.md, "regulation as positioning").

## What it measures

- **The funnel:**
  - invites sent per person;
  - the share of invited friends who join;
  - day 1 and day 7 return;
  - third-visit completion;
  - debrief views;
  - circles started from a debrief.
- **The echo's knowledge,** by circle and visit: the looks curve, measured live.

## How it relates to the pre-registered pilot

The pilot runs first, exactly as registered, as its own circle. Circles open after it. Any circle data
used in a paper needs its own registration.

## Effort

About two to three days:
- the migration, with its one-file apply and dry run, as for 0033–0036;
- the store, in both memory and Supabase;
- the route;
- the flow, for starting and joining a circle;
- tests mirroring `pilot.test.mts` (the pilot's tests stay green);
- the debrief per circle.
