# Who Knows You Best? The Crowd, the Persona, and One Look at What You Did

*Draft, 2026-11-06. Artun Balta. Studies 1 and 2 are pre-registered secondary analyses of public data;
Study 3 is a pre-registered pilot whose data are not yet in. Every number below is filled in from the
analysis code's own output (`research/paper/build.py`); none is typed by hand.*

## Abstract

Digital twins are models meant to predict what a particular person will do. They are judged by how
often they reproduce people's answers, normalised by how often people reproduce themselves (test–retest).
We argue that this yardstick hides the question that matters, whether a twin knows the individual. We
give a theory of what can be known about a person's next choice and of who can know it.

**The theory.** A choice is the crowd's typical answer, plus what a persona can predict, plus the
person's own steady way with that situation, plus the day. In closed form, the theory makes three
predictions:

- A persona, however rich and however cleverly read, caps knowledge of a situation at its own small
  share.
- Copying a person's earlier choice loses to knowing nobody whenever the choice is less than half
  steady.
- The retest is not a ceiling. Reading one earlier choice against the crowd beats it, and the
  knowable ceiling lies higher still.

**Study 1: Twin-2K-500**, pre-registered. There are 2,058 US adults and 17
retested tasks.

- **The crowd beats every twin.** The crowd's median answer, which knows nobody, is more accurate than
  every one of 13 released LLM twins, by 3.6 to
  8.2 points on the benchmark's own metric.
- **A regression knows individuals better than the twins.** Ridge regression on the same 500-question
  persona puts people in order about twice as well as the twins (r = .14 against
  .07).
- **One look knows them better still.** One earlier answer to the same question reaches r =
  .49, on all 17 tasks.
- **The echo beats the retest.** A two-layer echo that reads that one answer against the crowd
  outscores the retest: 0.822 against 0.817, as registered.
- **Its simplest form lands on the theory.** Exploratory, it scores 0.827,
  the theory's one-look optimum (0.827). The knowable ceiling is
  0.869 (0.866–0.871).

**Study 2: the Basel–Berlin Risk Study.** The behaviour here is incentivised and retested six months
later.

- **Copying loses to the crowd.** Copying a person's earlier behaviour is worse than knowing nobody on
  all 5 tasks that are less than half steady. Mean skill is
  −0.22, as 2ρ − 1 says (r = .99 across tasks).
- **Self-reports barely register:** +0.02.
- **The echo is the best witness.** The same one observation, read by the echo, scores
  +0.17.

**The same laws across 138 behavioural measures** (Self-Regulation Ontology, also
pre-registered):

- copying loses to the crowd on 102 of the 106 measures less
  than half steady;
- the echo beats copying on 135 of 138 and tracks ρ²
  (r = .99);
- self-reports know nothing of behaviour (+0.005).

**How fast a person becomes knowable: the Moral Machine** (pre-registered). It has
31,517,766 moral dilemmas from 2,093,956 browsers, many of them seen in many visits.

- **The two laws again.** Copying another visit scores 2ρ − 1, and one look ρ², in all six contrasts.
- **One visit knows more than the whole survey**, country included, in 6 of 6.
- **The looks curve holds as registered, and exploratory panels show where.**
  - On everyone with four visits or more, the curve the theory draws from pairs alone puts all
    18 points within their 95% intervals.
  - For the contrast where people differ most, it does so out to twenty visits.
  - In heavier panels, where ρ is near zero and noisy, it misses.

On this evidence, knowing a person means watching them in the situation of interest, again. Asking
them about themselves, and knowing what they did elsewhere, adds little. **Study 3** describes a
multiplayer world built to watch people again, and a pre-registered study of friends in it.

## 1. Introduction

**Digital twins and their yardstick.** A fast-growing family of systems tries to predict what a
specific person will do.

- Generative-agent simulations of individuals built agents from two-hour interviews with 1,052 people
  (Park et al., 2024). The agents matched people's answers to the General Social Survey 85% as often as
  the people matched their own answers two weeks later.
- Twin-2K-500 (Toubia et al., 2025) released 2,058 people's answers to some 500 questions, and twins
  built from them. Those twins scored 71.7% accuracy on held-out tasks, "87.7% of the human test–retest
  accuracy".
- Companies now sell such twins to replace or extend survey panels.

The field's yardstick is the ratio of a twin's accuracy to the person's retest accuracy. It treats the
retest as the ceiling.

**What the yardstick hides.** It hides two things:

1. **A twin can be accurate without knowing anyone.** Accuracy rewards predicting the typical answer,
   and most people give it. The right first baseline is therefore not random guessing, the one
   usually reported. It is the crowd: guess, for everyone, what most people answer.
2. **The retest is not a ceiling.** It is one noisy answer guessing another, and its noise counts
   against it. Someone who knew a person exactly, but not the day, would beat it.

**What is already known.** Recent work has begun to show that LLM twins carry little individual
signal:

- Across 164 new outcomes, twins correlated with their humans at r ≈ .20. That is barely above twins
  given only demographics, and no better than gradient boosting trained on a couple of hundred
  respondents (Peng et al., 2026).
- On Twin-2K-500's behavioural contrasts, the residual correlation was near zero (Wang, Hunt, Tang &
  Joseph, 2026).
- In incentivised economic games, interview twins correlated with their humans at r = −.05 to .11 per
  game (Park et al., 2024, supplementary materials).

**What is not.** What has not been asked is *what information* would let a model know the individual.
Nor has it been asked *how much* of what is knowable each source carries:

- what people say about themselves;
- what they chose in other situations;
- what they did in this situation before.

**Psychology's long answer.** Psychology has studied the question with people as the predictors.

- **Weak consistency, strong aggregates.** Single acts are weakly consistent across situations
  (Mischel, 1968). Aggregates are strongly stable (Epstein, 1979; Fleeson, 2001).
