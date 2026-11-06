# Who Knows You Best? The Crowd, the Persona, and One Look at What You Did

*Draft, {{date}}. Artun Balta. Studies 1 and 2 are pre-registered secondary analyses of public data;
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

**Study 1: Twin-2K-500**, pre-registered. There are {{f:t1.people:,d}} US adults and {{f:t1.tasks:d}}
retested tasks.

- **The crowd beats every twin.** The crowd's median answer, which knows nobody, is more accurate than
  every one of {{f:t1.llm.specs:d}} released LLM twins, by {{f:t1.llm.delta_best:pts}} to
  {{f:t1.llm.delta_worst:pts}} points on the benchmark's own metric.
- **A regression knows individuals better than the twins.** Ridge regression on the same 500-question
  persona puts people in order about twice as well as the twins (r = {{f:t1.persona.r:r2}} against
  {{f:t1.llm_headline.r:r2}}).
- **One look knows them better still.** One earlier answer to the same question reaches r =
  {{f:t1.again.r:r2}}, on all {{f:t1.tasks:d}} tasks.
- **The echo beats the retest.** A two-layer echo that reads that one answer against the crowd
  outscores the retest: {{f:t1.echo.acc:.3f}} against {{f:t1.again.acc:.3f}}, as registered.
- **Its simplest form lands on the theory.** Exploratory, it scores {{f:t1.echo_transition.acc:.3f}},
  the theory's one-look optimum ({{f:t1.model.looks1:.3f}}). The knowable ceiling is
  {{f:t1.model.ceiling:.3f}} ({{f:t1.model.ceiling.lo:.3f}}–{{f:t1.model.ceiling.hi:.3f}}).

**Study 2: the Basel–Berlin Risk Study.** The behaviour here is incentivised and retested six months
later.

- **Copying loses to the crowd.** Copying a person's earlier behaviour is worse than knowing nobody on
  all {{f:t2.low.n:d}} tasks that are less than half steady. Mean skill is
  {{f:t2.mean.copy:+.2f}}, as 2ρ − 1 says (r = {{f:t2.copy_theory_corr:r2}} across tasks).
- **Self-reports barely register:** {{f:t2.mean.words:+.2f}}.
- **The echo is the best witness.** The same one observation, read by the echo, scores
  {{f:t2.mean.echo:+.2f}}.

**The same laws across {{f:t3.deeds.n:d}} behavioural measures** (Self-Regulation Ontology, also
pre-registered):

- copying loses to the crowd on {{f:t3.deeds.low_negative:d}} of the {{f:t3.deeds.low:d}} measures less
  than half steady;
- the echo beats copying on {{f:t3.deeds.echo_beats:d}} of {{f:t3.deeds.n:d}} and tracks ρ²
  (r = {{f:t3.deeds.echo_rho2_corr:r2}});
- self-reports know nothing of behaviour ({{f:t3.deeds.mean.words:+.3f}}).

**How fast a person becomes knowable: the Moral Machine** (pre-registered). It has
{{f:t4.dilemmas:,d}} moral dilemmas from {{f:t4.people:,d}} browsers, many of them seen in many visits.

- **The two laws again.** Copying another visit scores 2ρ − 1, and one look ρ², in all six contrasts.
- **One visit knows more than the whole survey**, country included, in {{f:t4.m3.beats:d}} of 6.
- **The looks curve holds as registered, and exploratory panels show where.**
  - On everyone with four visits or more, the curve the theory draws from pairs alone puts all
    {{f:t4.x3.points:d}} points within their 95% intervals.
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

Twin-2K-500 (Toubia et al., 2025) surveyed {{f:t1.people:,d}} US adults in four waves.

- **Waves 1–3: the persona.** These waves built the persona:
  - demographics;
  - some 280 self-description items: the Big Five, values, needs, symptoms, spending style;
  - cognitive tests;
  - economic choices: ultimatum, dictator and trust games, and risk and time price lists, all
    hypothetical.
- **Waves 1–3, outside the persona.** The same waves also included {{f:t1.tasks:d}} tasks outside the
  persona: heuristics-and-biases experiments, 40 purchase decisions, and policy views with estimates
  of others' views.
- **Wave 4.** Two weeks after wave 3, the same {{f:t1.tasks:d}} tasks were repeated: {{f:t1.columns:d}}
  scored columns.
- **The twins.** The release includes, per person, the wave-4 answers of the authors' LLM twins. There
  are {{f:t1.llm.specs:d}} specifications: GPT-4.1, GPT-4.1-mini, Gemini 2.5 Flash and a fine-tuned
  GPT-4.1-mini, in text, JSON and summary personas, plus one given demographics only. Each was given
  the persona and not the tasks' earlier answers.

**Registration.** We registered the analysis before fitting any model (`research/deeds/PREREG.md`).
The registration discloses what we had seen: the released evaluation sheets, which already showed the
twins' low per-task correlations.

**Primary setting: forward.** Wave 4 is the truth; every witness uses waves 1–3 only. The authors' own
direction, with the truth in waves 1–3, gives the same picture (§3.4).

