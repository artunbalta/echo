# Literature Review

*For "Who Knows You Best?" (draft, 2026-11-06). Numbers are as reported in the cited sources; where
one comes from a working paper or from a later paper's account, the text says so.*

Three literatures have asked, in different words, how well one can know what a particular person will
do. Work on language-model "digital twins" asks it of machines that read a person's words. Personality
psychology asks it of traits, situations and the people who know someone. Behavioural economics asks
it of survey questions and paid games. We review each in turn and end with the question none of them
has asked.

Two distinctions run through the review. The first separates **aggregate** accuracy, getting a
population's mean, distribution or treatment effect right, from **individual** accuracy, knowing who
will answer higher or lower than whom. The second separates **survey answers**, what people say, from
**behaviour**, what they choose, hypothetically or for money. We also use the paper's names for the
three sources of information about a person: their **words** (what they say about themselves), their
**deeds elsewhere** (what they chose in other situations) and the **same situation again** (what they
did in this situation before).

## 1. Digital twins and silicon samples

**Silicon samples.** Argyle et al. (2023) conditioned GPT-3 on backstories built from respondents to
the American National Election Studies, called the result a silicon sample, and spoke of "algorithmic
fidelity". Its predicted vote matched each respondent's own vote at tetrachoric correlations of .90 to
.94 in three elections, but the fit came from inputs that nearly determine the outcome, party
identification and ideology: for pure independents the correlations were .31, .41 and .02. Aher et
al. (2023) reproduced classic experiments, such as the ultimatum game and Milgram's obedience study,
with simulated participants who differed only in name, and found a "hyper-accuracy distortion": on
wisdom-of-crowds questions the newest models gave exactly the true value, with no spread. Horton
(2023) proposed studying language models as simulated economic agents, *homo silicus*. A later
revision reports that giving agents hobbies or favourite television shows does little for their fit
to human play, while personas built from social-preference theory and calibrated on human choices
help (Horton et al., 2026).

**Aggregate prediction.** Language models predict the average treatment effects of survey experiments
about as well as pooled human forecasters, though they overestimate the effects' size (Ashokkumar et
al., 2026). Across 156 scenario experiments they reproduced 73–81% of main effects but only 46–63% of
interactions, with effect sizes two to three times the human ones (Cui et al., 2025). All of this is
aggregate evidence, and most of it concerns survey answers.

**A foundation model of choice.** Centaur (Binz et al., 2025) is a 70-billion-parameter language model
fine-tuned on Psych-101: trial-by-trial data from 160 experiments, 60,092 participants and 10.7 million
choices, mostly in learning and decision-making. Each training example is one participant's whole
session, so the model predicts a held-out participant's next choice from that participant's earlier
choices in the same task. It beat domain cognitive models whose parameters were shared across
participants (negative log-likelihood 0.44 against 0.56). On two data sets it exceeded the estimated
noise ceiling, which the authors attribute to "context-dependent patterns"; prompted to predict each
response on its own, it reached about half that ceiling. Centaur is the strongest evidence that a
person's own behaviour buys predictive power, but within one session. It keeps no model of a person
across tasks, and its authors note that data on individual differences are missing from Psych-101.

**Twins of individuals.** Park et al. (2024) interviewed 1,052 Americans for two hours each and built a
GPT-4o agent from each transcript. The agents answered the General Social Survey, the Big Five
Inventory and five incentivised economic games, which the people answered twice, two weeks apart. On
the survey, agents matched people's answers 85% as often as people matched themselves (68.85% against
a retest of 81.25%), a ratio the authors call normalised accuracy. Its headline correlations are
computed across items within each person, which rewards knowing item means rather than people, a
point Peng et al. (2026) make. Across people and per game, the paper's supplementary analysis gives
correlations of .11 for the dictator game, .08 and .03 for the trust game as sender and as receiver,
−.05 for public goods and .10 for the prisoner's dilemma. A 2026 revision adds agents built from
surveys and concludes that in the games "none significantly beat the demographic baseline" (Park et
al., 2026).

Twin-2K-500 (Toubia et al., 2025) released about 500 answers from each of 2,058 US adults, collected
over three waves. A fourth wave, two weeks later, repeated 88 heuristics-and-biases and pricing
questions. Twins built from the first three waves reached 71.72% accuracy on the repeated questions,
reported as 87.67% of the 81.72% that people reach against their own earlier answers. Random guessing
scores 59.17%, so the twins close about 56% of the distance from random to retest (our arithmetic).
The paper reports no baseline that guesses the typical answer for everyone, and no correlations across
people. Its release includes every twin's prediction for every person, which Study 1 scores.

**What twins know about individuals.** The largest test so far re-recruited the Twin-2K-500 panel for
19 pre-registered studies with 164 new outcomes, mostly attitudes, intentions and evaluations (Peng et
al., 2026). Twins correlated with their humans across people at r = .197; twins given only
demographics reached .145, and twins given an empty persona .080. On accuracy, full-persona and
demographics-only twins were indistinguishable (0.748 against 0.746). Twins' answers were less spread
out than their humans' on 154 of 164 outcomes, and they sat closer to the demographics-only twins than
to their own humans. A gradient-boosting model trained on about 180 respondents matched the twins'
correlation, but even with 650 respondents it stayed below .29, which suggests that the persona, not
the model reading it, limits what can be known. On Twin-2K-500's behavioural contrasts, Wang, Hunt,
Tang and Joseph (2026) removed condition means and found a median residual correlation of .028, with
10 of 12 contrasts below .10. On the framing problem the twins reproduced the average effect
(d = 0.94 against 0.76 for people) at a residual correlation of .003. Twins, they conclude, "can
reproduce average human effects while providing little information about which individuals differ
from those averages."

