# Who Knows You Best? Self, Friends, and a World That Watched

*Draft, {{date}}. Artun Balta. Simulation study and pre-registered design; the pilot's data are not yet in.
Every number below is filled in from the analysis code's own output (`research/paper/build.py`).*

## Abstract

Models that predict what a particular person will do (digital twins, persona models, generative-agent
simulations of individuals) are now judged by how closely they reproduce the person's own answers. We ask
an older question in a new setting: who predicts a person's next choice best? The candidates are the
person, their friends, or a world that has watched them. We embed six classic paradigms in a
multiplayer game world as things that simply happen on a walk, with the world's own stakes and no money:

- giving to a hungry stranger (dictator);
- lending a raft (trust);
- a bet on the tide (risk);
- planting a seed or eating it (delay);
- an overgrown path (exploration);
- a stranger by a fire (approach).

Groups of friends play twice, a day apart. Before they play, each person says what they would do, and
each friend guesses for the others. An *echo*, a Bayesian persona model, learns from what they do.

We show analytically that echoes built on trait axes alone predict a kind of choice little better than
the "personality coefficient" allows until they have watched it many times. Whatever is steady about a
choice but unexplained by traits looks to them like noise, so they under-react to a person's own
repeated behaviour. We propose a **two-layer echo** that adds one
person-specific layer per kind of choice to the same Kalman update.

In simulations grounded in published effect sizes ({{reps}} groups of {{n}}):

- **The second visit, predicted from one visit.** The two-layer echo reaches a skill of {{again:echo_2l}}
  over the group's base rate. The one-layer echo reaches {{again:echo_axes}}, friends {{again:friends}},
  and the person's own words {{again:self}}.
- **Against perfect trait knowledge.** The two-layer echo beats what exact knowledge of the person's
  eight traits would give ({{again:oracle_axes}}).
- **How fast.** It matches the friends after a median of {{cross:friends}} minutes of play.
- **Situations the echo has never seen.** No model beats the person's own words and their friends'
  guesses ({{elsewhere:self}} and {{elsewhere:friends}}, against {{elsewhere:echo_2l}}).

We pre-register these comparisons for a pilot among friends. The central test has power
{{power:16:again:echo_2l>echo_axes}} at 16 people, and reaches .8 at about {{need:again:echo_2l>echo_axes}}.
The world, the analysis and the tests that guarantee no witness sees what it predicts will be released
with the paper.

## 1. Introduction

A growing family of systems tries to predict what a specific person will do. Generative-agent
simulations of individuals are one example. Park et al. (2024) built agents from two-hour interviews with
1,052 people. Those agents replicated the people's answers to the General Social Survey 85% as accurately
as the people replicated their own answers two weeks later. Persona models are another example: they
compress a person into a few trait dimensions and condition a predictor on them.

Both are evaluated mostly on self-report. They are asked to reproduce a questionnaire answer, or a
choice in an economic game played on a survey platform, and the person's own consistency is the
yardstick. In the revised version of Park et al., on incentivized economic games no agent beat a
baseline given only demographics. The authors call this a boundary case. Words predict what people
say; whether watching predicts what they do is open.

Psychology has asked a related question for decades, with people rather than machines as the
predictors:

- **Who knows what about a person?** The self–other knowledge asymmetry model (Vazire, 2010) holds that
  the self knows internal states best and close others know observable, evaluative traits better.
- **Predicting behaviour.** Self-ratings and friends' ratings each predict daily behaviour, and each
  adds to the other (Vazire & Mehl, 2008).
- **Predicting generosity.** People overestimate their own generosity, yet predict others' quite well
  (Epley & Dunning, 2000). In one study, students said they would give about half of a $5 fee to
  charity and expected others to give $1.80. Given the chance, they gave $1.53 on average.
