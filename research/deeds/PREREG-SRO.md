# Pre-registration addendum: the same question across 138 behavioural measures (Self-Regulation Ontology)

*Secondary analysis of public data. Committed before any predictive model was fitted on these data; the
commit that adds this file is the timestamp. It extends PREREG.md and PREREG-BBRS.md. Those two
studies tested the theory on a handful of tasks; this one tests its laws across the whole range of
reliabilities.*

## 0. What was seen before this was written

- The files' structure: 522 people at time 1, 151 at the retest (150 matched), and 204 "meaningful
  variables" (132 from tasks, 72 from surveys).
- A literature agent's retest correlations for some tasks, computed 2026-11-05: Kirby .79, discount
  titration .47, Bickel titrator .61, Holt–Laury .39, Columbia Card Task hot .70 and cold .45, Angling
  Risk Task .35, two-step .44. Also its survey-to-task correlations, all |r| ≤ .16.
- No regression, echo or skill has been computed.

## 1. Data

**Source.** The Self-Regulation Ontology (Eisenberg et al., 2019; Enkavi et al., 2019; GitHub
IanEisenberg/Self_Regulation_Ontology, `Data/Complete_02-16-2019` and `Data/Retest_02-16-2019`,
`meaningful_variables.csv`; CC BY 4.0). It has 522 MTurk adults; 150 of them were retested about 111
days later.

**Deeds and words.** Each measure is classified by what it records, decided before any relationship
between measures was computed.

- **Deeds** are the 132 task variables, plus `holt_laury_survey` (a price list of lottery choices) and
  `cognitive_reflection_survey` (a performance test). Both are behaviour delivered as a form: 138 in
  all.
- **Words** are the other 66 survey variables: what people say about themselves.

## 2. Witnesses

**The target.** Each deed variable X, at the retest. It is z-scored within each session: time 1 among
the 522, the retest among the 150.

| Witness | What it uses |
|---|---|
| crowd | 0 |
| words | ridge from the 66 word variables at time 1, trained on the 372 people not retested, predicting their time-1 X |
| elsewhere | ridge from the deed variables of the other tasks (every variable of X's own task excluded), trained the same way |
| persona | words and elsewhere together |
| copy | the person's own time-1 X |
| echo | a + b·persona + c·copy, fitted on the other retested people (leave-one-out) |
| echo without persona | a + c·copy, fitted the same way |

**Skill** is 1 − MSE / var(target) over the 150, for each variable. ρ is the variable's time-1/retest r
among the 150.

## 3. Hypotheses

- **S1.** Across the 138 deeds, skill(copy) tracks 2ρ − 1: the correlation across variables is above .9.
  Where ρ < .5, skill(copy) < 0 for at least 90% of variables.
- **S2.** skill(echo without persona) > skill(copy) for at least 90% of variables, and in mean (paired
  bootstrap over people of the mean across variables). Across variables it tracks ρ².
- **S3.** Mean skill(words) over the 138 deeds is below .05.
- **S4** (descriptive). The same witnesses with the 66 words as targets, as the contrast: words about
  words.

**Inference.** The claims are about the distribution over variables, with bootstrap intervals over
people (1,000 draws) for the means. Variables are not independent: they come in tasks, and that is
said wherever it matters.