**Other individual-level evaluations.** Results are better when the target resembles the persona.
Twins built from the German Socio-Economic Panel predicted held-out survey items from 949 other
answers per person at a between-person correlation of up to .59, against .25–.36 from demographics
alone (Kinzinger & Hartmann, 2026): words predicting words. Several studies point to the value of a
person's own earlier answers or behaviour. On Pew opinion questions, adding a person's own past
opinions raised exact-match accuracy more than adding demographics and ideology, from .43 with no
persona to .47 with demographics and ideology and .52 with eight past opinions (Hwang et al., 2023).
In rating prediction, zero-shot language models given a user's past ratings were at best
comparable to simple baselines, and on MovieLens they fell below both the user's and the item's
average rating (Kang et al., 2023). In online shopping, once a person's browsing history was in the
prompt, adding their survey persona did not improve next-action accuracy (Z. Wang et al., 2025). Nor
is prompt design the bottleneck: a structured persona schema added 1.9 points of accuracy on
Twin-2K-500 (Ye et al., 2026).

**Distortions.** Critiques of twins converge on four distortions.

- **Under-dispersion.** ChatGPT's feeling-thermometer answers matched survey means but varied less (a
  standard deviation of 16.1 against 31.4 in one comparison), and 48% of regression coefficients
  differed significantly from the human ones (Bisbee et al., 2024). Twins varied less than their
  humans on 94% of outcomes (Peng et al., 2026).
- **Flattening and stereotyping.** Models prompted with an identity portray a group more as outsiders
  imagine it, and with less diversity than its members show (A. Wang et al., 2025). Peng et al. (2026)
  list insufficient individuation and stereotyping among their five distortions.
- **Hyper-rationality.** Every twin chose the safe Allais option, and twins always gave the normative
  answer in probability matching, which about 30% of people gave (Toubia et al., 2025). The direction
  depends on the task: in the 11–20 money-request game, models reasoned fewer steps ahead than people
  (Gao et al., 2025).
- **Pro-social and desirable answers.** Where chatbots deviate from people in economic games, they are
  more altruistic and cooperative (Mei et al., 2024). Models that infer they are being assessed shift
  their Big Five answers toward desirable scores by about one human standard deviation (Salecha et al.,
  2024).

**Summary.** Table 1 sorts this evidence by level and outcome: twins do well on aggregates, modestly
on individuals when the target is a self-report like the persona, and little better than nothing when
it is a choice. Two comparisons are missing from these evaluations: the crowd's typical answer, which
knows no one, and the person's own earlier answer used as a predictor rather than as the yardstick.

*Table 1. What LLM twins have been shown to know, by level and outcome.*

| | Aggregate: means, distributions, effects | Individual: who answers higher than whom |
|---|---|---|
| **Survey answers** | Close on subgroup patterns (Argyle et al., 2023) and on average effects of survey experiments (Ashokkumar et al., 2026); too little spread (Bisbee et al., 2024) | r ≈ .20 on new outcomes, against .15 from demographics alone (Peng et al., 2026); up to .59 when the target is the same kind of self-report as the persona (Kinzinger & Hartmann, 2026) |
| **Choices**, hypothetical or paid | Many classic effects reproduced, with hyper-rational and pro-social distortions (Aher et al., 2023; Mei et al., 2024; Toubia et al., 2025) | −.05 to .11 per incentivised game (Park et al., 2024); median residual r of .03 on hypothetical behavioural contrasts (Wang et al., 2026) |

## 2. Knowing a person's behaviour in psychology

**Consistency and aggregation.** Mischel's (1968) review of personality assessment concluded that
single behaviours are only weakly consistent across situations and weakly predicted by trait
measures; later summaries put the correlations at .1 to .3 (Fleeson & Law, 2015). The finding was old
even then: in Newcomb's (1929) summer-camp study, behaviour in one situation correlated with behaviour
in another at about .14 on average (as cited in Mischel, 2004). Epstein (1979, 1983) replied that
single acts are too unreliable to measure dispositions, and that behaviour aggregated over occasions
is highly stable.

Diener and Larsen (1984), sampling 42 students twice a day for six weeks, give both sides in one data
set. The expected correlation between two single moments in different kinds of situation was .00 to
.19 for every response except life satisfaction. A single moment correlated with
another three weeks later at .03 to .16 for behaviours and .39 to .48 for positive and negative affect,
while averages over three weeks were far more stable. "Small correlations across individual
occasions," they note, "can translate into large correlations if one is interested in long-term
trends in behavior." Pooling 15 experience-sampling studies, Fleeson and Gallagher (2009) found that
49–78% of the variance in momentary Big Five states lay within persons, and that trait questionnaires
correlated .18 to .37 with a single state but .42 to .56 with a person's average state. Both sides of
these correlations are self-reports, which probably inflates them.

