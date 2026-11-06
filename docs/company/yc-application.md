# ECHO: YC application, working draft

*Drafted 2026-11-06.*

- **Research numbers** come from `research/deeds/runs/facts.json`; the full study is the paper,
  `research/paper/draft.md`.
- **Market numbers** come from `docs/company/market.md`, which gives a source and a confidence label for
  each.
- **[founder]** marks what only the founder can write.

**What changed since the October scorecard.** In the founder's own October scorecard, ECHO scored
61/110. Its weakest marks were traction 3, willingness to pay 3, YC fit 4, competition 4 and moat 5. This
draft answers those, in that order of difficulty, with what has been found since.

---

## The one line (≤ 50 characters)

**AI twins that know people by watching them** (42)

## What is your company going to make?

ECHO is a multiplayer world in the browser where people meet the same kinds of situations again and
again. A stranger asks for bread. A fisher offers a bet on the tide. Someone wants to borrow your raft.

From how each person chooses, ECHO learns an **echo** of them: a model that predicts what that person
will do next time, and says how much of what can be known about them it knows.

**Who pays.** We sell the *ground truth* that AI twins lack: repeated, consented choices by real people,
and echoes that are checked against what the same people did later. Research teams and twin companies
pay for:
- echo studies;
- an echo layer that upgrades their twins;
- audits that say what a twin knows about individuals.

**What players get.** Players get the reason to come back: *who knows you best: you, your friends, or
your echo?*

## What do you understand that others don't?

**Twins built from what people say don't know individuals, and better language models won't fix it,
because the information is not in what people say.** This has been shown on public data, in three
studies we registered before running them.

1. **On the field's own benchmark** (Twin-2K-500; 2,058 people; released with its authors' GPT-4.1,
   GPT-4.1-mini, Gemini and fine-tuned twins):
   - **The crowd beats every twin.** A guess that knows nobody, the crowd's median answer, is more
     accurate than all 13 twins, by 3.6 to 8.2 points.
   - **The persona adds nothing to accuracy.** A model of the 500-question persona that aims at the
     metric's own optimum scores exactly the crowd's accuracy.
   - **One look carries the signal.** Twins tell people apart at r = .07. One earlier answer by the
     same person to the same question reaches r = .49, on all 17 tasks.
   - **Our echo beats the person's own retest**, which the field treats as its ceiling: 0.822 against
     0.817.
2. **With real money at stake** (Basel–Berlin Risk Study): on every task that is less than half steady,
   copying a person's own past behaviour does worse than knowing nobody. That is exactly what our theory
   predicts. Read by the echo, the same observation is the best witness.
3. **Across 138 behavioural measures** (Self-Regulation Ontology): what people say about themselves
   predicts nothing about what they do (.005 of variance), and what they do predicts nothing about what
   they say. The echo beats copying on 135 of 138.

**Why the information is missing from words.** A persona carries a few percent of what can be known
about a person in a given situation. One earlier observation of them *in that situation* carries about
half of it, and three carry about four fifths.

So the scarce input is **repeated observation in the situation you care about.** Panels ask once, and
interviews ask once. A world people come back to collects it at no marginal cost, with consent, as
play.

The independent market map we commissioned ends: *"a study that clears those bars would be the first
evidence in this market that revealed choices make better twins than stated answers, which is the claim
every competitor makes and none has shown."* Studies 1–2b are that first evidence on public data. The
pilot (Study 3) is the same test in our own world.

## Why now

- **Money has arrived in human simulation; validity has not.**
  - Simile raised ≈ $300M at a $2B valuation (Oct 2026).
  - Aaru sold equity at a $1B headline price, with its lead's main tranche at $450M.
  - Salesforce bought the AI-interview platform Listen Labs.
  - One industry newsletter's verdict: "every accuracy figure is a self-graded exam."
- **The flaw is now in print.** In 2026 the field's own papers found that twins correlate with their
  humans at r ≈ .20 on 164 new outcomes ("Funhouse Mirrors"), and near zero on the residual (Wang et
  al.). Buyers are starting to ask for individual-level validity, and no one can supply it from words.
- **Independent tests in 2026 are negative.**
  - Pew's twins were off by 12 points on average.
  - In Prolific's study, personas built from demographics tripled the error.
  - YC has funded about ten people-simulation startups, but none of its Requests for Startups asks
    for this.
- **Behaviour is the stated next step for the leaders.** Simile's CEO names "lab or virtual experiments
  with real stakes" among the data that make a twin behavioural ("that's ultimately what makes it
  behavioral"). Nobody has a world built to produce them.

## Competition, and where we fit

| Agents built from | Synthetic populations | One-to-one twins (B2B) | Twins the person and friends see |
|---|---|---|---|
| LLM priors + demographics | Ask Rally, Synthetic Users, Evidenza, … | — | companion apps |
| What people **say** | Electric Twin, Qualtrics | **Simile**, Semilattice, YouGov Parallax, Toluna, Ipsos | Delphi, Tavus ("talk to my twin") |
| What people **do** in the wild | **Aaru**, NIQ BASES, Artificial Societies | Simile's stated next step | — |
| What people **do** in a designed world | Project Sid (no real people) | **empty: ECHO** | **empty: ECHO** |

