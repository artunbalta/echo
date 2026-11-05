# Pre-registration: words, deeds, and the same situation again (Twin-2K-500)

*Secondary analysis of public data, in the shape of the OSF template for secondary data. Committed before any
predictive model was fitted; the commit that adds this file is the registration's timestamp.*

## 0. What was seen before this was written

Disclosed because a secondary analysis can only be as blind as its authors were.

- **Seen.**
  - The dataset's README, question catalog, and per-column counts and types (`research/deeds/fetch.py` and a
    codebook built from the catalog).
  - A check that the authors' formatted files and the catalog files carry identical values for the same
    126 columns. This compared each variable with itself, never with another.
  - The authors' released evaluation sheets for the LLM twins (`mad_accuracy_summary.xlsx`). These include,
    per task, the twins' accuracy and their correlation with the person's answer (about 0.06–0.10 on average
    over tasks, against 0.49 for the person's own retest).
  - The Twin-2K-500 paper (arXiv 2505.17479 v1) and the abstract and parts of "Digital Twins as Funhouse
    Mirrors" (arXiv 2509.19088 v5). The latter reports r ≈ 0.20 for twins on 164 new outcomes, twins only
    modestly above an empty-persona LLM, and twins about as good as XGBoost trained on ~75 responses.
- **Not yet computed.** No base rate, no regression, no echo, no correlation between any two different
  variables. Every hypothesis below is about a quantity not yet computed.
- **Known going in.** The LLM twins' low correlations are known. H2 therefore says only that a
  statistical twin on the same information beats them, which is not known.

## 1. Data

**Source.** Twin-2K-500 (Toubia et al. 2025; HuggingFace `LLM-Digital-Twin/Twin-2K-500`, revision of
2026-03-28; CC-BY-4.0). There are N = 2,058 US adults, surveyed in four waves.

- **Waves 1–3.** The persona: demographics (14), self-descriptions (338 columns: Big Five, values, needs,
  symptoms…), cognitive tests (68), economic choices (194: ultimatum, dictator, trust, risk and time
  price lists, mental accounting), and free text.
- **Waves 1–3, outside the persona.** The 17 heuristics-and-biases, pricing and false-consensus tasks
  (126 columns).
- **Wave 4.** The same 126 columns again, two weeks after wave 3.

**LLM twins.** The released wave-4 predictions of the authors' twins. There are 11 specifications with
evaluation sheets: GPT-4.1, GPT-4.1-mini, Gemini 2.5 Flash, and fine-tuned GPT-4.1-mini, in several
persona formats. Each was given the persona and not the 17 tasks' earlier answers.

## 2. Questions

1. Without the same situation, how much of a person's answer can be predicted from what they say about
   themselves, what they chose elsewhere, and who they are? And does an LLM twin extract more of it than a
   regression does?
2. How much does one earlier answer in the same situation carry, against all of that?
3. Is the person's own retest a ceiling, as the field's "normalised accuracy" treats it?

## 3. Settings, witnesses, metrics

**Direction.**

- **Primary: forward.** The truth is wave 4; every witness uses waves 1–3 only.
- **Secondary: published.** The truth is waves 1–3 and wave 4 is the retest witness, as in the authors'
  code. This is reported beside the primary for comparability with their 71.72% / 81.72%.

**Witnesses.** For person *i*, each is a function of other people's data and *i*'s predictors only, never
*i*'s truth. Models are fitted per target column with 10-fold cross-validation over people (seed 0).

| Witness | Information about *i* |
|---|---|
| base | none: the median (and mean) of other people's answers |
| llm_* | the persona, through each released LLM specification; llm_best is the best of 11 by accuracy, chosen on the test data (favours the LLM) |
| llm_mean | the average of the 11 specifications' predictions, a continuous score |
| facts | demographics |
| self | self-descriptions (personality, values, symptoms, spending style) |
| choices | economic choices |
| tests | cognitive tests |
| words | facts + self |
| deeds | choices + tests |
| persona | all four: the LLM's information without its free text |
| persona+others | persona plus *i*'s waves 1–3 answers to the other 16 tasks |
| again | *i*'s own earlier answer to the same column |
| echo | the two-layer combination of again and persona+others, stacked by nested CV |
| echo_llm | the two-layer combination of again and llm_mean |

**Models.**

- Ridge regression on standardised features, with the penalty chosen by efficient leave-one-out on the
  training people.
- Encoding:
  - Multiple-choice answers and the five most frequent answers of numeric text fields are one-hot coded.
  - Likert and price-list rows are numeric.
  - Missing values are imputed with the training mean, plus a missing indicator.
  - Free text is excluded.
- The point prediction is the score rounded to the nearest admissible value and clipped to the range. For
  binary items this is the median.

**Accuracy.** As in the authors' code (`evaluation/mad_accuracy_evaluation.py`):

- 1 − |prediction − truth| / range, with their ranges and task map.
- The anchoring answers are converted to deciles of the pooled waves 1–3 answers.
- Each person gets the mean over the 17 tasks of the task's mean.
- Then the mean is taken over people.
- **Normalised accuracy** is accuracy over accuracy(again).

**Individual-level r.** Pearson r across people, per column, between the point prediction and the truth; a
constant prediction scores 0. It is averaged within a task, then over the 17 tasks. The score version uses
continuous predictions where a witness has them.

## 4. Hypotheses (forward direction; one-sided unless stated)

- **H1. Accuracy does not show personalisation.** The best LLM twin's accuracy exceeds base's by less than
  one point. Δ = acc(llm_best) − acc(base); H1 holds if the upper bound of the one-sided 95% interval
  of Δ is below 0.01.
- **H2. A regression knows individuals better than the twins, on the twins' own information.**
  Mean individual-level r of persona exceeds llm_best's. Tested by a sign test over the 17 tasks and a
  bootstrap over people.
- **H3. The same situation, once, outweighs everything else.** r(again) > r(persona+others) in at least
  13 of 17 tasks (sign test, p < .05) and in the mean.
- **H4. Retest is not a ceiling.** acc(echo) > acc(again), so normalised accuracy exceeds 1. Tested by a
  paired bootstrap over people.
- **H5** (two-sided, exploratory). Mean r of deeds versus words.
- **H6** (descriptive). The closed form predicts the echo's r² per task from retest reliability ρ and the
  persona's out-of-fold share π:

  r²(echo) = π + (ρ − π)² / (1 − π)

  This is the two-layer echo after one look, with the persona as its prior. Reported: the agreement
  across tasks.
- **The exchange rate** (descriptive). r as a function of the number k of randomly drawn items from each
  pool (self, choices, tests, others; 20 draws per k). Reported: the k, if any, at which a pool reaches
  r(again).

## 5. Inference

- **Over people:** 2,000 bootstrap resamples, percentile intervals.
- **Over tasks:** sign tests.
- **Correction:** H1–H4 at one-sided α = .05 with Holm's correction across the four.
- **Leakage guard:** a test changes a person's truth and checks that no prediction for that person moves,
  for every witness.

## 6. Robustness, reported whatever they show

- The published direction.
- A gradient-boosted median model in place of ridge.
- Without the anchoring tasks.
- Within-subject tasks only.
- Per-task tables for every witness.

## 7. Exploratory, after the above

The mega-study (19 new studies on the same panel; arXiv 2509.19088): persona regressions against the
released LLM twins on each outcome's individual-level r. These are labelled exploratory wherever reported.