- **Computers against people.** A model given enough of a person's digital footprint can judge their
  personality more accurately than their friends can (Youyou, Kosinski & Stillwell, 2015). From
  Facebook Likes it outdid a work colleague after about 10 Likes, a friend after 70, a family member
  after 150 and a spouse after 300.

Two questions sit between these literatures and are, as far as we know, unanswered:

1. When a machine has *watched* someone act, rather than read their words, does it predict their next
   choice better than they and their friends do?
2. How long must it watch?

We answer both in a setting built for the purpose. ECHO is a procedural planet with villages in which
each player's actions train an echo, a Bayesian model of them. We set six classic paradigms in its world.
They appear as ordinary encounters with ordinary stakes, and friends play them twice. Before playing,
everyone says what they would do and guesses what their friends would do. The echo keeps its own guess.

The design's choices are deliberate:

- **Same choices.** Every witness predicts the same choices, so comparisons are paired.
- **Two settings.** The *again* setting tests memory: the same situation, a day later. The *elsewhere*
  setting tests generalisation: a situation never seen.
- **Exchange rate.** A learning curve gives the minutes of play that buy what a friendship knows.

The main contribution is a model result that the design exposes. Persona models are usually one-layer:
traits, plus noise. Single acts are only weakly predicted by traits; trait–behaviour correlations sit
near .3, the "personality coefficient" (Mischel, 1968). Yet single acts are far more stable over time
than traits explain (Epstein, 1979). The steady remainder is specific to the kind of act: in personality
psychology, the nuances below the Big Five (Mõttus et al., 2017), and in measurement theory, the
specific variance of a latent state–trait model (Steyer, Schmitt & Eid, 1999).

A one-layer echo has nowhere to keep that remainder. We show it under-reacts to what it sees. When it
does catch up, it does so by bending the person's traits to fit one kind of choice, which moves every
other prediction too.

Adding one person-specific layer per kind of choice fixes this. It runs under the same Bayesian update,
on a stacked state.

Our contributions:

1. **Design.** Six paradigms embedded in a game world with intrinsic stakes. Self, friends and machine
   witnesses on identical choices, in two settings, with a learning curve.
2. **Theory.** Closed-form skill for one- and two-layer echoes after n observations. The one-layer
   ceiling, the under-reaction, and when one look beats perfect trait knowledge (whenever
   (h² + ν)² > h²). We also note that a person's retest agreement is a yardstick, not a ceiling.
3. **Model.** The two-layer echo, fitted by variance components on the group, with no peeking.
4. **Simulation and power** grounded in published ranges, and an open pipeline whose tests guarantee
   that no witness sees what it predicts.
5. **A pre-registered pilot** that needs no money: friends, a world, two evenings.

## 2. The village

### 2.1 Six paradigms as encounters