- **If-then signatures.** People have stable signatures of their own in particular kinds of situation
  (Mischel & Shoda, 1995).
- **Past behaviour.** Past behaviour in a situation predicts future behaviour there (Ouellette & Wood,
  1998), better than intentions do (Sheeran, 2002).
- **The reliability paradox.** Behavioural tasks correlate weakly with self-reports of the same
  construct (Dang, King & Inzlicht, 2020). They are also less reliable than the self-reports (Hedge,
  Powell & Sumner, 2018; Frey et al., 2017).
- **Machines from traces.** Computers given enough of a person's digital traces judge their
  personality better than their friends do (Youyou, Kosinski & Stillwell, 2015).

**This paper.** We bring these together.

- **§2, a theory.** It decomposes a single choice and gives every witness's skill in closed form. It
  makes three predictions, and it defines a *knowable ceiling* above the retest and a *personal
  knowledge index*: the share of the knowable, beyond the crowd, that a witness knows.
- **§3, Study 1.** A pre-registered test on Twin-2K-500, the field's public benchmark, using the
  authors' own metric and the released twins' own predictions.
- **§4, Studies 2, 2b and 2c.** Three more pre-registered tests:
  - on incentivised behaviour;
  - across 138 behavioural measures spanning the whole range of reliabilities;
  - on two million people seen again and again (the Moral Machine), where the looks curve, how fast a
    person becomes knowable, is measured for the first time.
- **§5, Study 3.** The design, simulation and pre-registration of a study in ECHO, a multiplayer world
  that brings people back to the same situations. A world that watches is the instrument the first
  two studies call for.

## 2. Theory: what can be known about a person's next choice

Take one kind of situation and standardise its answer. Person *i*'s answer on occasion *t* is

  y_it = A_i + U_i + e_it.

The three terms are:

- **A_i**: what a persona predicts. The persona is everything the person says about themselves, who
  they are, and what they chose in other situations. Its share of variance is π.
- **U_i**: the person's own steady way with *this* situation, which no persona carries. Its share is
  ρ − π.
- **e_it**: the day, with share 1 − ρ.

ρ is the retest reliability of a single answer. The witnesses differ in what they know about *i*. Each
is scored by its skill, 1 − MSE / var(y):

| Witness | Knows | Skill |
|---|---|---|
| The crowd | nothing about *i* | 0 |
| A persona twin, however clever ("elsewhere") | A_i | π |
| Copying the person's last answer (the retest) | one earlier y | 2ρ − 1 |
| Two-layer echo after n looks, starting from the persona | A_i and n earlier y's | π + n(ρ − π)² / (n(ρ − π) + 1 − ρ) |
| Knowing the person exactly, not the day (the ceiling) | A_i + U_i | ρ |

Three predictions follow.

1. **The persona bound.** Without looks, no model of the persona can know more than π, whether it is a
   regression or a language model. For single choices, trait–act correlations near .3 put π near .1
   (Mischel, 1968), while single-choice reliabilities ρ of .4–.8 are common. Most of what is knowable
   about a choice is therefore *not in the persona*.
2. **Copying loses to the crowd below half.** The retest's skill, 2ρ − 1, is negative whenever ρ < ½. A
   person's own earlier answer, taken at face value, is then a worse guess than the crowd's.
3. **The retest is not the ceiling.** The echo after one look scores at least ρ², which exceeds 2ρ − 1
   for every ρ < 1. More looks approach ρ.

**The same arithmetic in forecasting.** Two of these forms are old in another field.

- In forecast verification, copying is *persistence*. Its skill against climatology is 2ρ − 1.
- The echo after one look, without a persona, is the best linear blend of persistence and climatology.
  Its skill is ρ² (Murphy, 1992).
- After n looks, without a persona, the skill is ρ times the reliability of the n looks' mean, which is
  the Spearman–Brown prophecy (Spearman, 1910; Brown, 1910): nρ² / (nρ + 1 − ρ).

What is new here is the persona prior and the knowable ceiling for discrete answers. So is the
evidence that the field of digital twins has been scoring itself against persistence while calling it
a ceiling.

**Accuracy and the knowable ceiling.** For answers on a discrete scale and the field's accuracy metric
(1 − |guess − answer| / range), we use an ordered latent model of the same form:

- A column's answer is its share-matched threshold of a latent T + e.
- ρ is fitted so that the model reproduces the column's observed retest accuracy.
- The model then gives three quantities:
  - the crowd's accuracy;
  - the **knowable ceiling**: guessing the median of the person's own answers given T;
  - the Bayes-optimal echo after n looks.

The categorical intuition is simple. A person who says yes with probability *p* agrees with themselves
with probability p² + (1 − p)², but someone who knew *p* would be right with probability
max(p, 1 − p).

The **personal knowledge index** of a witness is

  (accuracy − crowd) / (ceiling − crowd).

It is the share of what is knowable about the person, beyond the crowd, that the witness knows.

**Looks needed.** With no persona, an echo knows a share q of the knowable after

  n = q / (1 − q) · (1 − ρ) / ρ

looks: the odds of q times the day's share over the person's own. At ρ = .6 that is three looks for
80%. These are the pilot's two-layer closed forms (§5), generalised to an echo that starts from a
persona. Tests hold them to a Monte Carlo of their model (`research/deeds/tests/test_theory.py`).

## 3. Study 1: Twin-2K-500 (pre-registered)

### 3.1 Data and design

Twin-2K-500 (Toubia et al., 2025) surveyed 2,058 US adults in four waves.

- **Waves 1–3: the persona.** These waves built the persona:
  - demographics;
  - some 280 self-description items: the Big Five, values, needs, symptoms, spending style;
  - cognitive tests;
  - economic choices: ultimatum, dictator and trust games, and risk and time price lists, all
    hypothetical.