**If-then signatures and density distributions.** Mischel and Peake (1982) found that "even with
reliable measures, based on multiple behavior observations aggregated over occasions, mean
cross-situational consistency coefficients were of modest magnitude; in contrast, impressive temporal
stability was found." Mischel and Shoda's (1995) cognitive-affective system theory accounts for both.
People differ in average levels, and also in stable patterns of variation across situations: "if A
then she X, but if B then she Y." In the summer-camp data of Shoda et al. (1994), children were
observed for about 167 hours each across five kinds of interpersonal situation. After each situation's
average effect was removed, a child's profile across situations correlated between two halves of the
observations at .47 for verbal aggression, .41 for compliance, .28 for whining and .19 for prosocial
talk (as reported in Mischel & Shoda, 1995).

Fleeson (2001) recast traits as density distributions of states. Within-person variability was so
high that "the typical individual regularly and routinely manifested nearly all levels of all traits",
yet individual differences in the centre of each distribution were almost perfectly stable, with
weekly averages correlating .7 to .9 across weeks (Fleeson & Gallagher, 2009). When 97 people each
attended 20 laboratory sessions, their average behaviour in the first ten predicted the next ten at
.71 to .87 by self-report and .66 to .81 by observers' ratings, while most variation lay within
persons (Fleeson & Law, 2015). In the paper's terms, the trait is the part of a person that a
description carries from one situation to another, the signature is the person's own steady way with
one kind of situation, and the occasion is the day.

**Who knows a person: self and others.** Laypeople expect to know their own behaviour best. Yet in
Vazire and Mehl's (2008) study, against four days of audio recordings of daily life, self-ratings and
the averaged ratings of up to three friends predicted how often people performed 20 everyday
behaviours equally well (r = .26 each), and each added information the other lacked. Vazire's (2010)
self–other knowledge asymmetry model locates the difference in the trait: the self judged
neuroticism-related traits best, friends intellect-related traits, and all perspectives
extraversion-related traits equally. The self has privileged access to inner states: self-reports
predicted daily emotional experience better than others' reports (Spain et al., 2000). For
observable and consequential behaviour, others do as well or better. Single acquaintances slightly
outpredicted the self on videotaped behaviour, and two acquaintances together did so significantly
(Kolar et al., 1996). In a meta-analysis covering 44,178 targets, ratings by others predicted job
performance and academic achievement better than self-ratings, and agreement with the self rose with
acquaintance, from strangers through colleagues and friends to family and spouses (Connelly & Ones,
2010).

**Predicting oneself and predicting others.** When people forecast specific acts, the self's main
error is bias. Students overestimated how likely they were to act generously or selflessly, while
their predictions of their peers were "considerably more accurate", because they used population base
rates for others but not for themselves (Epley & Dunning, 2000). Self-knowledge improves
discrimination, since self-predictions correlate more strongly than peer predictions with individual
differences in behaviour, but it worsens bias (Epley & Dunning, 2006). Helzer and Dunning (2012) found
self- and peer predictions correlating equally with outcomes; they differed in what they weighted.
People predicting themselves weighted their aspirations, while a peer weighted their past achievement.
People also allow for the situation when predicting others but not when predicting themselves
(Balcetis & Dunning, 2013), and both kinds of prediction are overconfident, most of all when they go
against the base rate (Vallone et al., 1990). In this literature the witness who watches past
behaviour and knows the base rate is the peer.

**Intentions and past behaviour.** Across ten meta-analyses covering 422 studies, intentions correlated
with later behaviour at r = .53, and the gap lay mostly with people who intend to act but do not
(Sheeran, 2002, as summarised by Sheeran & Webb, 2016). Experiments show the causal link to be weaker:
a medium-to-large change in intention (d = 0.66) produced a small-to-medium change in behaviour
(d = 0.36; Webb & Sheeran, 2006). Past behaviour predicts future behaviour by two routes (Ouellette &
Wood, 1998). In constant contexts, practised behaviour recurs because it has become automatic, and the
frequency of past behaviour then reflects the strength of a habit; otherwise past behaviour works
through intentions.

**Machines that watch.** Computers given people's digital traces now judge personality better than
people do. A regression on Facebook Likes agreed with people's self-reported personality at r = .56,
against .49 for Facebook friends. It needed 10, 70, 150 and 300 Likes to beat an average work
colleague, cohabitant or friend, family member and spouse, and reached .66 for people with more than
500 Likes (Youyou et al., 2015). The criterion, though, was the person's own questionnaire, and in
predicting 13 outside criteria the computer beat the person's self-ratings on only four. Earlier,
Kosinski et al. (2013) predicted Openness from Likes at r = .43, "very close to the test–retest
reliability for Openness (r = 0.50)", and displayed each questionnaire's retest reliability as its
"baseline accuracy". We found no study that compares a machine, the self and friends on predicting
the same specific future acts.

**What psychology supplies.** Psychology supplies the decomposition the paper uses, a portable trait,
a situation-specific signature and the occasion, and three findings that bear on it. A single act is
mostly occasion. The same situation observed again is more stable than different situations observed
once. And peers, who weight past behaviour and base rates, avoid the self's optimism. It has not
measured how much of what is knowable about a single next act each source carries, nor compared those
sources with the machine witnesses now proposed as stand-ins for people.

## 3. Measuring preferences: surveys, games and their reliability

**Survey and incentivised measures.** Economists measure preferences both by asking and by paying. The
general question about willingness to take risks, validated against paid lottery choices in a
representative sample of 450 adults, predicts them significantly but weakly: in the working-paper
version it explained 6% of the variance in the switching point (Dohmen et al., 2005, 2011). The
Preference Survey Module (Falk et al., 2016, 2023) selected, from a large battery, the survey items
that best predicted paid choices among 409 students. In the working-paper version (Falk et al., 2016),
the two chosen items per preference correlated with the experimental measures at .37 (negative
reciprocity) to .67 (trust), and at .26 to .59 in an independent sample of 80. The best items were
often hypothetical versions of the experiment itself; a hypothetical investment game, for example,
correlated .62 with paid trust.