**Scoring.** We reproduce the authors' metric to the digit: retest {{f:t1.again.acc:.4f}} (their
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
scores {{f:t1.base.acc:.3f}}. By the field's yardstick that is {{f:t1.base.norm:%}} of the retest. The
headline twin scores {{f:t1.llm_headline.acc:.3f}} ({{f:t1.llm_headline.norm:%}}).

Scored on the people each twin answered, every one of the {{f:t1.llm.specs:d}} specifications is
below the crowd. The gaps run from {{f:t1.llm.delta_best:+.3f}} for the most favourable
({{f:t1.llm.best.name:s}}; 95% CI {{f:t1.llm.best.lo:+.3f}} to {{f:t1.llm.best.hi:+.3f}}) to
{{f:t1.llm.delta_worst:+.3f}}.

The registered test, which scores a twin's missing answers as the crowd's, gives
{{f:t1.H1.delta:+.3f}} [{{f:t1.H1.lo:+.3f}}, {{f:t1.H1.hi:+.3f}}].

The persona itself has nothing to add to accuracy. A gradient-boosted model of the persona that aims at
the metric's own optimum, the conditional median, scores {{f:t1.persona_hgb.acc:.4f}}. That is the
crowd's {{f:t1.base.acc:.4f}} to the fourth decimal. The twins fall below even that.

<!-- figure:individuals -->

**H2. A regression knows individuals better than the twins, on the twins' own information.** The ridge
on the persona reaches r = {{f:t1.persona.r:r3}} ({{f:t1.persona.rs:r3}} as a continuous score).
Against it:

- the headline twin reaches {{f:t1.llm_headline.r:r3}};
- the best of the persona twins reaches {{f:t1.llm.r_best:r3}};
- the twins' average, as a score, reaches {{f:t1.llm_mean.rs:r3}}.

The regression wins on {{f:t1.llm.persona_wins_min:d}}–{{f:t1.llm.persona_wins_max:d}} of
{{f:t1.tasks:d}} tasks against each twin (registered sign test against the most favourable, Holm-adjusted
p = {{f:t1.H2.p:p}}).

**H3. The same situation, once, outweighs everything else.** The person's own earlier answer to the same
question reaches r = {{f:t1.again.r:r3}}. Everything in the persona together with their earlier answers
to the other sixteen tasks reaches {{f:t1.persona_others.r:r3}} ({{f:t1.persona_others.rs:r3}} as a
score). The single answer is ahead on {{f:t1.H3.wins:d}} of {{f:t1.H3.of:d}} tasks.

**H4. The retest is not a ceiling.** The registered two-layer echo scores {{f:t1.echo.acc:.4f}} against
the retest's {{f:t1.again.acc:.4f}}: Δ = {{f:t1.H4.delta:+.4f}}, 95% CI [{{f:t1.H4.lo:+.4f}},
{{f:t1.H4.hi:+.4f}}], normalised accuracy {{f:t1.echo.norm:.3f}}.

An exploratory echo needs no persona and no linear stacker. It learns, from other people, what the
crowd answered the second time given what it answered the first. It scores
{{f:t1.echo_transition.acc:.4f}}. That is the ordered latent model's one-look optimum,
{{f:t1.model.looks1:.4f}}, predicted before it was computed.

The echo laid on the released twins' average, instead of the regression, scores
{{f:t1.echo_llm.acc:.4f}}. So the second layer upgrades any twin.

<!-- figure:looks -->

**What is knowable.** The latent model puts the knowable ceiling at {{f:t1.model.ceiling:.3f}}
(95% interval {{f:t1.model.ceiling.lo:.3f}}–{{f:t1.model.ceiling.hi:.3f}}), and the Bayes-optimal echo
at {{f:t1.model.looks3:.3f}} after three looks and {{f:t1.model.looks8:.3f}} after eight. The interval
comes from {{f:t1.boot.draws:d}} bootstrap draws of people. Each draw refits every column's answer
shares and ρ, and rescores the witnesses on the same people. In the personal knowledge index:

| Witness | Share of the knowable it knows | 95% interval |
|---|---|---|
| The headline twin | {{f:t1.know.llm_headline:%}} | {{f:t1.know.llm_headline.lo:%}} to {{f:t1.know.llm_headline.hi:%}} |
| The person's own retest | {{f:t1.know.again:%}} | {{f:t1.know.again.lo:%}} to {{f:t1.know.again.hi:%}} |
| The registered echo | {{f:t1.know.echo:%}} | {{f:t1.know.echo.lo:%}} to {{f:t1.know.echo.hi:%}} |
| The transition echo | {{f:t1.know.echo_transition:%}} | {{f:t1.know.echo_transition.lo:%}} to {{f:t1.know.echo_transition.hi:%}} |
| Three looks (model) | {{f:t1.know.looks3:%}} | model |
| Eight looks (model) | {{f:t1.know.looks8:%}} | model |

The intervals do not overlap: the registered echo knows more than the retest, and the transition echo
more than both.