- **Waves 1–3, outside the persona.** The same waves also included 17 tasks outside the
  persona: heuristics-and-biases experiments, 40 purchase decisions, and policy views with estimates
  of others' views.
- **Wave 4.** Two weeks after wave 3, the same 17 tasks were repeated: 122
  scored columns.
- **The twins.** The release includes, per person, the wave-4 answers of the authors' LLM twins. There
  are 13 specifications: GPT-4.1, GPT-4.1-mini, Gemini 2.5 Flash and a fine-tuned
  GPT-4.1-mini, in text, JSON and summary personas, plus one given demographics only. Each was given
  the persona and not the tasks' earlier answers.

**Registration.** We registered the analysis before fitting any model (`research/deeds/PREREG.md`).
The registration discloses what we had seen: the released evaluation sheets, which already showed the
twins' low per-task correlations.

**Primary setting: forward.** Wave 4 is the truth; every witness uses waves 1–3 only. The authors' own
direction, with the truth in waves 1–3, gives the same picture (§3.4).

**Scoring.** We reproduce the authors' metric to the digit: retest 0.8173 (their
0.8172) and their headline twin 0.7171 (0.7172) in their direction. Beside accuracy we report
**individual-level r**: Pearson r across people, per column, averaged within and then over tasks. It
asks whether a witness puts those who answer higher above those who answer lower. A constant witness
scores 0.

**The witnesses.** Each is fitted by 10-fold cross-validation over people. A person's guess never
depends on their own truth; a test plants six such leaks and catches all six.

- **The crowd.** The median of other people's answers.
- **The twins.** As released.
- **Ridge regressions** on each kind of persona information and on all of it ("persona"). One variant
  adds the person's waves 1–3 answers to the *other* sixteen tasks.
- **Again.** The person's own earlier answer to the same column.
- **The two-layer echo.** a + b·m + c·x, fitted on other people. Here x is the earlier answer and m
  the persona regression, nested so that m is out of fold for the people the weights are fitted on.

### 3.2 Results

<!-- figure:ladder -->

**H1. Accuracy does not show personalisation: the crowd beats every twin.** The crowd's median answer
scores 0.761. By the field's yardstick that is 93% of the retest. The
headline twin scores 0.724 (89%).

Scored on the people each twin answered, every one of the 13 specifications is
below the crowd. The gaps run from −0.036 for the most favourable
(JSON Persona (Predicted Output) - GPT4.1; 95% CI −0.039 to −0.032) to
−0.082.

The registered test, which scores a twin's missing answers as the crowd's, gives
−0.023 [−0.026, −0.020].

The persona itself has nothing to add to accuracy. A gradient-boosted model of the persona that aims at
the metric's own optimum, the conditional median, scores 0.7614. That is the
crowd's 0.7614 to the fourth decimal. The twins fall below even that.

<!-- figure:individuals -->

**H2. A regression knows individuals better than the twins, on the twins' own information.** The ridge
on the persona reaches r = .137 (.194 as a continuous score).
Against it:

- the headline twin reaches .074;
- the best of the persona twins reaches .085;
- the twins' average, as a score, reaches .113.

The regression wins on 13–16 of
17 tasks against each twin (registered sign test against the most favourable, Holm-adjusted
p = .006).

**H3. The same situation, once, outweighs everything else.** The person's own earlier answer to the same
question reaches r = .486. Everything in the persona together with their earlier answers
to the other sixteen tasks reaches .151 (.208 as a
score). The single answer is ahead on 17 of 17 tasks.

**H4. The retest is not a ceiling.** The registered two-layer echo scores 0.8218 against
the retest's 0.8173: Δ = +0.0045, 95% CI [+0.0031,
+0.0060], normalised accuracy 1.006.

An exploratory echo needs no persona and no linear stacker. It learns, from other people, what the
crowd answered the second time given what it answered the first. It scores
0.8275. That is the ordered latent model's one-look optimum,
0.8270, predicted before it was computed.

The echo laid on the released twins' average, instead of the regression, scores
0.8225. So the second layer upgrades any twin.

<!-- figure:looks -->

**What is knowable.** The latent model puts the knowable ceiling at 0.869
(95% interval 0.866–0.871), and the Bayes-optimal echo
at 0.847 after three looks and 0.859 after eight. The interval
comes from 200 bootstrap draws of people. Each draw refits every column's answer
shares and ρ, and rescores the witnesses on the same people. In the personal knowledge index:

| Witness | Share of the knowable it knows | 95% interval |
|---|---|---|
| The headline twin | −35% | −38% to −32% |
| The person's own retest | 52% | 50% to 54% |
| The registered echo | 56% | 55% to 58% |
| The transition echo | 62% | 60% to 63% |
| Three looks (model) | 81% | model |
| Eight looks (model) | 91% | model |

The intervals do not overlap: the registered echo knows more than the retest, and the transition echo
more than both.

**Prediction 2, per task.** Copying the earlier answer beats the crowd where the task is more than
half steady (ρ > ½) and not below. This holds on 15 of 17 tasks,
and the two misses sit at ρ ≈ .49 with gaps of a few thousandths. Across tasks, retest-minus-crowd
correlates with ρ at r = .79.

- On the framing problem the crowd (0.806) beats the person's own retest
  (0.803).
- On probability matching it does so by more (0.764 against
  0.744).
- On pricing, the most steady task (ρ = 0.87), the crowd knows little
  (0.564) and the person almost everything (ceiling 0.879).

**H5 (exploratory). Words and deeds elsewhere.**

- Self-descriptions and demographics ("words") reach r = .122.
- Economic choices and cognitive tests ("deeds", other situations) reach .074.
- The difference, deeds minus words, is −0.059 to −0.037.

