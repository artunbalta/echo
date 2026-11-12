# ECHO: founder video and demo

*Drafted 2026-11-12. For the founder to record.*

YC asks for two different things. The **founder video** is one minute of the founder talking. It is
not a demo. The **product demo** is a separate, optional upload.
<!-- brief of 2026-11-12, not a repo file: re-check at ycombinator.com/apply -->

Every label in quotes below is the text on screen today, from `apps/web/src/lib/i18n.ts`,
`apps/web/src/app/page.tsx`, `apps/web/src/app/bench/page.tsx` and
`apps/web/src/components/bench/AuditTool.tsx`. Numbers are sourced at the end.

---

## A. Founder video: one minute, talking points

Talk to the camera. Do not read. Four beats.

**1. Who I am (about 10 seconds)**

- Artun Balta. Student at Imperial College London. Solo founder.
- **[founder: your course and year, in five words]**

**2. What I built, alone (about 15 seconds)**

- A village in the browser. Small things happen in it, and each is a published psychology
  experiment: a lost purse, a fallen old man, children asking you to lie.
- Before each one, an AI seals a guess about what you will do. Afterwards you open the envelopes. A
  friend can try to beat it.
- A tool that audits the AI twins companies sell, on their own data, in their browser.
- All of it since June. <!-- git log: first commit 2026-06-15 -->

**3. The one thing I know (about 20 seconds)**

- There is one public dataset with released AI twins of real people: 13 twins, about two thousand
  people.
- All 13 predict an individual worse than guessing what the crowd would say.
- Give each twin one earlier answer from the person, and every one rises above the person's own
  retest.
- So the knowledge is in what a person does, seen more than once. Panels ask once. A world people
  come back to sees them again.

**4. What I want (about 10 seconds)**

- Say the truth first: no users yet, no revenue.
- Then the next twelve weeks: the first audits run on a vendor's own panel, the pilot with twenty
  people, the friend loop opened.
- **[founder: the ask, in your own words. Why YC, why now.]**

**Do not say**

- "First", "only", "pre-registered", "the standard", "independent".
- The journal's name.
- Anything that suggests Simile, Aaru or any other vendor was tested. Only the dataset authors'
  released twins were.
- That twins are wrong in general. The finding is about individuals, not population averages.

---

## B. Product demo: two minutes or less

### Before recording

- **Deploy first.** The demo needs `feat/echo-calls-it` live. **[founder: or record on localhost and
  say so.]**
- **Two windows.** One for you. One private window for the friend's side.
- **Walk once the day before, in the same browser.** The envelopes are kept in that browser. On the
  second walk the echo has seen you, and the panel can show its line about first meetings against
  moments it had seen you at before. On a first walk that line appears only if one kind of moment
  has come round twice.
- **Meet at least three moments before opening.** The friend link needs three opened envelopes.
  With fewer the page says "Open at least three first." Film more and cut down to two.
- **Use a desktop.** The `O` key is the desktop way in. On a phone it is the small envelope under the
  meter.
- **Cut the loading and the walking.** Keep each shot to what the voice-over says.
- **Record what happens.** If the echo does badly, say so: it has only just met you, and the page
  says the same ("Its first time at this: a coin's guess."). Do not retake for a better score.

### Shot list