| Paradigm | In the village | Choice, coded 0..1 |
|---|---|---|
| Dictator game (Forsythe et al., 1994) | A thin stranger by the path looks at your bread; you carry three loaves | loaves given: 0, ⅓, ⅔, 1 |
| Trust game, first move (Berg, Dickhaut & McCabe, 1995) | Someone at the water, with nets and no boat, asks to borrow your raft; one time in four it does not come back | lent 1, kept 0 |
| Risk, mean held fixed (cf. Holt & Laury, 2002) | A fisher offers two fish now, or a bet on the tide: three or one, or four or none | safe 0, even 0.5, long 1 |
| Delay discounting (Frederick, Loewenstein & O'Donoghue, 2002) | A farmer's child offers a handful of grain now, or a seed that is three handfuls tomorrow | planted 1, ate 0 |
| Exploration (cf. Wilson et al., 2014) | An overgrown path leaves the marked way | followed 1, passed 0 |
| Approach | A traveller sits alone by a small fire | went up 1, walked on 0 |

Stakes are the world's own:

- bread the player will want on the water;
- a raft they cannot use while it is lent;
- fish, which land in the pack;
- a crop that is there a day later;
- a village shared with their friends.

Nobody is paid. A paradigm met is answered by acting: giving, lending, betting, planting, following,
greeting. Walking past is an answer too.

### 2.2 Procedure

1. **Before playing.** Each friend gives a nickname and consents. They place themselves on the echo's
   eight axes (1–7) and say what they would do in each of the six.
2. **Two visits.** Each visit lasts 25 minutes, and the visits are at least 20 hours apart.
3. **How the six are set out.** The village sets out the six one at a time, in an order counterbalanced
   across people:
   - the first comes 20 seconds after arrival;
   - each next one comes 30 seconds after the last was answered;
   - land encounters are 10–22 m away, shore encounters 14–40 m;
   - one left standing for four minutes is *unmet*, which is missing data and never a zero.
4. **After a visit.** Each friend rates the others they know: how well (0–3), the eight axes, and what
   they think that person would do in each of the six. "No idea" is allowed.

### 2.3 What the echo sees

The echo sees:

- the behavioural events of the six;
- every other act in the world;
- walking, read as the share of novel tiles and the tortuosity of the path;
- the decision time of each act.

It never sees ratings of the person it predicts, and never their words.

## 3. Witnesses

Each witness gives one level per choice: the median of what it expects, which minimises absolute error.

| Witness | Prediction |
|---|---|
| Self | the person's own stated choice |
| Friends | the median of the friends' guesses |
| Engine echo | ECHO's engine as built: 8 axes, a synthetic measurement model |
| One-layer echo | 8 axes, measurement model fitted on the other people |
| **Two-layer echo** | 8 axes plus a person-specific layer, fitted on the other people |
| Questionnaire twin | the person's rated axes (own and friends') through the fitted model |
| Group model | ridge regression of the choice on the person's other choices, fitted on others |
| Pooled | the median of self, friends and the two-layer echo |

### 3.1 The two-layer echo

For person *i*, feature *j* (a coded choice, a walking measure, decision time) and visit *t*:

  x_ijt = μ_j + w_jᵀ z_i + u_ij + ε_ijt,  z_i ~ N(0, I₈),  u_ij ~ N(0, τ_j²),  ε_ijt ~ N(0, σ_j²).

The terms are:

- **z_i**, the person's eight traits;
- **u_ij**, their own steady tendency in feature *j* beyond those traits;
- **ε_ijt**, the day.

The echo's state is the stacked vector [z; u]. It is updated by the same linear-Gaussian Kalman step the
engine uses (Joseph form), one observation at a time. An act's surprise is split between the layers in
proportion to what each can explain. With τ = 0 the model is exactly a one-layer echo, so the ablation
is exact.

**Fitting.** Parameters are fitted on everyone but the person predicted, feature by feature, by
variance components:

- **The day.** σ_j² is half the mean squared difference between a person's two visits.
- **The steady part.** The person's steady variance is the variance of people's means, less the day's
  share (the one-way ANOVA estimator).
- **The traits' share.** Of the steady part, the traits' share is what the *anchors* predict of people's
  means out of sample. The anchors are the mean of each person's self-rating and their friends' mean
  rating, standardised. The prediction is a ridge regression with its penalty chosen by
  leave-one-person-out error. The share is capped at the steady variance.
- **The loadings.** w_j is the ridge's direction, scaled so that w_jᵀw_j equals the traits' share.
  Without this, eight slopes fitted on a dozen people absorb the person-specific variance.
- **The person's own.** τ_j² is the steady variance the traits leave.

A predicted choice is the median of the predictive distribution, cut at the midpoints between the
paradigm's levels.

## 4. Theory: what one layer cannot keep

Standardise one kind of choice. Let:

- h² = var(wᵀz), the traits' share;
- ν = τ², the person's own steady share;
- ε = 1 − h² − ν, the day's share;
- ρ = h² + ν, the reliability.

Skill is 1 − MSE/var(x). For predicting the next choice after n observations of the same kind:

- **Traits known exactly:** h². This is the most any one-layer echo can reach without watching.
- **Copying the last choice:** 2ρ − 1.
- **Two layers, n looks:** nρ²/(nρ + ε). After one look this is ρ², and it rises to ρ.
- **One layer, n looks:** 2cρ − c²(ρ + ε/n), where c = h²/(h² + (ν + ε)/n). The echo moves only a share
  c of the way, because what is steady but untraited looks like noise to it.

Three consequences follow.

1. **One look beats perfect trait knowledge** whenever ρ² > h². With trait–act correlations near .3
   (h² ≈ .1) and retest correlations of single choices of .5–.7 (ρ ≈ .6), it does so by a wide margin.
2. **The one layer under-reacts.** At h² = {{theory:h2}} and ν = {{theory:nu}} (the simulation's
   giving), one look gives {{theory:one:1}} against {{theory:two:1}}. One layer needs
   {{theory:catch}} looks to catch up. It catches up only by moving z to fit this kind of choice, which
   moves every other prediction with it.
3. **Retest agreement is a yardstick, not a ceiling.** The person's own replication scores 2ρ − 1.
   The best possible predictor scores ρ, and a calibrated two-layer echo scores ρ² ≥ 2ρ − 1 after one
   look. Normalised accuracy above 100% is therefore possible in principle. The categorical analogue
   is the same: knowing a person's answer probabilities p gives accuracy max p, more than their
   replication rate Σp².

The tests in `research/pilot/tests/test_theory.py` hold these forms to a Monte Carlo of the model.

<!-- figure:theory -->

## 5. Simulation study

### 5.1 Generative model

Simulated people have:

- eight traits;
- a stable tendency of their own in each paradigm (sd .6 in propensity units);
- visit noise (sd .55).

Choices are discretised from propensities at thresholds that give the paradigms' base rates. The
trait loadings put trait–act correlations near .3, and the retest correlations of single choices at
.5–.7.

What people *say* comes from how they see themselves, which carries several things:

- their traits, seen at .8;
- half of their own tendencies;
- a pull toward the admirable, strongest for giving.

What friends *guess* comes from how they see the person, which also carries several things:

- traits seen at .45–.72, by acquaintance;
- some projection of the friend's own traits;
- a little of the person's own tendencies.

The simulation also includes:

- walking that carries a little openness, energy and pace;
- decision times that carry pace;
- unmet encounters (7% on land, 15% at the shore);
- 10% who never return.

The simulated export has the same shape as the real one, and the analysis cannot tell them apart.

### 5.2 Results ({{reps}} groups of {{n}}; medians, [middle half of groups])

**Again (second visit from first).**

| Witness | Skill | Exact agreement |
|---|---|---|
| Two-layer echo | {{again:echo_2l}} {{again:echo_2l:iqr}} | {{acc:again:echo_2l}} |
| Pooled (self, friends, echo) | {{again:together}} {{again:together:iqr}} | {{acc:again:together}} |
| Own words | {{again:self}} {{again:self:iqr}} | {{acc:again:self}} |
| Friends | {{again:friends}} {{again:friends:iqr}} | {{acc:again:friends}} |
| Group model | {{again:twin}} {{again:twin:iqr}} | {{acc:again:twin}} |
| Questionnaire twin | {{again:traits}} {{again:traits:iqr}} | {{acc:again:traits}} |
| One-layer echo | {{again:echo_axes}} {{again:echo_axes:iqr}} | {{acc:again:echo_axes}} |
| Engine echo, as built | {{again:echo}} {{again:echo:iqr}} | {{acc:again:echo}} |
| *Own other visit (copying)* | {{again:retest}} | {{acc:again:retest}} |
| *Traits known exactly* | {{again:oracle_axes}} | {{acc:again:oracle_axes}} |
| *Person known exactly* | {{again:oracle_person}} | {{acc:again:oracle_person}} |
| *Base rate* | 0 | {{acc:again:bar}} |

