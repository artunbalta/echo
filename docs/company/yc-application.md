# ECHO: YC application

*Working draft, revised 2026-11-12. First draft 2026-11-06. For the founder to edit before sending.*

**How to read this draft**

- Each number is followed by an HTML comment naming the file and key it came from. "Sources" at the
  end gives the full paths.
- **[founder: …]** marks what only the founder can write or confirm.
- **Timing.** The W27 on-time deadline was 2 November 2026 and has passed. YC accepts late
  applications and makes no promise on when it reads them.
  <!-- brief of 2026-11-12, not a repo file: re-check at ycombinator.com/apply before sending -->

> **What changed since 6 Nov**
>
> - **The village has moments.** 41 kinds of small event now happen around a visitor. 30 of them were
>   added as published psychology experiments, with their arms kept (C86, C87, 9–10 Nov).
>   <!-- packages/planet/lib/moments.ts: MomentKind; docs/DECISIONS.md C87 "Thirty new moments" -->
> - **The echo says what it expects before you act.** It seals a call before each moment. You open
>   the envelopes afterwards (C89, 12 Nov).
> - **A friend can guess you.** One button makes a link. No server is involved (C89).
> - **The landing opens the world.** The first button is "Walk in". It used to ask for a waitlist
>   email for a world that was already open (C89).
> - **The twin audit is a product.** `/bench` shows the result, `/audit` runs it on anyone's files in
>   their browser, and `POST /api/v1/audit` does the same as one request (C90, 12 Nov).
> - **A twin from your own words, held against your echo.** A visitor may type a paragraph about
>   themselves. A language model builds a twin from it, the way the audited products are built, and its
>   calls are sealed beside the echo's and opened with them. Off on a deployment until switched on,
>   because every press is a paid call (C93).
> - **The way in is counted, and a crowd can form.** A number per day for each step from the landing
>   to a friend's link, with no ids (C92). And, switched off until the founder says yes, a count of what
>   people do at each moment, so the next echo starts from the crowd (C91).
> - **The paper is under review** at a journal (Studies 1–2c).
> - **Claims corrected.** This revision drops "pre-registered", "first evidence" and "the audit
>   standard", and names who proposed the floor-and-ceiling measure before us.
>
> **Before sending.** The 12 Nov work is on branch `feat/echo-calls-it`. It is not merged or deployed.
> **[founder: deploy, then open `/`, `/bench`, `/audit` and one `/guess` link on
> echovirtualworld.com. Confirm that github.com/artunbalta/echo is public: this draft and `/bench`
> both say the code and the plans are.]**

---

## 1. Describe what your company does in 50 characters or less

**AI twins of people, built from what they do** (43)

Alternates: "Twins of people, built from what they do" (40). "AI twins built from what people do" (34).

## 2. What is your company going to make?

ECHO is a village in the browser where an AI learns to predict one person: you.

Small things happen as you walk. A purse lies in the grass, with two coins in it or nine. An old man
has slipped and cannot get up, with people standing by or with nobody. Children ask you to lie about
a throw. Fishers insist the wrong boat is the longer one. Each is a published psychology experiment
set as village life.
<!-- packages/planet/lib/moments.ts: lost-purse (coins 2 / 9), fallen-elder (onlookers 0 / 2), knucklebones, asch-boats -->

Before each one, your **echo** writes down what it thinks you will do and seals it. You open the
envelopes when you like. Then a friend tries to beat it.

**What can be clicked** (once the branch is deployed):

| Where | What happens |
|---|---|
| `/` → **Walk in** | A stranger lands in Drurnscree, a fishing village with people in it. No account. One question first: may your echo watch. |
| In the village, key **O** | The envelopes open. What the echo said. What you did. How many it got right. What a guess that knows nothing would expect. How it did on first meetings against moments it had seen you at before. |
| Same panel, **Say what I would do** | Six lines about yourself. From then on your words are sealed beside the echo's calls and scored on the same moments. |
| **Let a friend guess you** → `/guess` | A link that carries three to eight of your moments. Your friend guesses what you did, sees their score beside your echo's, and is invited to walk in. |
| `/bench` | The result of our twin audit on the 13 AI twins released with the public dataset Twin-2K-500. |
| `/audit` | The same audit on anyone's CSV files, run in their browser. Also `POST /api/v1/audit`. |