Generic self-descriptions do much worse. Across 1,507 adults, risk-propensity questionnaires and
behavioural risk tasks correlated at .06 on average (Frey et al., 2017). Self-report and behavioural
measures of self-control, emotional intelligence, empathy, risk and creativity correlate at 0 to .20
(Dang et al., 2020); for self-control, informants' reports track delay-of-gratification tasks at
least as well as self-reports do (.21 against .15; Duckworth & Kern, 2011). Meta-analytic
correlations between personality traits and play in six economic games range from −.18 to .26
(Thielmann et al., 2020). Self-reported pro-social values correlated with cooperation at .16 to .21
(Peysakhovich et al., 2014), and a self-reported altruism scale correlated with no game above .20
(Galizzi & Navarro-Martinez, 2019). What does predict cooperation is belief about others: expectations
of others' cooperation correlated .63 with one's own, against .32 for social value orientation
(Pletzer et al., 2018).

**Stability over time.** Repeating a measurement gives the paper's third source, and its retest
correlation is the paper's ρ. Behavioural measures are less stable than questionnaires. Over six
months, behavioural risk tasks were retested at .46 on average, against .68 for propensity
questionnaires (Frey et al., 2017). After about four months, behavioural task measures had a median
intraclass correlation of .31, against .67 for surveys (Enkavi et al., 2019). Lottery choices show
retest correlations of about .2 over five years, against about .5 for self-reported risk taking over
ten (Mata et al., 2018). Reviewing risk, time and social preferences, Chuang and Schechter (2015)
found published retest correlations from −.38 to .68 for risk, .004 to .75 for time and −.15 to .69
for social preferences, and concluded that "survey measures of social preferences are quite stable…
experimental measures of risk preferences are not at all stable." Cooperation in one-shot games
correlated .36 across an average of 124 days (Peysakhovich et al., 2014), and factors of behavioural
biases .44 on average across three years (Stango & Zinman, 2023).

**Consistency across games.** The paper's second source, deeds elsewhere, depends on whether choices in
one game predict choices in another. For social preferences they do. Decisions in public-goods,
dictator and trust games correlated at .41 on average (Peysakhovich et al., 2014), dictator giving
correlated .50 with trust returned (Galizzi & Navarro-Martinez, 2019), and trust sent correlated .46
with trust returned (Dean & Ortoleva, 2019). One component of generosity spans altruism, trust and
reciprocity (Chapman et al., 2023), while punishment sits apart from giving (Peysakhovich et al.,
2014). For risk, choices mostly do not predict each other: behavioural risk tasks correlated at .08 on
average (Frey et al., 2017), and six elicitation methods disagreed about people's risk preferences
(Pedroni et al., 2017). Time preferences cluster (discounting and present bias correlate .67), and
risk and social preferences are largely independent of each other (Dean & Ortoleva, 2019; Chapman et
al., 2023).

**The reliability paradox.** Why behaviour often measures individual differences poorly has a known
answer. Tasks become standard because they produce robust average effects, which requires that nearly
everyone shows them; the resulting low variance between people makes individual differences
unreliable. In classic cognitive tasks, retest reliabilities ranged from 0 to .82 (Hedge et al., 2018).
Task measures also predict self-reported real-world outcomes poorly, with a mean cross-validated R² of
.01 against .10 for surveys (Eisenberg et al., 2019), and they correlate weakly with self-reports of
the same construct, partly because a task samples one specific, structured situation while a
questionnaire asks people to summarise many (Dang et al., 2020).

**Predicting individuals' choices.** The most direct test of predicting known individuals from their
other choices is the individual track of the 2018 Choice Prediction Competition (CPC18; Plonsky et
al., 2025). Contestants were given 30 decision makers' choices in 25 risky-choice tasks, plus other
people's choices in five more, and asked to predict the 30 people's choices in those five. None of
the twelve submissions, nor a factorisation machine of the kind used in collaborative filtering, beat
a naïve baseline that predicts each person will behave like the average decision maker in that task
and block. Mean squared errors (×100) were 9.399 for the baseline, 9.405
for the winner and 9.630 for the factorisation machine, and the winner was itself a variant of the
baseline. On a second data set, models built on population-level predictions predicted individuals'
choices in new tasks as well as or better than the best behavioural models fitted to each individual
(Plonsky et al., 2025). In risky choice, deeds elsewhere did not beat the crowd.

**What economics supplies.** The preference literature gives the paper's three sources measured
strengths, and a warning. Words carry little about choices unless they are themselves a hypothetical
version of the choice. Deeds elsewhere carry something for social preferences and little for risk. The
same situation again is the field's benchmark. Falk et al. (2016) reason that "the best predictor of
behavior in an experiment is arguably a prior choice in the same experiment", and take the retest
correlation as "our benchmark for the highest possible correlation one might achieve between survey
measures and experiment". Yet single behavioural measures are often less than half reliable.

## 4. What has not been asked