So deeds *elsewhere* are no better than words here; several targets are attitudes, which words carry.
The contrast that matters is not words against deeds but **elsewhere against again**.

**H6 (descriptive).** The closed form π + (ρ − π)² / (1 − π) predicts the echo's r² per column with
correlation 0.999 and mean absolute error 0.009. Because π is small, this
check is weakly discriminating; Study 2's copy-against-echo contrast is the sharper test.

### 3.3 The exchange rate

<!-- figure:exchange -->

How many questions from each pool does it take to know the person as well as one earlier answer to
the same question? We drew k items at random from each pool, 20 times per k, and fitted the ridge on
them. No pool comes near at any size the persona holds:

- self-descriptions reach r = .157 with 256 items;
- the other tasks' answers reach .108 with 64;
- one earlier answer to the same question reaches .486.

### 3.4 Robustness

- **The authors' direction** (truth in waves 1–3; the retest from wave 4):
  - the crowd scores 0.755 (92% of the retest);
  - the headline twin scores 0.717 (88%);
  - the transition echo scores 0.822, against the retest's
    0.817.
  - The registered persona echo does not beat the retest there: Δ = +0.0005,
    p = .206.
- **Without the anchoring tasks**, whose free numbers the metric bins into deciles:
  - the crowd 0.760;
  - the twin 0.727;
  - the retest 0.816;
  - the echo 0.821.
- **Within-subject tasks only:**
  - the crowd 0.747;
  - the twin 0.735 (r .116);
  - the retest 0.821;
  - the echo 0.825.
- **A boosted median model in place of ridge** (registered): it scores 0.761,
  which is the crowd's accuracy, with r = .095.
- **Deviations from the registration** are reported in `research/deeds/README.md`:
  - The release has 13 distinct twin specifications, not the 11 counted.
  - Partially covering twins are also scored on the people they answered.
  - The transition echo and the per-task ρ > ½ test are exploratory.

## 4. Study 2: incentivised behaviour (Basel–Berlin Risk Study, pre-registered)

Twin-2K-500's choices are hypothetical. The Basel–Berlin Risk Study (Frey et al., 2017) measured risk
taking with seven behavioural tasks, six of them incentivised, plus self-reported risk, impulsivity and
sensation-seeking scales. Of its 1,507 participants, 169–171 came back about six
months later.

**The witnesses.** The target is a person's standing on a task at the retest. The witnesses guess it
from session 1:

- **words**: all self-report scales;
- **elsewhere**: the six other tasks;
- **persona**: both of those;
- **copy**: the person's own earlier standing;
- **echo**: the two-layer echo.

The words and elsewhere models are trained on the main-sample people who did not return, so they
never see a retest person. The echo's weights are fitted on the other retest people. The analysis was
registered (`PREREG-BBRS.md`) before any model was fitted.

<!-- figure:incentivised -->

**Results.** The tasks' retest r runs from 0.00 to 0.65.

- **B1: copying loses to the crowd below half.** It does on all 5 tasks below
  ρ = ½, and its skill tracks 2ρ − 1 (r = .99, mean absolute deviation
  0.047). Mean skill of copying is −0.221. On decisions from
  description (ρ = 0.27), copying scores −0.46.
- **B2: the echo never loses to the crowd and always beats copying.** It beats copying on
  7 of 7 tasks, and is above zero on
  6. The exception is decisions from experience, a task with no retest
  reliability at all (ρ = 0.004), where the echo scores
  −0.033.
- **B3: words know little.** Mean skill of words is +0.016, of other tasks
  +0.018, and of both +0.028. The echo's is
  +0.166. The words themselves are reliable (retest r 0.67–0.84).
  They are reliable about words, not about deeds.
- **B4: the observed echo against the theory.** On average it falls 0.033
  short of the theory's population optimum. That is the price of fitting three weights on about 170
  people.

### 4.2 The same laws across 138 measures (Self-Regulation Ontology, pre-registered)

Two studies give a handful of tasks; the laws should hold across the whole range of reliabilities. The
Self-Regulation Ontology (Eisenberg et al., 2019; Enkavi et al., 2019) gave 522 people 37 tasks and 22
self-report surveys. It retested 150 of them about four months later, on everything.

**Words and deeds.** We classed measures by what they record, before computing any relationship
(`PREREG-SRO.md`):

- **138 deeds**: task scores, and the two forms that record choices or performance;
- **66 words**: survey scores.

**Witnesses.** As in §4.

<!-- figure:laws -->

**Results for deeds** (median ρ = 0.38):

- **Copying** loses to the crowd on 102 of the 106 measures
  that are less than half steady. Its skill tracks 2ρ − 1 (r = .88). We had
  registered a correlation above .9; this falls short of it, mostly through heavy-tailed measures far
  below the line.
- **The echo without a persona** beats copying on 135 of 138,
  by +0.36 on average (95% CI +0.33 to
  +0.39, with the variance held at the full sample's; the registered
  per-resample interval is unstable on heavy-tailed measures). Its skill tracks ρ²
  (r = .99).
- **Mean skills:**

| Witness | Mean skill |
|---|---|
| words | +0.005 |
| other tasks | +0.113 |
| copying | −0.213 |
| echo | +0.180 |

**The mirror image.** With the surveys as targets (median ρ = 0.80):

| Witness | Mean skill |
|---|---|
| other surveys | +0.407 |
| the deeds | −0.006 |
| copying | +0.563 |
| echo | +0.625 |

Words know words and deeds know deeds, but neither knows the other. That is the self-report–behaviour
gap (Dang, King & Inzlicht, 2020), seen as a matrix of witnesses.

### 4.3 How fast a person becomes knowable (Moral Machine, pre-registered)