<!-- apps/web/src/app/page.tsx (Walk in); lib/openVillage.ts (Drurnscree); components/world/Envelopes.tsx; lib/i18n.ts env.*; lib/knowable/guessLink.ts: GUESS_MIN 3, GUESS_MAX 8; app/bench/page.tsx; app/audit/page.tsx; app/api/v1/audit/route.ts -->

The envelopes, the six lines and the friend link never go to a server. The calls are chained with
SHA-256 and kept in the visitor's own browser. The link carries its moments after the `#`, the part
of an address a browser does not send. So this loop needs no account and no backend.
<!-- lib/knowable/seal.ts; envelopes.ts; guessLink.ts -->

**Who pays.** Teams that build or buy AI twins of people ("digital twins", synthetic respondents).
In the order we can deliver:

1. **A twin audit.** What their twins know about individuals, on their own panel.
2. **Echo studies.** Their question staged as a village moment for consented adult players, met more
   than once.
3. **An echo layer.** Their twins, read through one or more earlier observations of each person.

Nobody has paid yet.

**What players get.** A question worth five minutes, and a reason to come back: who knows you best,
you, a friend, or something that watched you walk?

## 3. Why now

- **Money has arrived for AI twins of people.**
  - Simile has raised about $300M in total. Its Series B valued it at $2B (July 2026).
  - Aaru sold equity at a $1B headline price, with its lead's main tranche at $450M.
  - Salesforce closed its purchase of Listen Labs on 2 November 2026, at a reported $2B or so.
  <!-- docs/company/market.md, summary paragraph and "simulation leaders" table -->
- **Each vendor grades its own accuracy, on a metric it chose.** One industry newsletter put it this
  way: "Every accuracy figure is a self-graded exam." <!-- market.md: Trends.vc, 3 Sep 2026 -->
- **Tests by others in 2026 point at the individual.**
  - Peng, Toubia and co-authors: twins correlate with their humans at about 0.2, across 164 outcomes.
  - Pew: twins of its panel members were off by 12.4 points on average.
  - Prolific: giving a model demographic personas roughly tripled the distributional error.
  <!-- market.md: "Independent tests find twins compress variance and miss subgroups" -->
- **A way to score twins fairly now exists in print.** Netzer and Sambandam (September 2026) proposed
  scoring a twin between a floor and a ceiling. A separate body, the Synthetic Data Standard (SDX-1),
  has begun certifying methods. We expect buyers to ask the individual-level question next. We looked
  for a public place to answer it on your own data, and found none.
  <!-- apps/web/src/app/bench/page.tsx "Whose idea the measure is" (arXiv:2609.13995); SDX-1 is from the brief of 2026-11-12, not a repo file -->
- **The leaders say behaviour is next.** Simile's CEO lists "lab or virtual experiments with real
  stakes" among its data sources: "That's ultimately what makes it behavioral." We found no company
  with a world built to produce such observations again and again. <!-- market.md: Latent Space, Aug 2026 -->
- **YC has funded about ten people-simulation startups.** None of the 107 items in its Requests for
  Startups names this space, and we do not claim RFS fit. <!-- market.md: "YC: about ten simulation startups funded, none requested" -->

## 4. How far along are you?

**Built, by one person, since June 2026.** <!-- git log: first commit 2026-06-15; 281 commits on this branch -->

- **The world.** A procedural planet in 3D in the browser, with 284,004 cells of which 28,305 hold a
  village, generational villagers, multiplayer, and an ML service that keeps a Bayesian model of each
  consenting player. <!-- apps/web/src/lib/openVillage.ts: 284,004 cells; apps/web/public/planet/villages-echo-capacity-1.json: 28,305 cells -->
- **The moments.** 41 kinds, in three streams, so that something is nearly always in reach. In our
  own test (a bot playing a 25-minute visit), something worth doing was near 92% of the time, and the
  longest empty stretch was 24 seconds. <!-- docs/DECISIONS.md C87 "Measured" table -->