| # | Time | On screen | Click or key | Voice-over (one sentence) |
|---|---|---|---|---|
| 1 | 0:00–0:07 | The landing, `/`. "A world that learns you." | Click **Walk in ›** | "This is ECHO: the first button walks you into a village, with no account." |
| 2 | 0:07–0:14 | The village loads. A card: "Your echo can learn from how you move here." | Click **Let it watch** | "It asks one thing first: may my echo watch what I do." |
| 3 | 0:14–0:27 | Walking. A first moment, for example the purse in the grass. A prompt names it and its verbs. | **W A S D** to walk. **E** for the first verb, **2** for the second. Or walk past. | "Small things happen as I walk, and this one is a published honesty experiment, with two coins in the purse or nine." |
| 4 | 0:27–0:40 | A second moment, for example someone greeting you or an old man who has slipped. The small envelope under the meter shows a count. | Act, or walk on. | "Before each one, my echo sealed a guess about what I would do, and nothing on screen told me." |
| 5 | 0:40–0:50 | The panel "What your echo sealed". Rows with "It said" and "You". | Press **O** | "I open the envelopes: what it said, and what I did." |
| 6 | 0:50–1:02 | The count: "… of … right. A guess that knows nothing would expect about …". Under it: "Its first time at a moment: … Where it had seen you before: …". | Scroll the panel | "It counts how many it got right, what a guess that knows nothing would expect, and how it does where it has seen me before." |
| 7 | 1:02–1:12 | The field "Your name, for the link" and the button. Then the note "Link copied. Whoever opens it guesses what you did, then sees." | Type your name. Click **Let a friend guess you** | "One button makes a link for a friend, and the moments travel inside the link, so no server is involved." |
| 8 | 1:12–1:28 | The private window, `/guess#…`. "What did Artun do?" Then one question per moment. Then "You knew Artun: … of …. Their echo: … of …." | Paste the link. Click **Begin**. Click one answer per moment. | "My friend guesses what I did, sees their score beside my echo's, and can walk in themselves." |
| 9 | 1:28–1:40 | `/bench`. The headline: "Every published AI twin we audited knows less about a person than a guess that knows nobody." | Open `/bench` (the landing's nav says **Evidence**) | "The same measure works on the AI twins that companies sell: we audited the 13 released with a public dataset, and all 13 predicted a person worse than a guess that knows nobody." |
| 10 | 1:40–1:50 | The chart "13 twins, one axis: the crowd is zero". Bars to the left of the line, dots to the right. | Scroll to the chart | "Given one earlier answer from each person, every one of them rose above the person's own retest." |
| 11 | 1:50–2:00 | `/audit`. After the click, the same chart with the banner "Synthetic panel." | Click **Audit your own twins ›**, then **Try it on a synthetic panel** | "Any team can run this audit on its own files in the browser with nothing uploaded, and this run uses a synthetic panel." |

**Optional extra shots, if a cut runs short**

- In the envelopes panel, click **Check the seals**. The note reads "All … seals are whole: nothing
  was changed after it was written." One sentence: "Each seal carries the one before it, so a guess
  cannot be changed after the fact."
- In the envelopes panel, click **Say what I would do**, answer the six lines, click **Seal my
  words**. One sentence: "I can go first, and then my own words are scored against my echo on the
  same moments."

---

## C. Thirty-second version

| # | Time | On screen | Click or key | Voice-over |
|---|---|---|---|---|
| 1 | 0:00–0:06 | The landing | Click **Walk in ›**, then **Let it watch** | "ECHO is a village where an AI learns to predict one person: you." |
| 2 | 0:06–0:14 | One moment, for example the purse | **E**, or walk past | "Before each small thing that happens, it seals a guess about what you will do." |
| 3 | 0:14–0:22 | The envelopes panel and its count, then the button | Press **O**, then click **Let a friend guess you** | "Then you open the envelopes, and a friend can try to beat it." |
| 4 | 0:22–0:30 | `/bench`, the chart of 13 twins | Scroll to the chart | "The same measure audits AI twins: on a public dataset, all 13 released twins scored below a guess that knows nobody." |

---

## Sources

| What is said | Where it comes from |
|---|---|
| 13 twins, 2,058 people ("about two thousand") | `research/deeds/runs/twin2k-audit.json`: `twins`, `people` |
| All 13 below the crowd | same file: every `twins.*.vs_crowd_ci95` upper bound is below zero |
| Every twin above the retest with one earlier answer | same file: `twins.*.with_one_look` against `twins.*.retest` |
| Two coins or nine | `packages/planet/lib/moments.ts`: `lost-purse` arms |
| Three opened envelopes for a friend link | `apps/web/src/lib/knowable/guessLink.ts`: `GUESS_MIN` |
| Keys: W A S D, E, 2, O | `apps/web/src/lib/i18n.ts` `controls.desk`; `components/world/Interact.tsx`; `components/world/Envelopes.tsx` |
| Since June | `git log`: first commit 2026-06-15 |
| Twenty people in the pilot | `docs/company/pilot-launch.md` |
