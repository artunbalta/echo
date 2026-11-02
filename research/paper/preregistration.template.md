# Pre-registration: Who Knows You Best? (ECHO pilot village)

*In the shape of the OSF Preregistration template. To be filed before the first friend's first visit;
the analysis is frozen at the commit named in §5.*

## 1. Study information

**Title.** Who knows you best? Self, friends, and a world that watched.

**Research questions.**
1. **Again.** When a situation comes round again, how well do these witnesses predict a person's choice
   in it?
   - the person's own stated intention;
   - their friends' guesses;
   - echoes learned from the person's behaviour in a game world.
2. **The second layer.** Does an echo with a person-specific layer per kind of choice (two layers)
   predict better than one with trait axes alone (one layer)?
3. **How long.** How many minutes of play does the two-layer echo need to match the friends?
4. **Elsewhere.** In a situation the echo has never seen the person in, which witness predicts best?
5. **Say and do.** Do people say they would give more than they do, and do their own forecasts run
   further from what they do than their friends' forecasts?

**Hypotheses.** One-sided where a direction is stated.

- **H1.** In *again*, the two-layer echo has lower mean absolute error than the one-layer echo. (Central.)
- **H2.** In *again*, the two-layer echo has lower mean absolute error than the base rate.
- **H3** (estimation, no test). Skill of the two-layer echo, friends, own words and the three pooled, in
  both settings, with 95% bootstrap intervals; and the minute at which the echo's curve reaches the
  friends' skill.
- **H4.** On giving, the stated choice exceeds the mean actual choice (two-sided). The person's own
  signed error exceeds their friends' mean signed error (two-sided).
- **H5** (descriptive). For most paradigms, the person-specific steady share of variance exceeds the
  trait share.

## 2. Design plan

**Type.** A within-person observational study with repeated measures. There is no manipulation.

**Setting.** ECHO's pilot village (web decision C75): a shared 3D world in a browser. Six encounters are
set out one at a time in a counterbalanced order per person:

- **Dictator (bread).** A thin stranger by the path; give 0–3 of 3 loaves.
- **Trust (raft).** Someone at the water asks to borrow the raft; lend it or say no. It comes back 3 times
  in 4.
- **Risk (tide).** A fisher offers two fish sure, three or one, or four or none, with the mean held at 2.
- **Delay (seed).** A handful of grain now, or plant it for three handfuls a day later.
- **Exploration (path).** Follow an overgrown path, or keep to the marked way.
- **Approach (stranger).** Go up to a traveller sitting alone by a fire, or walk on.

**Timing of the encounters.**

- The first is set out 20 seconds into a visit.
- Each next one is set out 30 seconds after the last was answered.
- One left standing for 4 minutes is unmet: missing, never coded zero.

**Procedure.**

1. **Before the first visit:** consent, a nickname, a self-rating on the eight axes (1–7), and stated
   choices for the six.
2. **Two visits** of 25 minutes, at least 20 hours apart, or three if chosen before the first visit
   (`ECHO_PILOT_VISITS=3`; state which here: ☐ two ☐ three). Each next visit opens a day after the last
   began. Bread and the raft are topped up at the start of each.
3. **After each visit:** each person rates each other person. They say how well they know them (0–3);
   if at least 1, they give the eight axes and their guess of the person's six choices, or "no idea".

**Blinding.**

- Nobody sees anyone's choices, ratings or guesses.
- Friends do not see each other in the world.
- The analysis code never lets a witness see the choice it predicts. Its tests verify this to the last
  float.

## 3. Sampling plan

**Data collection.** The owner's export of the pilot tables and events (`GET /api/pilot?op=export`).

**Sample.**

- Friends and family of the first author, unpaid, at least 18 years old.
- Target 16–20.
- Stopping rule: at 20 people or after four weeks from the first visit, whichever comes first.

**Power.** These figures come from simulated groups built to published ranges, 200 per size, analysed by
the registered code:

- At 16 people, H1 has power {{power:16:again:echo_2l>echo_axes}} and H2 has {{power:16:again:echo_2l>bar}}.
- H1 reaches .8 at about {{need:again:echo_2l>echo_axes}} people with two visits.
- With three visits, H1 has {{power3:16:again:echo_2l>echo_axes}} at 16 people and
  {{power3:20:again:echo_2l>echo_axes}} at 20.
- The comparison of the echo with the friends is not powered at pilot size, so it is registered as
  estimation (H3).

## 4. Variables

**Outcome.** Each choice met, coded 0..1:

| Paradigm | Coding |
|---|---|
| give | 0, ⅓, ⅔, 1 |
| lend | 1 / 0 |
| bet | safe 0, even 0.5, long 1; declined 0 |
| seed | planted 1 / ate 0 |
| path | followed 1 / passed 0 |
| greet | went up 1 / walked on 0 |

**Witnesses.**

| Witness | What it is |
|---|---|
| self | the stated choice |
| friends | the median of guesses |
| echo | the engine as built |
| echo_axes | one layer, fitted on the other people |
| echo_2l | two layers, fitted on the other people |
| traits | the questionnaire twin |
| twin | ridge on the other choices, fitted on the other people |
| together | the median of self, friends and echo_2l |

**Settings.**

- **again:** visit 2 is predicted from visit 1, and with three visits visit 3 from visits 1 and 2.
- **elsewhere:** each choice is predicted without that paradigm ever being seen.

**Score.** Skill = 1 − MAE/MAE<sub>bar</sub>, where the bar is the median of everyone else's choices
in that paradigm. A silent witness is scored as the bar.

## 5. Analysis plan

**Code.** `research/pilot/analysis.py` at commit `<filled when filed>`. Run it with:

```
services/ml/.venv/bin/python research/pilot/analyze.py export.json
```

This uses the engine's endpoints (the exact path).

**The two-layer echo's fit.** It uses variance components on everyone but the person predicted. Each
choice's stability is partially pooled toward the six choices' mean with a prior worth ten pairs of
visits, as in the registered code.

**Inference.** All inference is over people:

- per-person mean differences in absolute error;
- one-sided sign-flip tests, exact up to 16 people and Monte Carlo (20,000) beyond;
- bootstrap percentile intervals (2,000 resamples of people).

**H1, H2.** Sign-flip tests at α = .05, one-sided. No correction: H1 is the single primary test.

**H4.** Two-sided sign-flip tests.

**H3, H5.** Estimates with intervals. The crossing minute is interpolated linearly on the curve
(minutes 0, 2, 4, 6, 8, 10, 12, 15, 20, 25 of the first visit).

**Exclusions.**

- People without a second-visit choice in a paradigm contribute no *again* item there.
- Unmet encounters are missing.
- No other exclusions.

**Deviations.** Any deviation from this plan is reported as such, beside the registered analysis.

## 6. Other

**Ethics.**

- Participation is with consent and a nickname only.
- Any person can erase themselves and every rating of them at any time.
- This is a pilot among friends; a study beyond it will go to an ethics committee before it starts.

**What the simulation assumed** (not data):

- trait–act correlations near .3;
- retest correlations of single choices of .5–.7;
- self-insight .8, and friends' insight .45–.72 by acquaintance;
- a pull toward the admirable in stated choices, strongest for giving.