- **The envelopes, the six lines and the friend link** (section 2). Built and tested on the branch,
  and played end to end by a bot on a production build with no server secret set, which is the live
  site's state today. A second reader then reviewed the night's code against what it promises; two
  promises were not kept (an erasure the next moment undid, and outcomes landing on the wrong
  envelope after a raft crossing) and both are fixed and tested (C94).
  <!-- docs/DECISIONS.md C89 "Seen in the browser", C94; apps/web/tests/{calls,envelopes,keeper}.test.mts, tests/e2e/envelopes.spec.ts -->
- **The twin audit.** A Python script (`research/deeds/audit.py`), a TypeScript port that runs in
  the browser, and a stateless API. A test holds the port to the Python: every point estimate agrees
  to 1e-9. API limits: 4 MB, 5,000 people, 400 items, 20 twins.
  <!-- apps/web/src/lib/knowable/audit.ts header; tests/knowable.test.mts; lib/knowable/api.ts AUDIT_LIMITS -->
- **The research.** Four public datasets analysed, with analysis plans committed before each
  analysis, in a public repository. A theory with closed forms. A leak-tested pipeline: six planted
  leaks, all caught. The paper (Studies 1–2c) is under review at a journal.
  <!-- research/deeds/PREREG*.md; research/deeds/README.md "six planted leaks" -->
- **The pilot village (Study 3).** Six classic decision paradigms, friends' guesses, two or three
  visits, a debrief, the owner's export and the analysis. Built. Not run.
- **Circles and groups.** Anyone can start a "who knows you best" group for their friends. Built and
  tested, switched off. <!-- docs/company/circles.md -->

**Not yet.**

- **Users: none.**
- **Revenue: none.** Nobody has been asked to pay.
- **Production records nothing.** The server secrets, the database migrations and the ML service are
  not provisioned on the live site. The envelope loop was designed to work without them. The pilot
  and the groups were not: they wait for the deploy.
  <!-- components/world/Envelopes.tsx header "works whether or not the engine, the store or anything else behind the page is up"; docs/DECISIONS.md C87 "Production could not write"; docs/company/pilot-launch.md step 1 -->
- **The pilot has not run.** Study 3 will be reported only from real participants.
- **The paper is not accepted.** It is under review.

**How long have you been working on this?** The first commit is 15 June 2026.
**[founder: how much of that was full-time, alongside Imperial]**

**Tech stack.** TypeScript, Next.js 15, React 18, three.js with React Three Fiber, Colyseus for
multiplayer, Supabase Postgres (39 migrations), a Python ML service, Vercel.
<!-- apps/web/package.json; db/migrations; services/ml; vercel.json -->

**Are people using your product?** No. **Do you have revenue?** No.

## 5. What do you understand that others don't?

**On the one public dataset with released AI twins, the twins built from what people say knew less
about an individual than a guess that knows nobody. One earlier look at what the person did knew
more than half of what can be known.**

We measured this on four public datasets. Analysis plans were committed before each analysis.

1. **Twin-2K-500** (2,058 people; 13 AI twins released by the dataset's authors: GPT-4.1,
   GPT-4.1-mini, Gemini 2.5 Flash and a fine-tuned GPT-4.1-mini).
   - **The crowd beats every twin.** Guess the median answer of everyone else, which knows nobody.
     That guess is more accurate than all 13 twins, by 3.6 to 8.2 points. Each of the 13 intervals
     is wholly below zero. <!-- twin2k-audit.json: twins.*.vs_crowd (−0.0355 to −0.0820), vs_crowd_ci95 -->
   - **The twins barely tell people apart.** Their individual-level r runs from .04 to .08 (.07 for
     the authors' headline twin). One earlier answer by the same person reaches r = .49. A model
     given the whole persona, plus the person's answers to the other 16 tasks, reaches .15, and loses
     to that one answer on all 17 tasks.
     <!-- twin2k-audit.json: twins.*.r (0.039 to 0.085); facts.json: t1.llm_headline.r 0.074, t1.again.r 0.486, t1.persona_others.r 0.151, t1.H3.wins 17 of t1.H3.of 17; research/deeds/PREREG.md H3 -->
   - **One look lifts every twin.** Read through one earlier answer per person, all 13 twins rise
     from between −77% and −33% of the knowable to between 54% and 58%.
     <!-- twin2k-audit.json: twins.*.knows (−0.766 to −0.331), knows_with_one_look (0.535 to 0.585) -->
   - **The echo beats the person's own retest:** 0.822 against 0.817. The difference is 0.0045, with a
     95% interval of 0.0031 to 0.0060. In the authors' own direction (predicting the first waves from
     the fourth) the planned echo's margin shrinks to 0.0005.
     <!-- facts.json: t1.echo.acc 0.8218, t1.again.acc 0.8173, t1.H4.delta/lo/hi, t1.pub.H4.delta -->