The studies so far saw each person at most twice, so the looks curve beyond one look was a model. The
Moral Machine (Awad et al., 2018) saw people again and again. It is a website that sets dilemmas for a
self-driving car that must kill one group of characters or another. Each session sets 13 dilemmas. Six
contrasts of character each come up in two of them:

- more lives against fewer;
- men against women;
- fit against large;
- young against old;
- high status against low;
- humans against pets.

Many people played more than one session. The released data hold 31,517,766 such dilemmas,
from 2,093,956 browsers in 3,534,594 sessions. A browser stands for a person here,
which the data allow and which shared computers blur.

**Design.** The analysis was registered before the response files were opened (`PREREG-MM.md`).

- **A look** is one visit's score on one contrast: the share of its two dilemmas in which the person
  spared the first side named above.
- **The crowd** is the mean choice in each dilemma's situation, fitted on other people. The situation
  is who dies if the car stays or swerves, pedestrians or passengers, the crossing signal, and the
  numbers.
- **ρ̂** is fitted on pairs of visits only. From it alone the theory draws the whole curve: skill
  nρ̂² / (nρ̂ + 1 − ρ̂) after n visits.
- **The panel.** The curve is measured on held-out visits of a fixed panel: the people with more than
  K visits on the contrast, where K is the largest number of looks, up to 20, that at least 2,000
  people reach.

**Copying, and one look (M2).** Among the people with two or more visits on a contrast, a visit's
choice is mostly the moment. ρ̂ is 0.08 to 0.16 for the five
contrasts of character, and 0.40 for humans against pets. Copying the person's
other visit therefore loses to the crowd, and by 2ρ̂ − 1:

| Contrast | People | ρ̂ | Copy | 2ρ̂ − 1 | One look | ρ̂² |
|---|---|---|---|---|---|---|
| more lives | 311,536 | 0.113 | −0.773 | −0.774 | 0.0129 | 0.0128 |
| men over women | 295,339 | 0.104 | −0.791 | −0.791 | 0.0109 | 0.0109 |
| fit over large | 224,794 | 0.081 | −0.836 | −0.837 | 0.0067 | 0.0066 |
| young over old | 270,485 | 0.156 | −0.690 | −0.688 | 0.0241 | 0.0243 |
| high status over low | 22,202 | 0.079 | −0.848 | −0.843 | 0.0058 | 0.0062 |
| humans over pets | 297,658 | 0.397 | −0.208 | −0.207 | 0.1569 | 0.1572 |

- **Copying.** The registered test asked for the sign and a gap under .03. It holds in
  6 of 6, and the largest gap is in the third decimal.
- **One look.** The echo after one look scores ρ̂² to within a few ten-thousandths.
- **Copying the raw choice** is worse still, since it carries the other visit's situation along. It
  ranges from −0.23 to −1.09.

**One visit against the whole survey (M3).** 463,675 people also answered the site's
survey: their age, gender, education and income, a political and a religious slider, and their
country. Among those with two visits, a ridge regression on all of it, fitted on other people, knows
less than one visit in 6 of 6 contrasts:

| Contrast | People | Survey | One visit | Both |
|---|---|---|---|---|
| more lives | 87,209 | +0.012 | 0.021 | 0.029 |
| men over women | 80,042 | +0.012 | 0.017 | 0.026 |
| fit over large | 59,105 | +0.007 | 0.012 | 0.018 |
| young over old | 72,687 | +0.009 | 0.040 | 0.046 |
| high status over low | 3,582 | +0.001 | 0.027 | 0.020 |
| humans over pets | 80,533 | +0.086 | 0.232 | 0.257 |

- **The registered gap.** The mean gap is 0.037 (0.035–0.039),
  as registered.
- **Where the survey knows most.** It is humans against pets, at 0.086. One
  visit knows 0.232 there.

**The visit is a unit (M4).** Two dilemmas of a kind in the same visit agree more than two from
different visits:

| Contrast | Within a visit | Across visits | Visits for 80% of the knowable | Country crowd | One visit |
|---|---|---|---|---|---|
| more lives | 0.14 | 0.06 | 31 | +0.0042 | 0.0129 |
| men over women | 0.09 | 0.06 | 34 | +0.0039 | 0.0109 |
| fit over large | 0.10 | 0.04 | 45 | +0.0019 | 0.0067 |
| young over old | 0.19 | 0.09 | 22 | +0.0049 | 0.0241 |
| high status over low | 0.15 | 0.05 | 47 | +0.0033 | 0.0058 |
| humans over pets | 0.44 | 0.28 | 6 | +0.0196 | 0.1569 |

Country, the variable this dataset is famous for, is in the table's last two columns. A crowd that
knows each person's country, shrunk toward the world's, gains +0.002 to
+0.020: between an eighth and about half of what one visit gains.

Part of what the theory calls the day is the visit. Looks are worth more spread over visits than
packed into one, which is how ECHO's pilot is built. The knowable is small here, ρ̂ itself, so 80% of
it takes six visits for humans against pets and twenty or more for the rest.

**The looks curve as registered (M1).** The registered panel is the browsers with more than K visits,
K = 20 for five contrasts and 6 for status:
2,331–4,928 browsers per contrast. By the registered criterion the
curve holds. Across the 106 (contrast, n) points, measured and predicted skill
correlate at r = 0.992, with a mean gap of 0.0019 (registered:
above .95 and below .01).

The panel is a poor place to test it, though, and we say so:

- **Barely self-consistent.** Browsers that played 21 times or more agree with themselves little
  (ρ̂ 0.008–0.068, against 0.08–0.40
  among everyone with two visits). Shared machines would do that.
- **Noisy where it is near zero.** ρ̂ there is about as noisy as it is large, so for five contrasts the
  curve hugs zero and the criterion is easy to meet.
- **Humans against pets carries signal.** The measured curve rises from
  0.0045 at one visit to 0.0388 at twenty
  (0.0297–0.0478). The theory, from pairs alone, said
  0.0049 and 0.0408.