<!-- figure:again -->

The two-layer echo's skill rises through the first visit as the six are met. It reaches the friends'
level after a median of {{cross:friends}} minutes, which happens within the visit in
{{cross:friends:share}} of groups. It reaches the level of the person's own words after
{{cross:self}} minutes.

<!-- figure:curve -->

**Elsewhere (a paradigm never seen).** The person's own words score {{elsewhere:self}} and the friends
{{elsewhere:friends}}. The two-layer echo scores {{elsewhere:echo_2l}}, the one-layer echo
{{elsewhere:echo_axes}}, and the group model {{elsewhere:twin}}. Exact trait knowledge would score
{{elsewhere:oracle_axes}}.

What an echo learns of someone's traits from five other choices and their walking carries little to a
sixth. People and their friends know the person's own ways directly.

<!-- figure:elsewhere -->

**Say and do.** The median group said {{gap:give:said}} of its bread and gave {{gap:give:did}}. The
friends' guesses ran {{holier:give:friends_error}} from what was given, the people's own words
{{holier:give:self_error}}.

**Power.** At 16 people:

| Test | Power at 16 | n for .8 |
|---|---|---|
| H1: two layers > one | {{power:16:again:echo_2l>echo_axes}} | {{need:again:echo_2l>echo_axes}} |
| H2: two-layer echo > base rate | {{power:16:again:echo_2l>bar}} | {{need:again:echo_2l>bar}} |
| Own words > base rate | {{power:16:again:self>bar}} | {{need:again:self>bar}} |
| Friends > base rate | {{power:16:again:friends>bar}} | {{need:again:friends>bar}} |
| H3: echo > friends | {{power:16:again:echo_2l>friends}} | {{need:again:echo_2l>friends}} |
| H4: say–do gap, giving | {{power:16:gap_give}} | {{need:gap_give}} |

<!-- figure:power -->

A circle of friends is therefore a pilot in the proper sense. It estimates every effect and gives the
central test a fair chance, while the confirmatory study needs about
{{need:again:echo_2l>echo_axes}} people.

**Two variants set aside, reported rather than dropped.**