2. **With real money at stake** (Basel–Berlin Risk Study; 7 incentivised tasks, 169 to 171 people).
   On all 5 tasks that are less than half steady, copying a person's own past behaviour does worse
   than knowing nobody. The echo, reading the same single observation, beats copying on 7 of 7.
   <!-- facts.json: t2.tasks, t2.n_min, t2.n_max, t2.low.n, t2.low.copy_negative, t2.echo_beats_copy -->
3. **Across 138 behavioural measures** (Self-Regulation Ontology). What people say about themselves
   knows .005 of what they do. The echo beats copying on 135 of 138.
   <!-- facts.json: t3.deeds.n, t3.deeds.mean.words 0.0050, t3.deeds.echo_beats -->
4. **On two million browsers seen again and again** (the Moral Machine; 31.5 million dilemmas).
   - Copying a past visit scores 2ρ − 1 and one look scores ρ², in 6 of 6 kinds of dilemma.
   - One visit knows more than the person's whole survey (age, gender, education, income, politics,
     religion, country), in 6 of 6.
   - From pairs of visits alone, the theory forecasts how well a person is known after one, two and
     three visits. All 18 forecasts fall inside the measured 95% intervals. For humans over pets:
     .096 → .147 → .178 forecast, .097 → .148 → .178 measured. This last analysis was added after
     the plan, and we say so wherever we show it.
   <!-- facts.json: t4.dilemmas 31,517,766; t4.people 2,093,956; t4.m2.holds 6; t4.m3.beats 6; t4.x3.inside 18 of t4.x3.points 18; t4.x3.species.pred1-3, obs1-3; apps/web/src/app/bench/page.tsx "added after the analysis plan" -->

**The theory, in three lines.** Let ρ be how steady a person's answer is in a situation.

- Copying their last answer scores 2ρ − 1. Below ρ = ½ that is worse than knowing nobody.
- One look, read against the crowd, scores ρ².
- Nobody can know more than ρ. That is the ceiling.

<!-- apps/web/src/lib/knowable/theory.ts; research/deeds/deeds/theory.py -->

**What is ours, and what is not.**

- *Not ours.* Scoring a twin between a floor and a ceiling. Netzer and Sambandam (arXiv:2609.13995,
  September 2026) propose it, with the modal answer as the floor and the retest as the ceiling. Park
  et al. (arXiv:2411.10109) and Toubia et al. (arXiv:2505.17479) normalise by the retest only.
- *Not ours either.* The observation that simple baselines match or beat LLM twins on individuals.
  Peng, Toubia et al. (arXiv:2509.19088), Chen, Zhu and Zheng (arXiv:2607.26348) and Prolific's
  2026 study report it too.
- *Ours.*
  1. **A ceiling derived from each item's reliability:** the best any guess could score if it knew
     the person exactly, but not the day. Under it, a person's own retest sits at 52% of the
     knowable, not at the top. <!-- facts.json: t1.know.again 0.522 -->
  2. **The looks curve:** closed forms for what each further observation is worth, confirmed on the
     four datasets above.
  3. **A world that produces repeated looks as play.**

<!-- citations: apps/web/src/app/bench/page.tsx "Whose idea the measure is" and "Who came before"; Prolific: docs/company/market.md -->

**What the finding does not say.** It is about knowing individuals. It says nothing against a twin
panel's accuracy on population averages, which is what most vendors report. We measured the twins
the dataset's authors released. We have not measured any vendor's product. And we have a stake: ECHO
builds twins from observed behaviour. The code and the plans are public so that anyone can rerun it.

**Why it matters for a business.** The scarce input is repeated observation in the situation you
care about. Panels ask once. Interviews ask once. Asking again costs money and patience. A world
people come back to collects it as play, with consent.

## 6. Who are your competitors, and what do you fear?

