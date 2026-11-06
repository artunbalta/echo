# Pre-registration addendum: the same question on incentivised behaviour (Basel–Berlin Risk Study)

*Secondary analysis of public data. Committed before any predictive model was fitted on these data; the
commit that adds this file is the timestamp. It extends PREREG.md (Twin-2K-500), whose choices were
hypothetical. Here the behaviour is incentivised.*

## 0. What was seen before this was written

- The study's files, and their codebook columns.
- A literature agent's raw correlations, computed on these files on 2026-11-06 (scratchpad, not
  committed):
  - Retest of the seven tasks, about six months apart: r ≈ .45 (price list), .28 (lotteries), .27
    (description), .00 (experience, % risky), .65 (Columbia Card Task), .55 (BART), .47 (marbles).
  - Mean correlation between tasks .11.
  - SOEP general item to tasks: mean .11.
- No regression, echo or skill has been computed on these data. The hypotheses follow from the
  theory (`research/deeds/deeds/theory.py`) and are stated before testing.

## 1. Data

**Source.** Basel–Berlin Risk Study (Frey et al. 2017, *Science Advances*; OSF rce7g; CC BY 4.0).

- **Main sample.** N = 1,507; seven behavioural risk tasks, six of them incentivised.
- **Retest sample.** About six months later, in Berlin (n ≈ 108) and Basel (n ≈ 63). A person is
  matched across sessions by `partid // 100`.

**Behaviour.** One index per task, as in Frey et al. 2017, each coded so that higher means riskier:

| Task | Index |
|---|---|
| Price list | `MPL R` |
| Adaptive lotteries | `LOT R` |
| Decisions from description | `DFD R` |
| Decisions from experience | `DFE R` |
| Columbia Card Task | `CCTncards` |
| BART | `pumps_adj` |
| Marbles | `MTr` |

**Words.** Every self-report scale score in `quest_scores.csv` that is a risk, impulsivity or
sensation-seeking measure:

- SOEP general and its six domains;
- DOSPERT risk-taking, perception and benefit subscales;
- GABS, PRI, PRIw;
- the BIS-11 subscales and total;
- the SSS-V subscales and total;
- AUDIT, FTND and DAST.

## 2. Witnesses

**The target.** Task X at the retest. Each task is z-scored within each session (main session in the
main sample, retest session in the retest sample), so a witness guesses the person's standing.

| Witness | What it uses |
|---|---|
| crowd | 0, the mean standing |
| words | ridge from session-1 words, trained on main-sample people not in the retest, predicting their session-1 task X |
| elsewhere | ridge from the six other tasks at session 1, trained the same way |
| persona | words and elsewhere together |
| copy | the person's own session-1 task X |
| echo | a + b·persona + c·copy, with (a, b, c) fitted on the other retest people (leave-one-out) |

**Skill.** 1 − MSE / var(target) over the retest people, for each task.

**Theory** (deeds/theory.py), with ρ the retest r and π the persona's r² with the retest target:

- copy: 2ρ − 1
- echo: π + (ρ − π)² / (1 − π)

## 3. Hypotheses

- **B1. Copying loses to the crowd where a task is less than half steady.** On every task whose
  retest r is below .5, skill(copy) < 0. Across tasks, skill(copy) tracks 2ρ − 1.
- **B2. The echo never loses to the crowd and always beats copying.** skill(echo) > 0 on every task, and
  skill(echo) > skill(copy) on every task. Mean skills are compared by a paired bootstrap over people.
- **B3. Words know little.** Mean skill(words) over the seven tasks is below .05.
- **B4** (descriptive). The theory's echo skill against the observed one, per task.

**Inference.** Bootstrap over people (2,000 draws), with percentile intervals. Per-task claims are read
from point estimates with their intervals. The sample is small (about 170 people), and that is reported.