**Prediction 2, per task.** Copying the earlier answer beats the crowd where the task is more than
half steady (ρ > ½) and not below. This holds on {{f:t1.half.agree:d}} of {{f:t1.half.of:d}} tasks,
and the two misses sit at ρ ≈ .49 with gaps of a few thousandths. Across tasks, retest-minus-crowd
correlates with ρ at r = {{f:t1.half.corr:r2}}.

- On the framing problem the crowd ({{f:t1.framing.base:.3f}}) beats the person's own retest
  ({{f:t1.framing.retest:.3f}}).
- On probability matching it does so by more ({{f:t1.probmatch.base:.3f}} against
  {{f:t1.probmatch.retest:.3f}}).
- On pricing, the most steady task (ρ = {{f:t1.pricing.rho:.2f}}), the crowd knows little
  ({{f:t1.pricing.base:.3f}}) and the person almost everything (ceiling {{f:t1.pricing.ceiling:.3f}}).

**H5 (exploratory). Words and deeds elsewhere.**

- Self-descriptions and demographics ("words") reach r = {{f:t1.words.r:r3}}.
- Economic choices and cognitive tests ("deeds", other situations) reach {{f:t1.deeds.r:r3}}.
- The difference, deeds minus words, is {{f:t1.H5.lo:+.3f}} to {{f:t1.H5.hi:+.3f}}.

So deeds *elsewhere* are no better than words here; several targets are attitudes, which words carry.
The contrast that matters is not words against deeds but **elsewhere against again**.

**H6 (descriptive).** The closed form π + (ρ − π)² / (1 − π) predicts the echo's r² per column with
correlation {{f:t1.H6.corr:.3f}} and mean absolute error {{f:t1.H6.mad:.3f}}. Because π is small, this
check is weakly discriminating; Study 2's copy-against-echo contrast is the sharper test.

### 3.3 The exchange rate

<!-- figure:exchange -->

How many questions from each pool does it take to know the person as well as one earlier answer to
the same question? We drew k items at random from each pool, 20 times per k, and fitted the ridge on
them. No pool comes near at any size the persona holds:

- self-descriptions reach r = {{f:t1.ex.self.max_r:r3}} with {{f:t1.ex.self.max_k:d}} items;
- the other tasks' answers reach {{f:t1.ex.others.max_r:r3}} with {{f:t1.ex.others.max_k:d}};
- one earlier answer to the same question reaches {{f:t1.again.r:r3}}.

### 3.4 Robustness

- **The authors' direction** (truth in waves 1–3; the retest from wave 4):
  - the crowd scores {{f:t1.pub.base.acc:.3f}} ({{f:t1.pub.base.norm:%}} of the retest);
  - the headline twin scores {{f:t1.pub.llm_headline.acc:.3f}} ({{f:t1.pub.llm_headline.norm:%}});
  - the transition echo scores {{f:t1.pub.echo_transition.acc:.3f}}, against the retest's
    {{f:t1.pub.again.acc:.3f}}.
  - The registered persona echo does not beat the retest there: Δ = {{f:t1.pub.H4.delta:+.4f}},
    p = {{f:t1.pub.H4.p:p}}.
- **Without the anchoring tasks**, whose free numbers the metric bins into deciles:
  - the crowd {{f:t1.rob.no_anchoring.base.acc:.3f}};
  - the twin {{f:t1.rob.no_anchoring.llm_headline.acc:.3f}};
  - the retest {{f:t1.rob.no_anchoring.again.acc:.3f}};
  - the echo {{f:t1.rob.no_anchoring.echo.acc:.3f}}.
- **Within-subject tasks only:**
  - the crowd {{f:t1.rob.within_only.base.acc:.3f}};
  - the twin {{f:t1.rob.within_only.llm_headline.acc:.3f}} (r {{f:t1.rob.within_only.llm_headline.r:r3}});
  - the retest {{f:t1.rob.within_only.again.acc:.3f}};
  - the echo {{f:t1.rob.within_only.echo.acc:.3f}}.
- **A boosted median model in place of ridge** (registered): it scores {{f:t1.persona_hgb.acc:.3f}},
  which is the crowd's accuracy, with r = {{f:t1.persona_hgb.r:r3}}.
- **Deviations from the registration** are reported in `research/deeds/README.md`:
  - The release has 13 distinct twin specifications, not the 11 counted.
  - Partially covering twins are also scored on the people they answered.
  - The transition echo and the per-task ρ > ½ test are exploratory.

## 4. Study 2: incentivised behaviour (Basel–Berlin Risk Study, pre-registered)

Twin-2K-500's choices are hypothetical. The Basel–Berlin Risk Study (Frey et al., 2017) measured risk
taking with seven behavioural tasks, six of them incentivised, plus self-reported risk, impulsivity and
sensation-seeking scales. Of its 1,507 participants, {{f:t2.n_min:d}}–{{f:t2.n_max:d}} came back about six
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

**Results.** The tasks' retest r runs from {{f:t2.rho.min:.2f}} to {{f:t2.rho.max:.2f}}.

- **B1: copying loses to the crowd below half.** It does on all {{f:t2.low.n:d}} tasks below
  ρ = ½, and its skill tracks 2ρ − 1 (r = {{f:t2.copy_theory_corr:r2}}, mean absolute deviation
  {{f:t2.copy_theory_mad:.3f}}). Mean skill of copying is {{f:t2.mean.copy:+.3f}}. On decisions from
  description (ρ = {{f:t2.description.rho:.2f}}), copying scores {{f:t2.description.copy:+.2f}}.