| Twins built from | Synthetic populations | One-to-one twins (B2B) | Twins the person and friends see |
|---|---|---|---|
| LLM priors and demographics | Ask Rally, Synthetic Users, Evidenza | | companion apps |
| What people **say** | Electric Twin, Qualtrics | **Simile**, Semilattice, YouGov Parallax, Toluna, Ipsos | Delphi, Tavus ("talk to my twin") |
| What people **do** in the wild | **Aaru**, NIQ BASES, Artificial Societies | Simile's stated next step | Haven |
| What people **do** in a designed world | Project Sid (no real people) | we found none; ECHO builds here | we found none; ECHO builds here |

<!-- docs/company/market.md: "Where a behaviour-grounded twin company would fit" -->

**The label is taken, the method is not.** Aaru, NIQ, YouGov and Salesforce already call their twins
"behaviour-grounded". They mean transactions or panel histories. We mean situations designed to come
back, a measured ceiling for every echo, and the person's friends as the human baseline. We found no
product in which a person, their friends and their twin compete to predict the person.

**What we fear, in order.**

1. **Simile.** A strong team, about $300M, twins of consenting individuals, and a stated move to
   real-stakes experiments. If Simile builds repeated observation into its panels, it has
   distribution we do not.
2. **Panel owners doing it themselves.** Our own result tells them how: one earlier answer per
   person lifts any twin. YouGov already checks its twins against live panellists in 30 minutes.
   A firm with a panel can ask again. What it cannot easily do is watch what people do in a
   situation, many times, without paying and tiring them. That is our bet on the world.
   <!-- market.md: YouGov Parallax -->
3. **The measure becoming common property.** It mostly is already (section 5). Others are certifying
   methods; we do not certify anything. The audit starts conversations. It is not the moat.
4. **The consumer loop fading.** Friend-guessing apps peak within weeks and fade within months. Ours
   has a cadence inside the method: the same moments come back, and the echo is better the second
   time. Whether that holds people is unmeasured. <!-- market.md: "Virality" section -->

**Our answers.**

1. **The world** makes repeated observation cheap and wanted. For a panel it is expensive and
   resented.
2. **The theory** says how many looks a situation needs, before anyone is recruited.
3. **The echo layer composes.** Read through one earlier answer, the dataset's headline twin goes
   from 0.724 to 0.822. We can be a twin company's supplier before we are its rival.
   <!-- twin2k-audit.json: "Text Persona - GPT4.1-mini" accuracy 0.7237, with_one_look 0.8219 -->

<!-- naming: call it "the twin audit". Per the brief, another insights firm already uses an ECHO-named index, so no "index" or "bench" product names. -->

## 7. How do or will you make money?

1. **Twin audits.** The first sale, and cheap to deliver. The tool is free and runs in the buyer's
   browser. The paid version is the audit run with us on a private panel, a written report, and the
   one-look layer fitted to their twins. **[founder: price. The repo has none.]**
2. **Echo studies.** A team brings a situation it cares about: a price, an offer, a message. We set
   it in the village for consented adult players, more than once. They get what each person did, how
   steady it was, and how much of the knowable each echo knows. Priced per study, like a panel
   study. **[founder: price]**
3. **The echo layer (API).** A twin company's twins and their panellists' repeated observations go
   in. Individual predictions come out.

**How much could you make?** **[founder: a bottom-up number: audits per year × price, plus studies.
Nothing in the repo supports one yet.]** What the market map supports:

- Market research proper was US$56bn in 2024. The "US$165bn insights industry" figure includes
  software.
- Full-service research and fieldwork is about US$35bn of that.
- Online sample is a strained US$1–3bn. Cint's net sales fell 9.5% in 2025 and it was taken
  private. Dynata went through Chapter 11 in 2024.
- Self-serve synthetic tools charge from $20 to $1,799 or more a month. That is the price a
  free-tool-first audit competes with.
- The exit on record: Salesforce bought Listen Labs for a reported $2B or so, about 67 times revenue.

<!-- docs/company/market.md: "Market sizes" table and text; Listen Labs row -->

**The consumer side is free, and it is the engine.** Its job is to produce consented, repeated
choices per person at a cost below bought panel sample. That cost is unmeasured.

## 8. How do users find you?

**Players.**