Much of this ground is already occupied, and the paper builds on it. That LLM twins carry little
information about individuals is published: between-person correlations near .2 on new outcomes,
barely above demographics (Peng et al., 2026); near zero on behavioural contrasts (Wang et al., 2026);
and −.05 to .11 per paid game (Park et al., 2024). That the persona, more than the model reading it,
limits prediction is suggested by a supervised model that stayed below r = .29 on the same persona
(Peng et al., 2026). That a single act is mostly occasion, that the same situation is more stable than
different ones, and that past behaviour predicts in stable contexts are old results (Epstein, 1979;
Mischel & Peake, 1982; Ouellette & Wood, 1998). That the crowd is hard to beat for individuals' risky
choices is shown by CPC18 (Plonsky et al., 2025). And reading an observation against the group, by
shrinking it toward the group mean in proportion to its reliability, is Kelley's (1927) estimate of a
true score.

What has not been asked is, first, *which information* makes a model know the individual. Evaluations
of twins vary the reader: prompted against fine-tuned models, language models against gradient
boosting, interviews against surveys (Park et al., 2026; Peng et al., 2026). The information stays
what the person said and what they chose elsewhere. Where a person's own behaviour has entered, it
has done so as more prompt text (Park et al., 2024; Z. Wang et al., 2025) or within a single session
(Binz et al., 2025). No study we know of sets the three sources side by side (words, deeds elsewhere
and the same situation again) for the same people and targets, under one metric, with the crowd's
typical answer as the baseline. Second, there is no common scale for *how much of what is knowable*
each source carries. Accuracy is reported above random guessing and correlations above zero; neither
separates what a witness does not know about the person from what no one can know about the day.
Third, the field's yardstick is treated as a *ceiling*. Twins are scored as a share of retest accuracy
(Park et al., 2024; Toubia et al., 2025); survey modules are scored against the retest as "the highest
possible correlation" (Falk et al., 2016); predictions from digital traces are set beside retest
reliability as "baseline accuracy" (Kosinski et al., 2013). Yet a retest is one noisy answer guessing
another. A witness that knew a person's steady way with a situation, though not the day, would beat
it, and Binz et al. (2025) have already seen a model pass an estimated noise ceiling once it could
read a participant's own history.

The paper's contribution is therefore neither the finding that twins know little about individuals
nor the decomposition of a choice into person and occasion, which aggregation, if-then signatures and
Kelley's estimate already contain. It is three things. The first is a closed-form account of what
each witness can know: every model that reads only the persona is bounded by the persona's share;
copying a person's earlier choice scores 2ρ − 1, below the crowd whenever the choice is less than half
steady; and reading that choice against the crowd scores at least ρ². The second is a knowable ceiling
above the retest, estimated for discrete answers under the field's own accuracy metric, with an index
of how much of it each source carries. The third is a test of both on the field's public benchmark and
on paid, retested behaviour. The identities are elementary and old in forecast verification. There,
persistence scores 2ρ − 1 against climatology, and the best linear blend of the two scores ρ²
(Murphy, 1992). Their consequences for how twins are evaluated and built have not, to our knowledge,
been drawn.

## References

