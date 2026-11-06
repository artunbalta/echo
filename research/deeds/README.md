# Who knows you best, on public data: the crowd, the persona, and one look

The paper's first two studies (research/paper/). They test, on public data, the theory the ECHO pilot was
built on: what can be known about a person's next choice, and who knows it. Both are pre-registered, and
each registration was committed before any model was fitted:

| Study | Data | Registration |
|---|---|---|
| 1 | Twin-2K-500: 2,058 US adults, 17 retested tasks | `PREREG.md` (63757d0) |
| 2 | Basel–Berlin Risk Study: incentivised risk tasks, six-month retest | `PREREG-BBRS.md` (dfc8349) |
| 2b | Self-Regulation Ontology: 138 behavioural and 66 survey measures, four-month retest | `PREREG-SRO.md` (2c23f3b) |

```
research/deeds/
  fetch.py               the public data, into data/ (not committed)
  PREREG.md, PREREG-BBRS.md
  run_twin2k.py          every model-based witness, out of fold, in parallel (≈ 14 min on 9 cores)
  analyze_twin2k.py      the registered scoring and tests → out/twin2k/results.json, summary.md
  fair_llm_twin2k.py     the twins on the people they answered (a reported deviation, see below)
  ceiling_twin2k.py      the knowable ceiling and the looks curve per column → out/twin2k/ceiling.json
  exchange_twin2k.py     the exchange rate: r from k items of each pool
  robust_hgb_twin2k.py   registered robustness: a boosted median model for the persona
  exploratory_twin2k.py  exploratory: the one-look echo from the crowd's own transitions
  run_bbrs.py            Study 2, all of it → out/bbrs/results.json
  run_sro.py             Study 2b, all of it → out/sro/results.json
  facts.py               every number the paper quotes → runs/facts.json (and the result files → runs/)
  figures_twin2k.py      the figures (SVG in the pilot report's language) → out/figures/
  runs/                  the result files the paper is built from (committed)
  deeds/
    data.py              Twin-2K-500 as the study reads it, with the authors' scoring constants
    score.py             accuracy (the authors' metric, reproduced to the digit), individual r, resampling
    witnesses.py         base, ridge twins, again, the two-layer echo (nested), the echo on an external prior
    ceiling.py           the ordered latent model: retest, base, ceiling, looks
    theory.py            the Gaussian closed forms (they generalise the pilot's)
    figures.py           the charts
  tests/                 nothing sees what it predicts (and six planted leaks are caught); the theory
```

## Running it

The Anaconda Python has what the study needs. Its OpenBLAS is pathologically slow at multi-threaded SVD
on this Mac (62 s against 0.95 s), so `deeds/__init__.py` pins every BLAS to one thread, and parallelism
is across processes. Long runs need the machine awake:

```sh
PY=/opt/anaconda3/bin/python3.13
$PY research/deeds/fetch.py
caffeinate -i -s $PY research/deeds/run_twin2k.py --workers 9
$PY research/deeds/exploratory_twin2k.py && $PY research/deeds/robust_hgb_twin2k.py
$PY research/deeds/analyze_twin2k.py && $PY research/deeds/fair_llm_twin2k.py
$PY research/deeds/ceiling_twin2k.py && $PY research/deeds/exchange_twin2k.py
$PY research/deeds/run_bbrs.py && $PY research/deeds/run_sro.py
$PY research/deeds/facts.py && $PY research/deeds/figures_twin2k.py
$PY -m pytest research/deeds/tests -q
```

## What it promises

- **The authors' numbers, reproduced.** The retest scores 0.8173 (paper 0.8172) and the headline twin
  0.7171 (0.7172). The other twelve specifications match the paper's Table 2.
- **Nothing sees what it predicts.** Changing one person's truth moves none of their guesses, for every
  witness, while it does move someone else's. Six plausible slips planted in the code are each caught:
  - training on the test fold;
  - rounding to one's own answer;
  - the crowd including oneself;
  - the echo's prior seeing the test fold;
  - the echo's rounding admitting one's own answer;
  - the stacker fitted on the test people.
- **The theory, held to its own model.** The closed forms match a Monte Carlo of the model. The ordinal
  ceiling matches a simulation (0.8565 against 0.8563).

## Deviations from the registrations, all reported

- **Number of LLM specifications.** The registration counted 11; the release has 13 distinct ones (the
  default folder duplicates "Text Persona – GPT4.1-mini" byte for byte). All are used.
- **Partial coverage.** Some specifications cover only some people (1,000 and 1,558). The registered
  rule scores a silent twin as the base, which pulls a half-silent twin towards the crowd. So
  `fair_llm_twin2k.py` also scores each twin on the people it answered; the conclusions do not change.
- **Exploratory witnesses.** The crowd-transition echo is exploratory. So is the per-task test of
  "copying beats the crowd iff ρ > ½".
