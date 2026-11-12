# A citation the manuscript should carry: Netzer & Sambandam (2026)

*Found 2026-11-12 while checking what others had published before putting the audit on a public page
(web decision C90). Nothing in the manuscript files was changed; this note is for the author.*

## What was found

Oded Netzer and Rajan Sambandam, "Synthetic Data in Marketing Research: How to Evaluate and When to
Trust", arXiv:2609.13995 (v1 12 September 2026, v2 19 September 2026).

Read in the paper's own text (the PDF, not a summary):

- They write that reporting a twin's accuracy as a ratio to the retest "conceals the distance from the
  floor", and that expressing performance as
  `(Accuracy − Accuracy_chance) / (Accuracy_retest − Accuracy_chance)` "anchors the results at both ends".
- For multiple-choice items they recommend the "modal-answer predictor" as the floor.
- They propose a "wrong-person twin test" (rebuild each twin from a different respondent's record), citing
  Miller (2026).

Netzer is a co-author of Peng et al. (2026), which the manuscript already cites.

## Why it matters

The manuscript introduces the personal knowledge index (Results, "we call it the personal knowledge
index"; Methods, where the crowd's accuracy and the knowable ceiling are defined) without saying that a
floor-and-ceiling normalisation of twin accuracy was proposed two months earlier. A reviewer from
marketing science is likely to know that paper. Citing it costs nothing and removes the objection.

## What is still the manuscript's own

- **The ceiling.** Theirs is the raw retest. The manuscript's is the best any guess could achieve given
  each item's reliability (the ordered latent model), which is why a person's own retest lands near 52% of
  the index and not at 100%. That difference is a result, not a detail: copying a person's earlier answer
  is not the ceiling, and below reliability one half it is worse than the crowd.
- **The floor.** Theirs is chance or the modal answer; the manuscript's is the crowd's out-of-fold median
  (the best constant under the metric's own loss).
- **The laws and the looks curve.** Copying scores 2ρ − 1; one look read properly scores ρ²; how fast a
  person becomes knowable is forecast from pairs of observations. None of this is in their paper as far
  as the text read shows.

## A sentence that would do it

Where the index is first defined:

> A normalisation of this form, with chance or the modal answer as the floor and the person's own retest
> as the ceiling, was recently proposed for evaluating synthetic respondents (Netzer & Sambandam, 2026).
> Ours differs in its two anchors: the floor is the crowd's median answer, and the ceiling is not the
> retest itself but the most that any predictor could achieve given each item's reliability.

Reference:

> Netzer, O., & Sambandam, R. (2026). Synthetic data in marketing research: How to evaluate and when to
> trust. arXiv:2609.13995.

Read the section yourself before citing it: only the passages quoted above were read here.

## Two more, found the same night and not read in full

- Chen, Zhu & Zheng (2026), "When Synthetic Users Fail: A Cross-Domain Benchmark of LLM-Simulated Human Survey Responses", arXiv:2607.26348 (28 July 2026): its abstract says that at the
  individual level no LLM beats the strongest simple baseline on GSS and WVS items. If so, it belongs
  beside Peng et al. in the introduction. Only the abstract was read here.
- A small public repository (`digital-twin-baselines`) reports a leave-one-out crowd-mode baseline on
  Twin-2K-500. Not a paper; no need to cite, but it shows the crowd baseline was in the air.