- Aher, G., Arriaga, R. I., & Kalai, A. T. (2023). Using large language models to simulate multiple humans and replicate human subject studies. In *Proceedings of the 40th International Conference on Machine Learning* (PMLR Vol. 202). arXiv:2208.10264
- Argyle, L. P., Busby, E. C., Fulda, N., Gubler, J. R., Rytting, C., & Wingate, D. (2023). Out of one, many: Using language models to simulate human samples. *Political Analysis, 31*(3), 337–351. https://doi.org/10.1017/pan.2023.2
- Ashokkumar, A., Hewitt, L., Ghezae, I., & Willer, R. (2026). Large language models can predict the results of social science experiments. *Nature, 656*(8126), 115–122. https://doi.org/10.1038/s41586-026-10742-x
- Balcetis, E., & Dunning, D. (2013). Considering the situation: Why people are better social psychologists than self-psychologists. *Self and Identity, 12*(1), 1–15. https://doi.org/10.1080/15298868.2011.617886
- Binz, M., Akata, E., Bethge, M., Brändle, F., Callaway, F., Coda-Forno, J., Dayan, P., Demircan, C., Eckstein, M. K., Éltető, N., Griffiths, T. L., Haridi, S., Jagadish, A. K., Ji-An, L., Kipnis, A., Kumar, S., Ludwig, T., Mathony, M., Mattar, M., . . . Schulz, E. (2025). A foundation model to predict and capture human cognition. *Nature, 644*(8078), 1002–1009. https://doi.org/10.1038/s41586-025-09215-4
- Bisbee, J., Clinton, J. D., Dorff, C., Kenkel, B., & Larson, J. M. (2024). Synthetic replacements for human survey data? The perils of large language models. *Political Analysis, 32*(4), 401–416. https://doi.org/10.1017/pan.2024.5
- Chapman, J., Dean, M., Ortoleva, P., Snowberg, E., & Camerer, C. (2023). Econographics. *Journal of Political Economy Microeconomics, 1*(1), 115–161. https://doi.org/10.1086/723044
- Chuang, Y., & Schechter, L. (2015). Stability of experimental and survey measures of risk, time, and social preferences: A review and some new results. *Journal of Development Economics, 117*, 151–170. https://doi.org/10.1016/j.jdeveco.2015.07.008
- Connelly, B. S., & Ones, D. S. (2010). An other perspective on personality: Meta-analytic integration of observers' accuracy and predictive validity. *Psychological Bulletin, 136*(6), 1092–1122. https://doi.org/10.1037/a0021212
- Cui, Z., Li, N., & Zhou, H. (2025). A large-scale replication of scenario-based experiments in psychology and management using large language models. *Nature Computational Science, 5*(8), 627–634. https://doi.org/10.1038/s43588-025-00840-7
- Dang, J., King, K. M., & Inzlicht, M. (2020). Why are self-report and behavioral measures weakly correlated? *Trends in Cognitive Sciences, 24*(4), 267–269. https://doi.org/10.1016/j.tics.2020.01.007
- Dean, M., & Ortoleva, P. (2019). The empirical relationship between nonstandard economic behaviors. *Proceedings of the National Academy of Sciences, 116*(33), 16262–16267. https://doi.org/10.1073/pnas.1821353116
- Diener, E., & Larsen, R. J. (1984). Temporal stability and cross-situational consistency of affective, behavioral, and cognitive responses. *Journal of Personality and Social Psychology, 47*(4), 871–883. https://doi.org/10.1037/0022-3514.47.4.871
- Dohmen, T., Falk, A., Huffman, D., Sunde, U., Schupp, J., & Wagner, G. G. (2005). *Individual risk attitudes: New evidence from a large, representative, experimentally-validated survey* (IZA Discussion Paper No. 1730). Institute for the Study of Labor (IZA). https://docs.iza.org/dp1730.pdf
- Dohmen, T., Falk, A., Huffman, D., Sunde, U., Schupp, J., & Wagner, G. G. (2011). Individual risk attitudes: Measurement, determinants, and behavioral consequences. *Journal of the European Economic Association, 9*(3), 522–550. https://doi.org/10.1111/j.1542-4774.2011.01015.x
- Duckworth, A. L., & Kern, M. L. (2011). A meta-analysis of the convergent validity of self-control measures. *Journal of Research in Personality, 45*(3), 259–268. https://doi.org/10.1016/j.jrp.2011.02.004
- Eisenberg, I. W., Bissett, P. G., Enkavi, A. Z., Li, J., MacKinnon, D. P., Marsch, L. A., & Poldrack, R. A. (2019). Uncovering the structure of self-regulation through data-driven ontology discovery. *Nature Communications, 10*, Article 2319. https://doi.org/10.1038/s41467-019-10301-1
- Enkavi, A. Z., Eisenberg, I. W., Bissett, P. G., Mazza, G. L., MacKinnon, D. P., Marsch, L. A., & Poldrack, R. A. (2019). Large-scale analysis of test–retest reliabilities of self-regulation measures. *Proceedings of the National Academy of Sciences, 116*(12), 5472–5477. https://doi.org/10.1073/pnas.1818430116
- Epley, N., & Dunning, D. (2000). Feeling "holier than thou": Are self-serving assessments produced by errors in self- or social prediction? *Journal of Personality and Social Psychology, 79*(6), 861–875. https://doi.org/10.1037/0022-3514.79.6.861
- Epley, N., & Dunning, D. (2006). The mixed blessings of self-knowledge in behavioral prediction: Enhanced discrimination but exacerbated bias. *Personality and Social Psychology Bulletin, 32*(5), 641–655. https://doi.org/10.1177/0146167205284007
- Epstein, S. (1979). The stability of behavior: I. On predicting most of the people much of the time. *Journal of Personality and Social Psychology, 37*(7), 1097–1126. https://doi.org/10.1037/0022-3514.37.7.1097
- Epstein, S. (1983). Aggregation and beyond: Some basic issues on the prediction of behavior. *Journal of Personality, 51*(3), 360–392. https://doi.org/10.1111/j.1467-6494.1983.tb00338.x
- Falk, A., Becker, A., Dohmen, T., Huffman, D., & Sunde, U. (2016). *The Preference Survey Module: A validated instrument for measuring risk, time, and social preferences* (IZA Discussion Paper No. 9674). Institute for the Study of Labor (IZA). https://docs.iza.org/dp9674.pdf
- Falk, A., Becker, A., Dohmen, T., Huffman, D., & Sunde, U. (2023). The Preference Survey Module: A validated instrument for measuring risk, time, and social preferences. *Management Science, 69*(4), 1935–1950. https://doi.org/10.1287/mnsc.2022.4455
- Fleeson, W. (2001). Toward a structure- and process-integrated view of personality: Traits as density distributions of states. *Journal of Personality and Social Psychology, 80*(6), 1011–1027. https://doi.org/10.1037/0022-3514.80.6.1011
- Fleeson, W., & Gallagher, P. (2009). The implications of Big Five standing for the distribution of trait manifestation in behavior: Fifteen experience-sampling studies and a meta-analysis. *Journal of Personality and Social Psychology, 97*(6), 1097–1114. https://doi.org/10.1037/a0016786
- Fleeson, W., & Law, M. K. (2015). Trait enactments as density distributions: The role of actors, situations, and observers in explaining stability and variability. *Journal of Personality and Social Psychology, 109*(6), 1090–1104. https://doi.org/10.1037/a0039517
- Frey, R., Pedroni, A., Mata, R., Rieskamp, J., & Hertwig, R. (2017). Risk preference shares the psychometric structure of major psychological traits. *Science Advances, 3*(10), e1701381. https://doi.org/10.1126/sciadv.1701381
- Galizzi, M. M., & Navarro-Martinez, D. (2019). On the external validity of social preference games: A systematic lab-field study. *Management Science, 65*(3), 976–1002. https://doi.org/10.1287/mnsc.2017.2908
- Gao, Y., Lee, D., Burtch, G., & Fazelpour, S. (2025). Take caution in using LLMs as human surrogates. *Proceedings of the National Academy of Sciences, 122*(24), e2501660122. https://doi.org/10.1073/pnas.2501660122
- Hedge, C., Powell, G., & Sumner, P. (2018). The reliability paradox: Why robust cognitive tasks do not produce reliable individual differences. *Behavior Research Methods, 50*(3), 1166–1186. https://doi.org/10.3758/s13428-017-0935-1
- Helzer, E. G., & Dunning, D. (2012). Why and when peer prediction is superior to self-prediction: The weight given to future aspiration versus past achievement. *Journal of Personality and Social Psychology, 103*(1), 38–53. https://doi.org/10.1037/a0028124
- Horton, J. J. (2023). *Large language models as simulated economic agents: What can we learn from homo silicus?* (Version 1) [Preprint]. arXiv:2301.07543v1
- Horton, J. J., Filippas, A., & Manning, B. S. (2026). *Large language models as simulated economic agents: What can we learn from homo silicus?* (Version 2) [Preprint]. arXiv:2301.07543v2
- Hwang, E., Majumder, B. P., & Tandon, N. (2023). *Aligning language models to user opinions* [Preprint]. arXiv:2305.14929
- Kang, W.-C., Ni, J., Mehta, N., Sathiamoorthy, M., Hong, L., Chi, E., & Cheng, D. Z. (2023). *Do LLMs understand user preferences? Evaluating LLMs on user rating prediction* [Preprint]. arXiv:2305.06474
- Kelley, T. L. (1927). *Interpretation of educational measurements*. World Book Company.
- Kinzinger, L., & Hartmann, J. (2026). *Synthetic personalities: How well can LLMs mimic individual respondents using socio-economic microdata?* [Preprint]. arXiv:2606.04592
- Kolar, D. W., Funder, D. C., & Colvin, C. R. (1996). Comparing the accuracy of personality judgments by the self and knowledgeable others. *Journal of Personality, 64*(2), 311–337. https://doi.org/10.1111/j.1467-6494.1996.tb00513.x
- Kosinski, M., Stillwell, D., & Graepel, T. (2013). Private traits and attributes are predictable from digital records of human behavior. *Proceedings of the National Academy of Sciences, 110*(15), 5802–5805. https://doi.org/10.1073/pnas.1218772110
- Mata, R., Frey, R., Richter, D., Schupp, J., & Hertwig, R. (2018). Risk preference: A view from psychology. *Journal of Economic Perspectives, 32*(2), 155–172. https://doi.org/10.1257/jep.32.2.155
- Mei, Q., Xie, Y., Yuan, W., & Jackson, M. O. (2024). A Turing test of whether AI chatbots are behaviorally similar to humans. *Proceedings of the National Academy of Sciences, 121*(9), e2313925121. https://doi.org/10.1073/pnas.2313925121
- Mischel, W. (1968). *Personality and assessment*. Wiley.
- Mischel, W. (2004). Toward an integrative science of the person. *Annual Review of Psychology, 55*, 1–22. https://doi.org/10.1146/annurev.psych.55.042902.130709
- Mischel, W., & Peake, P. K. (1982). Beyond déjà vu in the search for cross-situational consistency. *Psychological Review, 89*(6), 730–755. https://doi.org/10.1037/0033-295X.89.6.730
- Mischel, W., & Shoda, Y. (1995). A cognitive-affective system theory of personality: Reconceptualizing situations, dispositions, dynamics, and invariance in personality structure. *Psychological Review, 102*(2), 246–268. https://doi.org/10.1037/0033-295X.102.2.246
- Murphy, A. H. (1992). Climatology, persistence, and their linear combination as standards of reference in skill scores. *Weather and Forecasting, 7*(4), 692–698. https://doi.org/10.1175/1520-0434(1992)007<0692:CPATLC>2.0.CO;2
- Ouellette, J. A., & Wood, W. (1998). Habit and intention in everyday life: The multiple processes by which past behavior predicts future behavior. *Psychological Bulletin, 124*(1), 54–74. https://doi.org/10.1037/0033-2909.124.1.54
- Park, J. S., Zou, C. Q., Kamphorst, J., Egan, N., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Liang, P., Willer, R., & Bernstein, M. S. (2026). *LLM agents grounded in self-reports enable general-purpose simulation of individuals* (Version 3) [Preprint]. arXiv:2411.10109v3
- Park, J. S., Zou, C. Q., Shaw, A., Hill, B. M., Cai, C., Morris, M. R., Willer, R., Liang, P., & Bernstein, M. S. (2024). *Generative agent simulations of 1,000 people* (Version 1) [Preprint]. arXiv:2411.10109v1
- Pedroni, A., Frey, R., Bruhin, A., Dutilh, G., Hertwig, R., & Rieskamp, J. (2017). The risk elicitation puzzle. *Nature Human Behaviour, 1*, 803–809. https://doi.org/10.1038/s41562-017-0219-x
- Peng, T., Gui, G., Brucks, M., Merlau, D. J., Fan, G. J., Ben Sliman, M., Johnson, E. J., Althenayyan, A., Bellezza, S., Donati, D., Fong, H., Friedman, E., Guevara, A., Hussein, M., Jerath, K., Kogut, B., Kumar, A., Lane, K., Li, H., . . . Toubia, O. (2026). *Digital twins as funhouse mirrors: Five key distortions* (Version 5) [Preprint]. arXiv:2509.19088v5
- Peysakhovich, A., Nowak, M. A., & Rand, D. G. (2014). Humans display a 'cooperative phenotype' that is domain general and temporally stable. *Nature Communications, 5*, Article 4939. https://doi.org/10.1038/ncomms5939
- Pletzer, J. L., Balliet, D., Joireman, J., Kuhlman, D. M., Voelpel, S. C., & Van Lange, P. A. M. (2018). Social value orientation, expectations, and cooperation in social dilemmas: A meta-analysis. *European Journal of Personality, 32*, 62–83. https://doi.org/10.1002/per.2139
- Plonsky, O., Apel, R., Ert, E., Tennenholtz, M., Bourgin, D., Peterson, J. C., Reichman, D., Griffiths, T. L., Russell, S. J., Carter, E. C., Cavanagh, J. F., & Erev, I. (2025). Predicting human decisions with behavioural theories and machine learning. *Nature Human Behaviour, 9*(11), 2271–2284. https://doi.org/10.1038/s41562-025-02267-6
- Salecha, A., Ireland, M. E., Subrahmanya, S., Sedoc, J., Ungar, L. H., & Eichstaedt, J. C. (2024). Large language models display human-like social desirability biases in Big Five personality surveys. *PNAS Nexus, 3*(12), pgae533. https://doi.org/10.1093/pnasnexus/pgae533
- Sheeran, P. (2002). Intention–behavior relations: A conceptual and empirical review. *European Review of Social Psychology, 12*(1), 1–36. https://doi.org/10.1080/14792772143000003
- Sheeran, P., & Webb, T. L. (2016). The intention–behavior gap. *Social and Personality Psychology Compass, 10*(9), 503–518. https://doi.org/10.1111/spc3.12265
- Shoda, Y., Mischel, W., & Wright, J. C. (1994). Intraindividual stability in the organization and patterning of behavior: Incorporating psychological situations into the idiographic analysis of personality. *Journal of Personality and Social Psychology, 67*(4), 674–687. https://doi.org/10.1037/0022-3514.67.4.674
- Spain, J. S., Eaton, L. G., & Funder, D. C. (2000). Perspective on personality: The relative accuracy of self versus others for the prediction of emotion and behavior. *Journal of Personality, 68*(5), 837–867. https://doi.org/10.1111/1467-6494.00118
- Stango, V., & Zinman, J. (2023). We are all behavioural, more or less: A taxonomy of consumer decision-making. *Review of Economic Studies, 90*(3), 1470–1498. https://doi.org/10.1093/restud/rdac055
- Thielmann, I., Spadaro, G., & Balliet, D. (2020). Personality and prosocial behavior: A theoretical framework and meta-analysis. *Psychological Bulletin, 146*(1), 30–90. https://doi.org/10.1037/bul0000217
- Toubia, O., Gui, G. Z., Peng, T., Merlau, D. J., Li, A., & Chen, H. (2025). Database report: Twin-2K-500: A data set for building digital twins of over 2,000 people based on their answers to over 500 questions. *Marketing Science, 44*(6), 1446–1455. https://doi.org/10.1287/mksc.2025.0262
- Vallone, R. P., Griffin, D. W., Lin, S., & Ross, L. (1990). Overconfident prediction of future actions and outcomes by self and others. *Journal of Personality and Social Psychology, 58*(4), 582–592. https://doi.org/10.1037/0022-3514.58.4.582
- Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. *Journal of Personality and Social Psychology, 98*(2), 281–300. https://doi.org/10.1037/a0017908
- Vazire, S., & Mehl, M. R. (2008). Knowing me, knowing you: The accuracy and unique predictive validity of self-ratings and other-ratings of daily behavior. *Journal of Personality and Social Psychology, 95*(5), 1202–1216. https://doi.org/10.1037/a0013314
- Wang, A., Morgenstern, J., & Dickerson, J. P. (2025). Large language models that replace human participants can harmfully misportray and flatten identity groups. *Nature Machine Intelligence, 7*, 400–411. https://doi.org/10.1038/s42256-025-00986-z
- Wang, S., Hunt, K., Tang, S., & Joseph, K. (2026). *When can LLM digital twins reduce human measurement? From behavioral fidelity to statistical substitutability* [Preprint]. arXiv:2609.07987
- Wang, Z., Lu, Y., Li, W., Amini, A., Sun, B., Bart, Y., Lyu, W., Gesi, J., Wang, T., Huang, J., Su, Y., Ehsan, U., Alikhani, M., Li, T. J.-J., Chilton, L., & Wang, D. (2025). *OPeRA: A dataset of observation, persona, rationale, and action for evaluating LLMs on human online shopping behavior simulation* [Preprint]. arXiv:2506.05606
- Webb, T. L., & Sheeran, P. (2006). Does changing behavioral intentions engender behavior change? A meta-analysis of the experimental evidence. *Psychological Bulletin, 132*(2), 249–268. https://doi.org/10.1037/0033-2909.132.2.249
- Ye, I., Deng, T., & Candogan, O. (2026). *Beyond raw transcripts: Structured persona extraction for LLM-based digital twins* [Preprint]. arXiv:2608.20344
- Youyou, W., Kosinski, M., & Stillwell, D. (2015). Computer-based personality judgments are more accurate than those made by humans. *Proceedings of the National Academy of Sciences, 112*(4), 1036–1040. https://doi.org/10.1073/pnas.1418680112