- **The friend link.** Every set of opened envelopes offers "Let a friend guess you". The friend's
  page ends on "Let an echo watch you". Friends are the human baseline the research needs, and they
  are also how a second person arrives.
- **Circles.** A group of friends, three short visits a day apart, and a debrief of who knew each
  person best. Built, switched off. <!-- docs/company/circles.md -->
- **Counted, once the database has migration 0041:** how many page loads reach each step of the way
  in (the landing, "Walk in", arriving, yes or no to being watched, a first moment, envelopes opened,
  a friend's link made, a friend's page opened and finished, the friend walking in). A number per day
  per step, with no id of any kind (C92). <!-- apps/web/src/lib/steps.ts STEPS; db/migrations/0041_steps.sql -->
- **Not measured yet:** return visits, and what one invite is worth. Nothing that could say who came
  back is kept, by design. **[founder: decide whether to count returns, and how, without breaking
  "kept in this browser only".]**
- **Built and switched off:** the village's count (C91). With a visitor's yes to a sentence that
  names it, what they did at each moment is added, with no name, to a count of what people do there.
  The next visitor's echo then starts from the crowd, and is held against it. Every visit would make
  the next echo's first guess better. **[founder: your yes, and the words.]**
  <!-- apps/web/src/lib/knowable/crowd.ts; db/migrations/0040_open_moments.sql; ECHO_OPEN_CROWD -->

**Buyers.**

- **The public result at `/bench`,** with its limits stated on the page.
- **The tool at `/audit`.** A vendor can check their own twins without sending us anything.
- **Direct email** to ten teams named in the market map: five that build twins, three that study
  them, two that buy research. Drafts are in `docs/company/outreach.md`.