- **Where ρ̂ is near zero,** the measured curve sits below the theory's. A κ set from a noisy ρ̂ does
  worse than the theory, which assumes ρ known, and averaging the theory over noisy ρ̂ (Jensen's
  inequality) inflates it.

**The looks curve, exploratory.** The registered panel asked for more than twenty visits. The curve
can also be measured on everyone with more than K visits for smaller K, where browsers are many and
ρ̂ is precise. This is not registered, and it is reported as such. Each cell counts the predicted
points that lie inside their measured 95% interval:

| Contrast | More than 3 visits | More than 6 | More than 10 | More than 20 (registered) |
|---|---|---|---|---|
| more lives | 3/3 | 6/6 | 0/10 | 0/20 |
| men over women | 3/3 | 6/6 | 1/10 | 0/20 |
| fit over large | 3/3 | 1/6 | 0/10 | 1/20 |
| young over old | 3/3 | 4/6 | 4/10 | 0/20 |
| high status over low | 3/3 | 6/6 | 0/10 | 6/6 |
| humans over pets | 3/3 | 6/6 | 10/10 | 20/20 |
| browsers per contrast | 4,826–52,263 | 2,331–19,119 | 1,344–10,289 | 2,331–4,928 |
| all points (r, mean gap) | 18/18 (0.99996, 0.0004) | 29/36 (0.99985, 0.0008) | 15/60 (0.989, 0.0028) | 27/106 (0.992, 0.0019) |

- **Where ρ̂ is measured on many people, the curve lands.** At four visits or more, all
  18 points do. For humans against pets the measured skill is
  0.097, 0.148 and 0.178 after one, two and
  three visits. The theory, from pairs alone, said 0.096,
  0.147 and 0.178.
- **Humans against pets lands in every panel.** It is the contrast where people differ most, and every
  point of every panel lies inside its interval, out to twenty visits in the registered one.
- **Where ρ̂ is near zero, the curve misses.** In the heaviest panels the other contrasts have ρ̂ of .01
  to .04, about as noisy as it is large, and most of their points miss.
- **The more a browser played, the less it is one person.** For humans against pets, ρ̂ falls with
  the number of visits the panel asks for:

  | Panel | ρ̂ |
  |---|---|
  | two visits or more | 0.40 |
  | 4 or more | 0.31 |
  | 7 or more | 0.20 |
  | 11 or more | 0.13 |
  | 21 or more | 0.07 |

  Shared machines would do that, and so would people trying the answers out. The theory does not
  need ρ to be the same in every panel. It needs ρ to be measured where it is applied, and that is
  what the debrief and the pilot do.

<!-- figure:looks_mm -->

## 5. Study 3: the village (pre-registered pilot)

Studies 1 and 2 say that knowing a person takes watching them again, in the situation of interest. ECHO
is a procedural multiplayer world built to do that: it brings people back to the same kinds of
situation, and each player's actions train an *echo* of them. The pilot sets six classic paradigms in
its world, as ordinary encounters with the world's own stakes:

| Paradigm | In the village | Choice, coded 0..1 |
|---|---|---|
| Dictator game (Forsythe et al., 1994) | A thin stranger by the path looks at your bread; you carry three loaves | loaves given: 0, ⅓, ⅔, 1 |
| Trust game, first move (Berg, Dickhaut & McCabe, 1995) | Someone at the water asks to borrow your raft; one time in four it does not come back | lent 1, kept 0 |
| Risk, mean held fixed (cf. Holt & Laury, 2002) | A fisher offers two fish now, or a bet on the tide: three or one, or four or none | safe 0, even 0.5, long 1 |
| Delay (Frederick, Loewenstein & O'Donoghue, 2002) | A farmer's child offers a handful of grain now, or a seed that is three handfuls tomorrow | planted 1, ate 0 |
| Exploration (cf. Wilson et al., 2014) | An overgrown path leaves the marked way | followed 1, passed 0 |
| Approach | A traveller sits alone by a small fire | went up 1, walked on 0 |

**Procedure.** Friends join with a nickname and consent.

1. **Before the first visit.** They place themselves on the echo's eight axes and say what they would
   do in each of the six.
2. **The visits.** They come two or three times, a day apart, for 25 minutes. The six are set out one
   at a time, in an order counterbalanced across people.
3. **After each visit.** Each rates the friends they know and guesses what those friends would do.

The witnesses are three: the person's words, the friends' median guess, and the two-layer echo. The
echo is fitted by variance components on everyone but the person predicted, with each choice's
stability partially pooled. It is predicted for the next visit from the visits before.

**The debrief.** After a person's last visit, and only if the owner allows it, they see who knew them
best. For each of the six, it shows:

- their words;
- their friends' median guess, when at least two friends guessed;
- their echo's guess;
- what they did;
- what share of the knowable the echo now holds.

That debrief is also the product's loop (web decision C80).

**Simulation and power** (120 simulated groups of 16, grounded in published ranges). When the
situation comes again:

- the two-layer echo reaches a skill of +0.34 over the base rate;
- friends reach +0.26;
- the person's own words reach +0.26;
- a one-layer, trait-only echo reaches +0.03;
- copying the first visit reaches +0.34.

The echo matches the friends after a median of 7 minutes of play. In a situation never
seen, words and friends (+0.26, +0.23) beat the echo
(+0.00), as Study 1's elsewhere results lead one to expect.

The central test (two layers against one) has power 65% at 16
friends with two visits. It has 82% at 20 friends with three.

<!-- figure:curve -->

**Registration.** `research/paper/preregistration.md`, to be filed before the first visit.

## 6. Discussion

**For evaluating twins.** Report the crowd beside random guessing, and individual-level r beside
accuracy.

- On the field's own benchmark, a guess that knows nobody scores 93% of the retest,
  above every released twin.
- "Normalised accuracy" against the retest compares a twin with a noisy witness, not with what is
  knowable. A ceiling estimated from the same retest data puts the target higher
  (0.869 against 0.817 here).

**For building twins.** The bottleneck is not the model; it is the information.

- A 500-question persona carries a few percent of what is knowable about a person's next choice in a
  situation. The persona bound caps every model that reads only it, language model or regression.
- One earlier observation of the person in the same situation carries about half of it. A two-layer
  echo reads that observation against the crowd, and three observations carry about four fifths.
- How much each further observation adds is not a guess. Where a person's own share ρ can be
  measured, the curve the theory draws from pairs alone predicts the second and third look to within
  their intervals (§4.3).
- How knowable a person is depends on the situation: ρ is .08–.16 for moral contrasts of character and
  .40 for humans against pets. A twin promising to know someone in a few visits must be built on
  situations where ρ is not small, and must measure it where it is applied.
- The echo composes with any twin: laid on the released LLM twins it scores
  0.823, from their 0.724.

**For psychology.** The decomposition is old: aggregation, if-then signatures, latent state–trait
models, Kelley's (1927) true-score estimate. What is new here is measuring it at scale against the
systems now built to replace people in research, with every witness on the same answers, and placing
a ceiling above the retest. The persona's poor showing elsewhere is the personality coefficient
(Mischel, 1968) seen from the machine's side.

**Why a world.** If knowing someone takes watching them again in the situations one cares about, the
instrument is a place people come back to. Looks are worth more spread over visits than packed into
one, since two choices in one visit share the visit's mood (§4.3). Such a place sets out comparable situations repeatedly, at
no cost per observation, with the person's consent. Study 3 is the first test of such an instrument.
It also gives the debrief, "who knew you best?", which is the reason a person would come back.

**Limitations.**

- **The stakes.** Twin-2K-500's choices are hypothetical survey answers, and its "deeds elsewhere" are
  survey choices too.
- **The retest sample.** Study 2's behaviour is incentivised, but its retest sample is small.
- **The Moral Machine's people are browsers.** A browser can be several people, and the more a browser
  played, the less it behaves like one person (§4.3). The registered looks curve was therefore a weak
  test; the stronger evidence is exploratory and reported with every panel.
- **The ceiling model.** The knowable ceiling comes from an ordered latent model. It is a model-based
  estimate, though one that reproduced the observed one-look echo to the third decimal. Its interval
  over people is narrow (0.866–0.871), but that
  interval does not cover the choice of model.
- **The LLM twins.** We scored the twins as released, and better prompting may raise them. The persona
  bound says by how little, if the persona is all they read.
- **Study 3** is a pilot among friends.

## Appendix A. Study 1, task by task

The 17 tasks of Twin-2K-500, ordered by retest reliability ρ:

- **ρ and the ceiling** come from the ordered latent model.
- **The accuracies** are observed, forward direction.
- **r** is the individual-level correlation of the twin and of the retest.
- **"Echo, one look"** is the crowd-transition echo.

Two patterns stand out:

- On several tasks the headline twin gives the crowd's answer to almost everyone. It scores exactly
  the crowd's accuracy with r ≈ 0.
- On the framing problem, the sunk-cost task and the Allais problem it falls far below the crowd.

| Task | ρ | Crowd | Headline twin (r) | Retest (r) | Echo, one look | Ceiling |
|---|---|---|---|---|---|---|
| prob matching vs. max | 0.42 | 0.766 | 0.766 (0.00) | 0.744 (0.24) | 0.776 | 0.816 |
| framing problem | 0.48 | 0.814 | 0.717 (−0.03) | 0.803 (0.33) | 0.829 | 0.859 |
| base rate | 0.48 | 0.834 | 0.804 (0.02) | 0.835 (0.31) | 0.862 | 0.883 |
| conjunction problem (Linda) | 0.49 | 0.827 | 0.780 (0.02) | 0.824 (0.38) | 0.850 | 0.875 |
| sunk cost fallacy | 0.54 | 0.782 | 0.688 (−0.01) | 0.788 (0.38) | 0.807 | 0.848 |
| outcome bias | 0.58 | 0.860 | 0.860 (0.02) | 0.863 (0.43) | 0.878 | 0.904 |
| denominator neglect | 0.60 | 0.621 | 0.568 (−0.04) | 0.722 (0.40) | 0.722 | 0.796 |
| Allais | 0.64 | 0.629 | 0.509 (0.00) | 0.741 (0.45) | 0.741 | 0.809 |
| non-separability of risks and benefits | 0.67 | 0.823 | 0.805 (0.08) | 0.863 (0.55) | 0.870 | 0.903 |
| myside | 0.69 | 0.802 | 0.776 (0.17) | 0.846 (0.59) | 0.849 | 0.891 |
| less is more | 0.70 | 0.764 | 0.757 (0.17) | 0.831 (0.59) | 0.833 | 0.879 |
| omission | 0.70 | 0.732 | 0.731 (0.13) | 0.806 (0.58) | 0.809 | 0.860 |
| anchoring and adjustment | 0.71 | 0.786 | 0.673 (0.02) | 0.842 (0.57) | 0.853 | 0.887 |
| absolute vs. relative savings | 0.72 | 0.718 | 0.664 (0.01) | 0.792 (0.50) | 0.792 | 0.850 |
| false consensus | 0.72 | 0.793 | 0.746 (0.28) | 0.861 (0.63) | 0.867 | 0.902 |
| WTA/WTP-Thaler | 0.79 | 0.835 | 0.793 (0.08) | 0.892 (0.64) | 0.891 | 0.923 |
| pricing | 0.87 | 0.559 | 0.669 (0.32) | 0.839 (0.67) | 0.839 | 0.879 |

## References

- Argyle, L. P., Busby, E. C., Fulda, N., Gubler, J. R., Rytting, C., & Wingate, D. (2023). Out of one, many: Using language models to simulate human samples. *Political Analysis, 31*(3), 337–351. https://doi.org/10.1017/pan.2023.2
- Awad, E., Dsouza, S., Kim, R., Schulz, J., Henrich, J., Shariff, A., Bonnefon, J.-F., & Rahwan, I. (2018). The Moral Machine experiment. *Nature, 563*(7729), 59–64. https://doi.org/10.1038/s41586-018-0637-6
- Berg, J., Dickhaut, J., & McCabe, K. (1995). Trust, reciprocity, and social history. *Games and Economic Behavior, 10*(1), 122–142.
- Brown, W. (1910). Some experimental results in the correlation of mental abilities. *British Journal of Psychology, 3*(3), 296–322.
- Dang, J., King, K. M., & Inzlicht, M. (2020). Why are self-report and behavioral measures weakly correlated? *Trends in Cognitive Sciences, 24*(4), 267–269. https://doi.org/10.1016/j.tics.2020.01.007
- Eisenberg, I. W., Bissett, P. G., Enkavi, A. Z., Li, J., MacKinnon, D. P., Marsch, L. A., & Poldrack, R. A. (2019). Uncovering the structure of self-regulation through data-driven ontology discovery. *Nature Communications, 10*, 2319. https://doi.org/10.1038/s41467-019-10301-1
- Enkavi, A. Z., Eisenberg, I. W., Bissett, P. G., Mazza, G. L., MacKinnon, D. P., Marsch, L. A., & Poldrack, R. A. (2019). Large-scale analysis of test–retest reliabilities of self-regulation measures. *PNAS, 116*(12), 5472–5477. https://doi.org/10.1073/pnas.1818430116
- Epstein, S. (1979). The stability of behavior: I. On predicting most of the people much of the time. *Journal of Personality and Social Psychology, 37*(7), 1097–1126.
- Fleeson, W. (2001). Toward a structure- and process-integrated view of personality: Traits as density distributions of states. *Journal of Personality and Social Psychology, 80*(6), 1011–1027.
- Forsythe, R., Horowitz, J. L., Savin, N. E., & Sefton, M. (1994). Fairness in simple bargaining experiments. *Games and Economic Behavior, 6*(3), 347–369.
- Frederick, S., Loewenstein, G., & O'Donoghue, T. (2002). Time discounting and time preference: A critical review. *Journal of Economic Literature, 40*(2), 351–401.
- Frey, R., Pedroni, A., Mata, R., Rieskamp, J., & Hertwig, R. (2017). Risk preference shares the psychometric structure of major psychological traits. *Science Advances, 3*(10), e1701381. https://doi.org/10.1126/sciadv.1701381
- Hedge, C., Powell, G., & Sumner, P. (2018). The reliability paradox: Why robust cognitive tasks do not produce reliable individual differences. *Behavior Research Methods, 50*(3), 1166–1186. https://doi.org/10.3758/s13428-017-0935-1
- Holt, C. A., & Laury, S. K. (2002). Risk aversion and incentive effects. *American Economic Review, 92*(5), 1644–1655.
- Kelley, T. L. (1927). *Interpretation of Educational Measurements.* World Book.
- Mischel, W. (1968). *Personality and Assessment.* Wiley.
- Mischel, W., & Shoda, Y. (1995). A cognitive-affective system theory of personality. *Psychological Review, 102*(2), 246–268.
- Murphy, A. H. (1992). Climatology, persistence, and their linear combination as standards of reference in skill scores. *Weather and Forecasting, 7*(4), 692–698. https://doi.org/10.1175/1520-0434(1992)007<0692:CPATLC>2.0.CO;2
- Ouellette, J. A., & Wood, W. (1998). Habit and intention in everyday life: The multiple processes by which past behavior predicts future behavior. *Psychological Bulletin, 124*(1), 54–74. https://doi.org/10.1037/0033-2909.124.1.54
- Park, J. S., Zou, C. Q., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Willer, R., Liang, P., & Bernstein, M. S. (2024). Generative agent simulations of 1,000 people. arXiv:2411.10109.
- Peng, T., Gui, G., Brucks, M., Merlau, D. J., Fan, G. J., Ben Sliman, M., Johnson, E. J., et al. (2026). Digital twins as funhouse mirrors: Five key distortions. arXiv:2509.19088.
- Sheeran, P. (2002). Intention–behavior relations: A conceptual and empirical review. *European Review of Social Psychology, 12*(1), 1–36. https://doi.org/10.1080/14792772143000003
- Spearman, C. (1910). Correlation calculated from faulty data. *British Journal of Psychology, 3*(3), 271–295.
- Toubia, O., Gui, G. Z., Peng, T., Merlau, D. J., Li, A., & Chen, H. (2025). Twin-2K-500: A data set for building digital twins of over 2,000 people based on their answers to over 500 questions. *Marketing Science, 44*(6), 1446–1455. https://doi.org/10.1287/mksc.2025.0262
- Wang, Hunt, Tang, & Joseph (2026). When can LLM digital twins reduce human measurement? From behavioral fidelity to statistical substitutability. arXiv:2609.07987.
- Wilson, R. C., Geana, A., White, J. M., Ludvig, E. A., & Cohen, J. D. (2014). Humans use directed and random exploration to solve the explore–exploit dilemma. *Journal of Experimental Psychology: General, 143*(6), 2074–2081.
- Youyou, W., Kosinski, M., & Stillwell, D. (2015). Computer-based personality judgments are more accurate than those made by humans. *PNAS, 112*(4), 1036–1040. https://doi.org/10.1073/pnas.1418680112