- **B2: the echo never loses to the crowd and always beats copying.** It beats copying on
  {{f:t2.echo_beats_copy:d}} of {{f:t2.tasks:d}} tasks, and is above zero on
  {{f:t2.echo_positive:d}}. The exception is decisions from experience, a task with no retest
  reliability at all (ρ = {{f:t2.experience.rho:.3f}}), where the echo scores
  {{f:t2.experience.echo:+.3f}}.
- **B3: words know little.** Mean skill of words is {{f:t2.mean.words:+.3f}}, of other tasks
  {{f:t2.mean.elsewhere:+.3f}}, and of both {{f:t2.mean.persona:+.3f}}. The echo's is
  {{f:t2.mean.echo:+.3f}}. The words themselves are reliable (retest r {{f:t2.words_retest.min:.2f}}–{{f:t2.words_retest.max:.2f}}).
  They are reliable about words, not about deeds.
- **B4: the observed echo against the theory.** On average it falls {{f:t2.echo_theory_bias:abs3}}
  short of the theory's population optimum. That is the price of fitting three weights on about 170
  people.

### 4.2 The same laws across {{f:t3.deeds.n:d}} measures (Self-Regulation Ontology, pre-registered)

Two studies give a handful of tasks; the laws should hold across the whole range of reliabilities. The
Self-Regulation Ontology (Eisenberg et al., 2019; Enkavi et al., 2019) gave 522 people 37 tasks and 22
self-report surveys. It retested 150 of them about four months later, on everything.

**Words and deeds.** We classed measures by what they record, before computing any relationship
(`PREREG-SRO.md`):

- **{{f:t3.deeds.n:d}} deeds**: task scores, and the two forms that record choices or performance;
- **{{f:t3.words.n:d}} words**: survey scores.

**Witnesses.** As in §4.

<!-- figure:laws -->

**Results for deeds** (median ρ = {{f:t3.deeds.median_rho:.2f}}):

- **Copying** loses to the crowd on {{f:t3.deeds.low_negative:d}} of the {{f:t3.deeds.low:d}} measures
  that are less than half steady. Its skill tracks 2ρ − 1 (r = {{f:t3.deeds.copy_corr:r2}}). We had
  registered a correlation above .9; this falls short of it, mostly through heavy-tailed measures far
  below the line.
- **The echo without a persona** beats copying on {{f:t3.deeds.echo_beats:d}} of {{f:t3.deeds.n:d}},
  by {{f:t3.deeds.diff:+.2f}} on average (95% CI {{f:t3.deeds.diff_lo:+.2f}} to
  {{f:t3.deeds.diff_hi:+.2f}}, with the variance held at the full sample's; the registered
  per-resample interval is unstable on heavy-tailed measures). Its skill tracks ρ²
  (r = {{f:t3.deeds.echo_rho2_corr:r2}}).
- **Mean skills:**

| Witness | Mean skill |
|---|---|
| words | {{f:t3.deeds.mean.words:+.3f}} |
| other tasks | {{f:t3.deeds.mean.elsewhere:+.3f}} |
| copying | {{f:t3.deeds.mean.copy:+.3f}} |
| echo | {{f:t3.deeds.mean.echo:+.3f}} |

**The mirror image.** With the surveys as targets (median ρ = {{f:t3.words.median_rho:.2f}}):

| Witness | Mean skill |
|---|---|
| other surveys | {{f:t3.words.mean.words:+.3f}} |
| the deeds | {{f:t3.words.mean.elsewhere:+.3f}} |
| copying | {{f:t3.words.mean.copy:+.3f}} |
| echo | {{f:t3.words.mean.echo:+.3f}} |

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

Many people played more than one session. The released data hold {{f:t4.dilemmas:,d}} such dilemmas,
from {{f:t4.people:,d}} browsers in {{f:t4.sessions:,d}} sessions. A browser stands for a person here,
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
choice is mostly the moment. ρ̂ is {{f:t4.m2.fitness.rho:.2f}} to {{f:t4.m2.age.rho:.2f}} for the five
contrasts of character, and {{f:t4.m2.species.rho:.2f}} for humans against pets. Copying the person's
other visit therefore loses to the crowd, and by 2ρ̂ − 1:

| Contrast | People | ρ̂ | Copy | 2ρ̂ − 1 | One look | ρ̂² |
|---|---|---|---|---|---|---|
| more lives | {{f:t4.m2.util.people:,d}} | {{f:t4.m2.util.rho:.3f}} | {{f:t4.m2.util.copy:+.3f}} | {{f:t4.m2.util.theory:+.3f}} | {{f:t4.m2.util.echo1:.4f}} | {{f:t4.m2.util.echo1_theory:.4f}} |
| men over women | {{f:t4.m2.gender.people:,d}} | {{f:t4.m2.gender.rho:.3f}} | {{f:t4.m2.gender.copy:+.3f}} | {{f:t4.m2.gender.theory:+.3f}} | {{f:t4.m2.gender.echo1:.4f}} | {{f:t4.m2.gender.echo1_theory:.4f}} |
| fit over large | {{f:t4.m2.fitness.people:,d}} | {{f:t4.m2.fitness.rho:.3f}} | {{f:t4.m2.fitness.copy:+.3f}} | {{f:t4.m2.fitness.theory:+.3f}} | {{f:t4.m2.fitness.echo1:.4f}} | {{f:t4.m2.fitness.echo1_theory:.4f}} |
| young over old | {{f:t4.m2.age.people:,d}} | {{f:t4.m2.age.rho:.3f}} | {{f:t4.m2.age.copy:+.3f}} | {{f:t4.m2.age.theory:+.3f}} | {{f:t4.m2.age.echo1:.4f}} | {{f:t4.m2.age.echo1_theory:.4f}} |
| high status over low | {{f:t4.m2.status.people:,d}} | {{f:t4.m2.status.rho:.3f}} | {{f:t4.m2.status.copy:+.3f}} | {{f:t4.m2.status.theory:+.3f}} | {{f:t4.m2.status.echo1:.4f}} | {{f:t4.m2.status.echo1_theory:.4f}} |
| humans over pets | {{f:t4.m2.species.people:,d}} | {{f:t4.m2.species.rho:.3f}} | {{f:t4.m2.species.copy:+.3f}} | {{f:t4.m2.species.theory:+.3f}} | {{f:t4.m2.species.echo1:.4f}} | {{f:t4.m2.species.echo1_theory:.4f}} |

- **Copying.** The registered test asked for the sign and a gap under .03. It holds in
  {{f:t4.m2.holds:d}} of 6, and the largest gap is in the third decimal.
- **One look.** The echo after one look scores ρ̂² to within a few ten-thousandths.
- **Copying the raw choice** is worse still, since it carries the other visit's situation along. It
  ranges from {{f:t4.m2.species.raw:+.2f}} to {{f:t4.m2.fitness.raw:+.2f}}.

**One visit against the whole survey (M3).** {{f:t4.survey:,d}} people also answered the site's
survey: their age, gender, education and income, a political and a religious slider, and their
country. Among those with two visits, a ridge regression on all of it, fitted on other people, knows
less than one visit in {{f:t4.m3.beats:d}} of 6 contrasts:

| Contrast | People | Survey | One visit | Both |
|---|---|---|---|---|
| more lives | {{f:t4.m3.util.people:,d}} | {{f:t4.m3.util.persona:+.3f}} | {{f:t4.m3.util.echo1:.3f}} | {{f:t4.m3.util.both:.3f}} |
| men over women | {{f:t4.m3.gender.people:,d}} | {{f:t4.m3.gender.persona:+.3f}} | {{f:t4.m3.gender.echo1:.3f}} | {{f:t4.m3.gender.both:.3f}} |
| fit over large | {{f:t4.m3.fitness.people:,d}} | {{f:t4.m3.fitness.persona:+.3f}} | {{f:t4.m3.fitness.echo1:.3f}} | {{f:t4.m3.fitness.both:.3f}} |
| young over old | {{f:t4.m3.age.people:,d}} | {{f:t4.m3.age.persona:+.3f}} | {{f:t4.m3.age.echo1:.3f}} | {{f:t4.m3.age.both:.3f}} |
| high status over low | {{f:t4.m3.status.people:,d}} | {{f:t4.m3.status.persona:+.3f}} | {{f:t4.m3.status.echo1:.3f}} | {{f:t4.m3.status.both:.3f}} |
| humans over pets | {{f:t4.m3.species.people:,d}} | {{f:t4.m3.species.persona:+.3f}} | {{f:t4.m3.species.echo1:.3f}} | {{f:t4.m3.species.both:.3f}} |

- **The registered gap.** The mean gap is {{f:t4.m3.gap:.3f}} ({{f:t4.m3.gap.lo:.3f}}–{{f:t4.m3.gap.hi:.3f}}),
  as registered.
- **Where the survey knows most.** It is humans against pets, at {{f:t4.m3.species.persona:.3f}}. One
  visit knows {{f:t4.m3.species.echo1:.3f}} there.

**The visit is a unit (M4).** Two dilemmas of a kind in the same visit agree more than two from
different visits:

| Contrast | Within a visit | Across visits | Visits for 80% of the knowable | Country crowd | One visit |
|---|---|---|---|---|---|
| more lives | {{f:t4.m4.util.within:.2f}} | {{f:t4.m4.util.across:.2f}} | {{f:t4.m4.util.n80:.0f}} | {{f:t4.m4.util.country:+.4f}} | {{f:t4.m2.util.echo1:.4f}} |
| men over women | {{f:t4.m4.gender.within:.2f}} | {{f:t4.m4.gender.across:.2f}} | {{f:t4.m4.gender.n80:.0f}} | {{f:t4.m4.gender.country:+.4f}} | {{f:t4.m2.gender.echo1:.4f}} |
| fit over large | {{f:t4.m4.fitness.within:.2f}} | {{f:t4.m4.fitness.across:.2f}} | {{f:t4.m4.fitness.n80:.0f}} | {{f:t4.m4.fitness.country:+.4f}} | {{f:t4.m2.fitness.echo1:.4f}} |
| young over old | {{f:t4.m4.age.within:.2f}} | {{f:t4.m4.age.across:.2f}} | {{f:t4.m4.age.n80:.0f}} | {{f:t4.m4.age.country:+.4f}} | {{f:t4.m2.age.echo1:.4f}} |
| high status over low | {{f:t4.m4.status.within:.2f}} | {{f:t4.m4.status.across:.2f}} | {{f:t4.m4.status.n80:.0f}} | {{f:t4.m4.status.country:+.4f}} | {{f:t4.m2.status.echo1:.4f}} |
| humans over pets | {{f:t4.m4.species.within:.2f}} | {{f:t4.m4.species.across:.2f}} | {{f:t4.m4.species.n80:.0f}} | {{f:t4.m4.species.country:+.4f}} | {{f:t4.m2.species.echo1:.4f}} |

Country, the variable this dataset is famous for, is in the table's last two columns. A crowd that
knows each person's country, shrunk toward the world's, gains {{f:t4.m4.fitness.country:+.3f}} to
{{f:t4.m4.species.country:+.3f}}: between an eighth and about half of what one visit gains.

Part of what the theory calls the day is the visit. Part of the gap, though, is browsers that are
more than one person (below). Among browsers whose stated person never changes, two dilemmas in one
visit still agree {{f:t4.p.same.ratio_min:.1f}}–{{f:t4.p.same.ratio_max:.1f}} times as much as two from different
visits, against {{f:t4.p.mixed.ratio_min:.1f}}–{{f:t4.p.mixed.ratio_max:.1f}} times among browsers whose stated person
changes. Looks are worth more spread over visits than packed into one, which is how ECHO's pilot is
built. The knowable is small here, ρ̂ itself, so 80% of
it takes six visits for humans against pets and twenty or more for the rest.

**The looks curve as registered (M1).** The registered panel is the browsers with more than K visits,
K = {{f:t4.m1.util.k:d}} for five contrasts and {{f:t4.m1.status.k:d}} for status:
{{f:t4.m1.status.people:,d}}–{{f:t4.m1.species.people:,d}} browsers per contrast. By the registered criterion the
curve holds. Across the {{f:t4.m1.points:d}} (contrast, n) points, measured and predicted skill
correlate at r = {{f:t4.m1.corr:.3f}}, with a mean gap of {{f:t4.m1.mad:.4f}} (registered:
above .95 and below .01).

The panel is a poor place to test it, though, and we say so:

- **Barely self-consistent.** Browsers that played 21 times or more agree with themselves little
  (ρ̂ {{f:t4.m1.gender.rho:.3f}}–{{f:t4.m1.species.rho:.3f}}, against {{f:t4.m2.fitness.rho:.2f}}–{{f:t4.m2.species.rho:.2f}}
  among everyone with two visits). Shared machines would do that.
- **Noisy where it is near zero.** ρ̂ there is about as noisy as it is large, so for five contrasts the
  curve hugs zero and the criterion is easy to meet.
- **Humans against pets carries signal.** The measured curve rises from
  {{f:t4.m1.species.obs1:.4f}} at one visit to {{f:t4.m1.species.obsK:.4f}} at twenty
  ({{f:t4.m1.species.obsK.lo:.4f}}–{{f:t4.m1.species.obsK.hi:.4f}}). The theory, from pairs alone, said
  {{f:t4.m1.species.pred1:.4f}} and {{f:t4.m1.species.predK:.4f}}.
- **Where ρ̂ is near zero,** the measured curve sits below the theory's. A κ set from a noisy ρ̂ does
  worse than the theory, which assumes ρ known, and averaging the theory over noisy ρ̂ (Jensen's
  inequality) inflates it.

**The looks curve, exploratory.** The registered panel asked for more than twenty visits. The curve
can also be measured on everyone with more than K visits for smaller K, where browsers are many and
ρ̂ is precise. This is not registered, and it is reported as such. Each cell counts the predicted
points that lie inside their measured 95% interval:

| Contrast | More than 3 visits | More than 6 | More than 10 | More than 20 (registered) |
|---|---|---|---|---|
| more lives | {{f:t4.x3.util.inside:d}}/3 | {{f:t4.x6.util.inside:d}}/6 | {{f:t4.x10.util.inside:d}}/10 | {{f:t4.m1.util.inside:d}}/{{f:t4.m1.util.k:d}} |
| men over women | {{f:t4.x3.gender.inside:d}}/3 | {{f:t4.x6.gender.inside:d}}/6 | {{f:t4.x10.gender.inside:d}}/10 | {{f:t4.m1.gender.inside:d}}/{{f:t4.m1.gender.k:d}} |
| fit over large | {{f:t4.x3.fitness.inside:d}}/3 | {{f:t4.x6.fitness.inside:d}}/6 | {{f:t4.x10.fitness.inside:d}}/10 | {{f:t4.m1.fitness.inside:d}}/{{f:t4.m1.fitness.k:d}} |
| young over old | {{f:t4.x3.age.inside:d}}/3 | {{f:t4.x6.age.inside:d}}/6 | {{f:t4.x10.age.inside:d}}/10 | {{f:t4.m1.age.inside:d}}/{{f:t4.m1.age.k:d}} |
| high status over low | {{f:t4.x3.status.inside:d}}/3 | {{f:t4.x6.status.inside:d}}/6 | {{f:t4.x10.status.inside:d}}/10 | {{f:t4.m1.status.inside:d}}/{{f:t4.m1.status.k:d}} |
| humans over pets | {{f:t4.x3.species.inside:d}}/3 | {{f:t4.x6.species.inside:d}}/6 | {{f:t4.x10.species.inside:d}}/10 | {{f:t4.m1.species.inside:d}}/{{f:t4.m1.species.k:d}} |
| browsers per contrast | {{f:t4.x3.people_min:,d}}–{{f:t4.x3.people_max:,d}} | {{f:t4.x6.people_min:,d}}–{{f:t4.x6.people_max:,d}} | {{f:t4.x10.people_min:,d}}–{{f:t4.x10.people_max:,d}} | {{f:t4.m1.people_min:,d}}–{{f:t4.m1.people_max:,d}} |
| all points (r, mean gap) | {{f:t4.x3.inside:d}}/{{f:t4.x3.points:d}} ({{f:t4.x3.corr:.5f}}, {{f:t4.x3.mad:.4f}}) | {{f:t4.x6.inside:d}}/{{f:t4.x6.points:d}} ({{f:t4.x6.corr:.5f}}, {{f:t4.x6.mad:.4f}}) | {{f:t4.x10.inside:d}}/{{f:t4.x10.points:d}} ({{f:t4.x10.corr:.3f}}, {{f:t4.x10.mad:.4f}}) | {{f:t4.m1.inside:d}}/{{f:t4.m1.points:d}} ({{f:t4.m1.corr:.3f}}, {{f:t4.m1.mad:.4f}}) |

- **Where ρ̂ is measured on many people, the curve lands.** At four visits or more, all
  {{f:t4.x3.points:d}} points do. For humans against pets the measured skill is
  {{f:t4.x3.species.obs1:.3f}}, {{f:t4.x3.species.obs2:.3f}} and {{f:t4.x3.species.obs3:.3f}} after one, two and
  three visits. The theory, from pairs alone, said {{f:t4.x3.species.pred1:.3f}},
  {{f:t4.x3.species.pred2:.3f}} and {{f:t4.x3.species.pred3:.3f}}.
- **Humans against pets lands in every panel.** It is the contrast where people differ most, and every
  point of every panel lies inside its interval, out to twenty visits in the registered one.
- **Where ρ̂ is near zero, the curve misses.** In the heaviest panels the other contrasts have ρ̂ of .01
  to .04, about as noisy as it is large, and most of their points miss.
- **The more a browser played, the less it is one person.** For humans against pets, ρ̂ falls with
  the number of visits the panel asks for:

  | Panel | ρ̂ |
  |---|---|
  | two visits or more | {{f:t4.m2.species.rho:.2f}} |
  | 4 or more | {{f:t4.x3.species.rho:.2f}} |
  | 7 or more | {{f:t4.x6.species.rho:.2f}} |
  | 11 or more | {{f:t4.x10.species.rho:.2f}} |
  | 21 or more | {{f:t4.m1.species.rho:.2f}} |

  Shared machines would do that, and so would people trying the answers out.

**Is a browser one person?** This check is exploratory. The site's survey asks for age, gender and
education after each session. Among the {{f:t4.p.two_surveyed:,d}} browsers that answered it at least
twice, {{f:t4.p.changed:%}} report a different person at some point: an age more than a year apart, or
another gender or education.

- **Not the whole story of the fall in ρ̂.** That share rises only from {{f:t4.p.changed_2:%}} at two
  sessions to about {{f:t4.p.changed_7_20:%}} at seven to twenty. So shared machines are common, but they
  do not by themselves explain the steep fall in ρ̂ with visits. People trying the answers out remain
  a candidate.
- **The copy law's sign turns where the theory says it should.** Among the
  {{f:t4.p.same.browsers:,d}} browsers whose stated person never changes, ρ̂ is higher in every contrast.
  For humans against pets it is {{f:t4.p.same.species.rho:.2f}}, above one half. There, copying the other
  visit beats the crowd ({{f:t4.p.same.species.copy:+.3f}}), as 2ρ̂ − 1 says ({{f:t4.p.same.species.theory:+.3f}}).
  Among browsers whose stated person changes, ρ̂ is {{f:t4.p.mixed.species.rho:.2f}} and copying loses
  ({{f:t4.p.mixed.species.copy:+.3f}} against {{f:t4.p.mixed.species.theory:+.3f}}).

The theory does not need ρ to be the same in every panel or every group. It needs ρ to be measured
where it is applied, and that is what the debrief and the pilot do.

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

**Simulation and power** ({{reps}} simulated groups of {{n}}, grounded in published ranges). When the
situation comes again:

