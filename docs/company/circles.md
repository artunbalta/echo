# Circles: "who knows you best" for anyone (proposal; not built)

*2026-11-06. This needs the owner's yes. It needs a migration, and it changes who the pilot village is
for. It is the product's loop. The research says why (C81), and the debrief (C80) is its moment.*

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