**The cell is empty, but the label is not.** Aaru, NIQ, YouGov, Salesforce and two YC startups already
call their twins "behaviour-grounded". They mean transactions or panel histories. Ours is a different
method, and the method is the claim:
- situations designed to come back;
- a measured ceiling for every echo;
- the person's friends as the human baseline.

**Most feared: Simile,** because of its team, its $300M and its stated move to behaviour. Our answers
are three:
1. **The world** makes repeated observation cheap and wanted, where for a panel it is expensive and
   resented.
2. **The theory and the audit standard.** The knowable ceiling and the crowd baseline are measures no
   one else reports, and twins built from words look bad under them.
3. **The echo layer composes.** Laid on the released GPT twins, one observation lifts them from 0.724
   to 0.822. We can be Simile's supplier before we are its rival.

## Business model

1. **Twin audits.** This is the first sale, and it costs us almost nothing to deliver. A team gives us
   its twins and a panel. We measure what the twins know about individuals against the crowd and the
   knowable ceiling, the way Study 1 did. It also sets the standard everyone else must meet.
2. **Echo studies.** A team brings situations it cares about: a price, an offer, a message, a feature.
   We set them in the world for consented players, more than once. They get:
   - echoes of their audience, with each prediction's confidence;
   - a report of how much of the knowable each echo knows.

   It is priced per study, like panels, with a premium for repeated, individual-level measurement. It
   draws on research-software and AI-tooling budgets. Market research itself was $56bn in 2024 (the
   "$165bn insights industry" includes software). Online sample is a strained $1–3bn: Cint shrank and
   went private, and Dynata went through Chapter 11.

   **The exit comparable:** Salesforce bought the AI-interview platform Listen Labs (reported ≈ $2B,
   closed 2 Nov 2026) to ground its twins.
3. **The echo layer (API).** A twin company's twins, plus their panellists' repeated observations, go in;
   individual predictions that beat the retest come out.

**The consumer side is free, and it is the engine.** The debrief, "who knew you best?", is why a player
comes back and why they invite friends: friends are the human baseline the debrief needs. Its job is to
produce consented, repeated choices per person at a cost below bought panel sample.

## How far along are you?

- **The world.** A procedural planet with living villages and generational NPCs, multiplayer, in 3D in
  the browser, with a Bayesian echo engine as an ML service.
- **The pilot village.** Six classic decision paradigms played as ordinary encounters. It already has
  friends' guesses, two or three visits, the debrief, the owner's export and the analysis.
- **The research.**
  - Three pre-registered studies on public data, and the paper.
  - A theory with closed forms, held to its own Monte Carlo.
  - A leak-tested pipeline: six planted leaks, all caught.
- **Users.** None yet. The production deploy and the pilot are pending. **[founder: launch date]**

## The objections an investor will raise, and our answers

| Objection | What we have | What we still need |
|---|---|---|
| "Choices in a game are still stated preferences" | The laws hold on incentivised behaviour (Study 2) | Link the pilot's choices to one behaviour outside the game |
| "Individual grounding barely beats demographics" | True for *words*: the persona bound. Untrue for the same situation again: r .49 against .07 | The same test in our world (Study 3) |
| "You won't collect enough choices per person" | Youyou needed about 70 Likes to beat a friend; the looks curve says three looks in the same situation give about 80% of the knowable | Retention: day 1, day 7 and third-visit rates |
| "Your players aren't the population" | — | A quota subsample through a panel partner |
| "Incumbents own grounding" | The echo layer composes with their twins | A blinded head-to-head on a buyer's real question |
| "Buyers won't pay for accuracy" | — | Two paid audits or studies |
| "Game choices measure skill, not values" | — | The axes' stability, and their distinctness from a cognitive measure |
| "Privacy could stop it" | Consent per study, erasure, discrete choices only, adults only, no hiring, credit, insurance or electoral uses | A data-protection impact assessment |

## The next twelve weeks

1. **Weeks 0–2: the pilot.** Deploy, then 20 friends with three visits each, pre-registered. Measure
   return rates and the echo's skill.
2. **Week 2: a preprint** of Studies 1–2b. Send the audit method to five twin companies and five
   research labs.
3. **Weeks 3–8: circles.** Anyone can start a "who knows you best" group. Target 1,000 players.
   Measure invites per player and repeat visits.
4. **Weeks 4–12: first revenue.** Two paid twin audits and one paid echo study. **[founder: who]**

## Founder questions

**[founder]** These are about you, your background and why you.

Facts the materials support:

- **Built solo.** You built the world, the engine and the research pipeline yourself.
- **Pre-registered.** The analyses were pre-registered on public data before any participant.
- **PhD plans.** Applications are planned for December 2027, and this research is their paper.