- **The paper,** when it is out. **[founder: preprint or not, given the journal's policy]**

## 9. The next twelve weeks

1. **Weeks 0–1: deploy.** Merge `feat/echo-calls-it`. Provision production: secrets, migrations, the
   ML service. Add a consented count of visits, envelopes opened and links made.
2. **Weeks 1–3: ten audit offers.** Send the drafts in `outreach.md`. Goal: two audits run on someone
   else's panel, by them or with us. **[founder: confirm goal]**
3. **Weeks 2–6: the pilot (Study 3).** 20 people, three visits each, a day apart. It stops at 20
   people or four weeks, whichever comes first. It measures who comes back, and what the echo knows
   by the third visit. It also measures one of the stabilities the envelope predictor now assumes:
   how consistent a person is across moments of one family.
   <!-- docs/company/pilot-launch.md: 20 people or 4 weeks; apps/web/src/lib/knowable/calls.ts header -->
4. **Weeks 3–8: open the friend loop.** The friend link first, then circles. Measure invites per
   player and second visits. **[founder: target; the 6 Nov draft said 1,000 players]**
5. **Weeks 4–12: first money.** One paid audit and one echo study with a design partner.
   **[founder: who]**
6. **By week 12: one link to the world outside.** Tie one in-village choice to one behaviour outside
   the game, for a consented subsample. **[founder: which behaviour]**

## 10. Weakest points today

- **No users.** Nobody outside has walked in.
- **No revenue,** and no buyer has been asked.
- **Solo founder,** and a student. <!-- brief of 2026-11-12: YC says it regularly funds solo founders; not a repo file -->
- **Production is not provisioned.** The live site records nothing. The new loop runs without a
  backend; the pilot and the groups do not.
- **Choices in the village are not yet linked to behaviour outside it.** The best published link
  between a game and the real world is about r = 0.5, on 49 people, for navigation skill.
  <!-- docs/company/market.md: Sea Hero Quest, Coutrot et al. 2019 -->
- **The envelope predictor's stabilities are assumed, not measured.** 0.6 for the same moment again,
  one half within a family of moments, one third anywhere. The pilot will measure the family one.
  <!-- apps/web/src/lib/knowable/calls.ts: STABILITY -->
- **The echo in the envelopes knows no crowd yet.** It learns from the visitor alone, so its first
  call at any moment is a coin's guess, and it says so. <!-- calls.ts header "There is no crowd yet" -->
- **The seals show a record is whole, not when it was written.** They live in the visitor's
  browser. A time nobody could fake needs a server witness, which is not built. <!-- lib/knowable/seal.ts header -->
- **One dataset's released twins have been audited.** No vendor's product has.
- **The research is not peer-reviewed yet,** and the plans were committed in our own repository, not
  with a registry.
- **Our players will not be the population a buyer needs.** Volunteer game samples skew young, male
  and educated. <!-- docs/company/market.md: objection 3 -->

## 11. Founder questions

**[founder]** These are yours. Each has a prompt and what the repo supports.

- **Founder video (1 minute).** Founders talking, not a demo. A demo is a separate, optional upload.
  Talking points and a shot list are in `docs/company/demo-script.md`.
  <!-- brief of 2026-11-12, not a repo file -->
- **Who writes code? Any non-founder code?** You, all of it. The history is 281 commits, all under
  your name. <!-- git shortlog -->
- **Are you looking for a cofounder?** [founder: yes or no, and why. YC says it regularly funds solo
  founders, and that about 40% of a batch are pre-product.] <!-- brief of 2026-11-12, not a repo file -->
- **Where do you live, and where would the company be based after YC?** [founder: where you live
  now (you study at Imperial College London), and where after.]
- **Are you committed full-time? What happens to your degree?** [founder: say it plainly. The 6 Nov
  draft mentioned PhD applications planned for December 2027. YC will read that as a hedge. Keep it
  only if it is true and you can explain it.]
- **Why did you pick this idea? Do you have domain expertise?** [founder: one true paragraph. The
  repo supports: you built the world, the engine and the research pipeline alone, and wrote the
  paper.]
- **The most impressive thing you have built or achieved, other than this.** [founder]
- **A time you hacked a non-computer system to your advantage.** [founder]
- **What convinced you to apply? Did someone encourage you?** [founder. Do not claim a Request for
  Startups: none names this space.]
- **Legal entity, equity, money raised, money spent.** [founder]
- **Other ideas you considered.** [founder]

## Sources

**Research numbers**

- `research/deeds/runs/twin2k-audit.json`: the 13 twins. `people`, `items`, `groups`; per twin
  `accuracy`, `crowd`, `vs_crowd`, `vs_crowd_ci95`, `r`, `with_one_look`, `knows`,
  `knows_with_one_look`.
- `research/deeds/runs/facts.json`: `t1.*` Twin-2K-500, `t2.*` Basel–Berlin, `t3.*` Self-Regulation
  Ontology, `t4.*` Moral Machine. Keys are named beside each number above.
- `research/deeds/PREREG.md`, `PREREG-BBRS.md`, `PREREG-SRO.md`, `PREREG-MM.md`: the analysis plans.
- `research/deeds/README.md`: the leak tests.

**Product**

- `apps/web/src/lib/knowable/calls.ts`, `seal.ts`, `envelopes.ts`, `guessLink.ts`: the calls, the
  seals, the record, the friend link.
- `apps/web/src/components/world/Envelopes.tsx`, `apps/web/src/components/guess/GuessClient.tsx`,
  `apps/web/src/lib/i18n.ts`: what the visitor and the friend see, and every label quoted here.
- `apps/web/src/app/page.tsx`, `apps/web/src/app/_landing/HowItGoes.tsx`,
  `apps/web/src/lib/openVillage.ts`: the landing and the open village.
- `apps/web/src/app/bench/page.tsx`, `apps/web/src/app/audit/page.tsx`,
  `apps/web/src/components/bench/AuditTool.tsx`, `apps/web/src/lib/knowable/audit.ts`, `api.ts`,
  `apps/web/src/app/api/v1/audit/route.ts`, `apps/web/tests/knowable.test.mts`: the twin audit.
- `packages/planet/lib/moments.ts`: the 41 kinds of moment and their paradigms.
- `docs/DECISIONS.md` (C86–C88): the moments, and how the village was measured.

**Market and company**

- `docs/company/market.md`: every market, funding and competitor figure, each with its own source
  and confidence label.
- `docs/company/circles.md`, `docs/company/pilot-launch.md`: circles and the pilot.

**Not in the repo** (from the brief of 2026-11-12; re-check each before sending)

- YC: the 2 November deadline, late applications, the one-minute founder video, solo founders, the
  40% pre-product figure.
- The Synthetic Data Standard (SDX-1), and the other firm's ECHO-named index.