- **Scoring by probabilities.** Scored by the ranked probability score (Epstein, 1969; a proper score on
  the models' own probabilities), the central test had less power at 16 people: .35 against .57, in 60
  groups. With so
  few people the two-layer echo's probabilities are not yet calibrated, though the choice it names is.
- **Predicting each visit from the other.** Predicting each visit from the other, rather than only the
  second from the first, raised power from .57 to .60. Both directions rest on the same pairs of
  choices.

## 6. Pre-registered pilot

- **Sample.** Friends and family of the first author, unpaid. Target 16–20. Recruitment stops at 20,
  or after four weeks. This is a pilot. The confirmatory study (about {{need:again:echo_2l>echo_axes}}
  people) follows with an academic partner and an ethics review.
- **Exclusions.** People with no second-visit choice are excluded from *again* only. Unmet encounters
  are missing, never zero.
- **Hypotheses.**
  - **H1** (two layers > one layer, *again*, one-sided). The central test.
  - **H2** (two-layer echo > base rate; crossing time of the friends' level, with a bootstrap interval).
  - **H3** (echo, friends, own words, pooled: estimates with intervals, not tests).
  - **H4** (say–do gap on giving, and own forecast further than friends', two-sided).
  - **H5** (person-specific share > trait share, descriptive).
- **Analysis.** The analysis is `research/pilot/analysis.py` at the commit named in the registration.
  Inference is over people: bootstrap intervals, and exact sign-flip tests up to 16 people.
- **Ethics.** The pilot needs a nickname and consent, not a name. Any person can erase themselves and
  every rating of them. A published study needs an ethics review (known-gaps ⚑64).

## 7. Discussion

If the pilot agrees with the simulation, three claims follow.

1. **Persona models need a second layer.** Trait-only models of people are capped low, and they
   under-react to behaviour. A per-situation person-specific layer costs one number per kind of choice
   and fits in the same update.
2. **The world has an exchange rate.** A few minutes of watching someone act are worth what close
   friends know, for situations the world has seen.
3. **Words generalise; watching remembers.** For situations it has not seen, the person and their
   friends still know best. That is an honest boundary for digital twins built from behaviour.

**Limitations.**

- **The sample.** Friends are not a random sample. They know each other, know the study, and may play
  to be seen.
- **The stakes.** The stakes are a game's, and the external validity of economic-game choices is itself
  debated (Galizzi & Navarro-Martinez, 2019).
- **The parameters.** The simulation's parameters are assumptions from published ranges, not
  measurements. Its friends and selves are as insightful as we made them.
- **Pilot size.** The pilot's n supports the central test, but not fine comparisons between
  witnesses.

## References (checked against bibliographic records, 2026-11-02)

- Berg, J., Dickhaut, J., & McCabe, K. (1995). Trust, reciprocity, and social history. *Games and Economic Behavior, 10*(1), 122–142.
- Epley, N., & Dunning, D. (2000). Feeling "holier than thou": Are self-serving assessments produced by errors in self- or social prediction? *Journal of Personality and Social Psychology, 79*(6), 861–875.
- Epstein, S. (1979). The stability of behavior: I. On predicting most of the people much of the time. *Journal of Personality and Social Psychology, 37*(7), 1097–1126.
- Forsythe, R., Horowitz, J. L., Savin, N. E., & Sefton, M. (1994). Fairness in simple bargaining experiments. *Games and Economic Behavior, 6*(3), 347–369.
- Frederick, S., Loewenstein, G., & O'Donoghue, T. (2002). Time discounting and time preference: A critical review. *Journal of Economic Literature, 40*(2), 351–401.
- Galizzi, M. M., & Navarro-Martinez, D. (2019). On the external validity of social preference games: A systematic lab-field study. *Management Science, 65*(3), 976–1002.
- Holt, C. A., & Laury, S. K. (2002). Risk aversion and incentive effects. *American Economic Review, 92*(5), 1644–1655.
- Mischel, W. (1968). *Personality and Assessment.* Wiley.
- Mõttus, R., Kandler, C., Bleidorn, W., Riemann, R., & McCrae, R. R. (2017). Personality traits below facets: The consensual validity, longitudinal stability, heritability, and utility of personality nuances. *Journal of Personality and Social Psychology, 112*(3), 474–490.
- Epstein, E. S. (1969). A scoring system for probability forecasts of ranked categories. *Journal of Applied Meteorology, 8*, 985–987.
- Park, J. S., Zou, C. Q., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Willer, R., Liang, P., & Bernstein, M. S. (2024). Generative agent simulations of 1,000 people. arXiv:2411.10109. (Revised as "LLM agents grounded in self-reports enable general-purpose simulation of individuals"; cite the version read.)
- Steyer, R., Schmitt, M., & Eid, M. (1999). Latent state–trait theory and research in personality and individual differences. *European Journal of Personality, 13*(5), 389–408.
- Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. *Journal of Personality and Social Psychology, 98*(2), 281–300.
- Vazire, S., & Mehl, M. R. (2008). Knowing me, knowing you: The accuracy and unique predictive validity of self-ratings and other-ratings of daily behavior. *Journal of Personality and Social Psychology, 95*(5), 1202–1216.
- Wilson, R. C., Geana, A., White, J. M., Ludvig, E. A., & Cohen, J. D. (2014). Humans use directed and random exploration to solve the explore–exploit dilemma. *Journal of Experimental Psychology: General, 143*(6), 2074–2081.
- Youyou, W., Kosinski, M., & Stillwell, D. (2015). Computer-based personality judgments are more accurate than those made by humans. *PNAS, 112*(4), 1036–1040.