- the two-layer echo reaches a skill of {{again:echo_2l}} over the base rate;
- friends reach {{again:friends}};
- the person's own words reach {{again:self}};
- a one-layer, trait-only echo reaches {{again:echo_axes}};
- copying the first visit reaches {{again:retest}}.

The echo matches the friends after a median of {{cross:friends}} minutes of play. In a situation never
seen, words and friends ({{elsewhere:self}}, {{elsewhere:friends}}) beat the echo
({{elsewhere:echo_2l}}), as Study 1's elsewhere results lead one to expect.

The central test (two layers against one) has power {{power:16:again:echo_2l>echo_axes}} at 16
friends with two visits. It has {{power3:20:again:echo_2l>echo_axes}} at 20 friends with three.

<!-- figure:curve -->

**Registration.** `research/paper/preregistration.md`, to be filed before the first visit.

## 6. Discussion

**For evaluating twins.** Report the crowd beside random guessing, and individual-level r beside
accuracy.

- On the field's own benchmark, a guess that knows nobody scores {{f:t1.base.norm:%}} of the retest,
  above every released twin.
- "Normalised accuracy" against the retest compares a twin with a noisy witness, not with what is
  knowable. A ceiling estimated from the same retest data puts the target higher
  ({{f:t1.model.ceiling:.3f}} against {{f:t1.again.acc:.3f}} here).

**For building twins.** The bottleneck is not the model; it is the information.

- A 500-question persona carries a few percent of what is knowable about a person's next choice in a
  situation. The persona bound caps every model that reads only it, language model or regression.
- One earlier observation of the person in the same situation carries a share ρ of it (ρ² of ρ).
  That is about half on Twin-2K-500's tasks, and less where people are less steady. A two-layer echo
  reads that observation against the crowd. There, three observations carry about four fifths.
- How much each further observation adds is not a guess. Where a person's own share ρ can be
  measured, the curve the theory draws from pairs alone predicts the second and third look to within
  their intervals (§4.3).
- How knowable a person is depends on the situation: ρ is .08–.16 for moral contrasts of character and
  .40 for humans against pets. A twin promising to know someone in a few visits must be built on
  situations where ρ is not small, and must measure it where it is applied.
- The echo composes with any twin: laid on the released LLM twins it scores
  {{f:t1.echo_llm.acc:.3f}}, from their {{f:t1.llm_headline.acc:.3f}}.

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
- **The Moral Machine's people are browsers.** A browser can be several people; about a quarter of
  those that took the survey twice report a different person. The more a browser played, the less it
  behaves like one person (§4.3). The registered looks curve was therefore a weak test. The stronger
  evidence is exploratory, and it is reported with every panel.
- **The ceiling model.** The knowable ceiling comes from an ordered latent model. It is a model-based
  estimate, though one that reproduced the observed one-look echo to the third decimal. Its interval
  over people is narrow ({{f:t1.model.ceiling.lo:.3f}}–{{f:t1.model.ceiling.hi:.3f}}), but that
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

{{f:t1.table.tasks:s}}

## References

- Argyle, L. P., Busby, E. C., Fulda, N., Gubler, J. R., Rytting, C., & Wingate, D. (2023). Out of one, many: Using language models to simulate human samples. *Political Analysis, 31*(3), 337–351. https://doi.org/10.1017/pan.2023.2
- Awad, E., Dsouza, S., Kim, R., Schulz, J., Henrich, J., Shariff, A., Bonnefon, J.-F., & Rahwan, I. (2018). The Moral Machine experiment. *Nature, 563*(7729), 59–64. https://doi.org/10.1038/s41586-018-0637-6
- Berg, J., Dickhaut, J., & McCabe, K. (1995). Trust, reciprocity, and social history. *Games and Economic Behavior, 10*(1), 122–142.
- Brown, W. (1910). Some experimental results in the correlation of mental abilities. *British Journal of Psychology, 3*(3), 296–322. https://doi.org/10.1111/j.2044-8295.1910.tb00207.x
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
- Spearman, C. (1910). Correlation calculated from faulty data. *British Journal of Psychology, 3*(3), 271–295. https://doi.org/10.1111/j.2044-8295.1910.tb00206.x
- Toubia, O., Gui, G. Z., Peng, T., Merlau, D. J., Li, A., & Chen, H. (2025). Twin-2K-500: A data set for building digital twins of over 2,000 people based on their answers to over 500 questions. *Marketing Science, 44*(6), 1446–1455. https://doi.org/10.1287/mksc.2025.0262
- Wang, Hunt, Tang, & Joseph (2026). When can LLM digital twins reduce human measurement? From behavioral fidelity to statistical substitutability. arXiv:2609.07987.
- Wilson, R. C., Geana, A., White, J. M., Ludvig, E. A., & Cohen, J. D. (2014). Humans use directed and random exploration to solve the explore–exploit dilemma. *Journal of Experimental Psychology: General, 143*(6), 2074–2081.
- Youyou, W., Kosinski, M., & Stillwell, D. (2015). Computer-based personality judgments are more accurate than those made by humans. *PNAS, 112*(4), 1036–1040. https://doi.org/10.1073/pnas.1418680112
