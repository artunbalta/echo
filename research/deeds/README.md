# Who knows you best, on public data: the crowd, the persona, and one look

The paper's studies on public data (research/paper/). They test the theory the ECHO pilot was built on:
what can be known about a person's next choice, and who knows it. All are pre-registered, and each
registration was committed before any model was fitted (the Moral Machine's, before its response files
were opened):

| Study | Data | Registration |
|---|---|---|
| 1 | Twin-2K-500: 2,058 US adults, 17 retested tasks | `PREREG.md` (63757d0) |
| 2 | Basel–Berlin Risk Study: incentivised risk tasks, six-month retest | `PREREG-BBRS.md` (dfc8349) |
| 2b | Self-Regulation Ontology: 138 behavioural and 66 survey measures, four-month retest | `PREREG-SRO.md` (2c23f3b) |
| 2c | Moral Machine: 31.5 million dilemmas from 2.09 million browsers, many seen in many visits | `PREREG-MM.md` (3748247) |

```
research/deeds/
  fetch.py               the public data, into data/ (not committed)
  PREREG.md, PREREG-BBRS.md
  run_twin2k.py          every model-based witness, out of fold, in parallel (≈ 14 min on 9 cores)
  analyze_twin2k.py      the registered scoring and tests → out/twin2k/results.json, summary.md
  fair_llm_twin2k.py     the twins on the people they answered (a reported deviation, see below)
  ceiling_twin2k.py      the knowable ceiling and the looks curve per column → out/twin2k/ceiling.json
  ceiling_boot_twin2k.py how sure the ceiling is: a bootstrap over people (200 draws, ≈ 12 min on 4 cores)
  exchange_twin2k.py     the exchange rate: r from k items of each pool
  robust_hgb_twin2k.py   registered robustness: a boosted median model for the persona
  exploratory_twin2k.py  exploratory: the one-look echo from the crowd's own transitions
  run_bbrs.py            Study 2, all of it → out/bbrs/results.json
  run_sro.py             Study 2b, all of it → out/sro/results.json
  mm_extract.py          Study 2c: the Moral Machine's 3.2 GB of responses streamed down to data/mm/*.parquet
  run_mm.py              Study 2c, as registered → out/mm/results.json (≈ 25 min); --k K --m1-only: the
                         exploratory looks-curve panels → out/mm/exploratory_kK.json
  exploratory_mm_people.py   is a browser one person? (the survey asked after each session)
  exploratory_mm_elsewhere.py again against elsewhere: the same contrast, the other contrasts, the same visit
  facts.py               every number the paper quotes → runs/facts.json (and the result files → runs/)
  audit.py               a twin audit for any panel (the first product): --demo audits Twin-2K-500's 13 twins
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
$PY research/deeds/ceiling_twin2k.py && $PY research/deeds/ceiling_boot_twin2k.py && $PY research/deeds/exchange_twin2k.py
$PY research/deeds/run_bbrs.py && $PY research/deeds/run_sro.py
$PY research/deeds/fetch.py --mm && $PY research/deeds/mm_extract.py
caffeinate -i -s $PY research/deeds/run_mm.py && for k in 3 6 10; do $PY research/deeds/run_mm.py --k $k --m1-only; done
$PY research/deeds/exploratory_mm_people.py && $PY research/deeds/exploratory_mm_elsewhere.py
$PY research/deeds/audit.py --demo && $PY research/deeds/facts.py && $PY research/deeds/figures_twin2k.py
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
- **Study 2c on people whose answer is known.** `tests/test_mm.py` runs the whole Moral Machine
  analysis on synthetic, exchangeable people. Its looks curve and copy law must land on the theory, and
  the crowd for a fold must never read that fold. The test caught an indexing bug before the real run.

## Deviations from the registrations, all reported

- **Number of LLM specifications.** The registration counted 11; the release has 13 distinct ones (the
  default folder duplicates "Text Persona – GPT4.1-mini" byte for byte). All are used.
- **Partial coverage.** Some specifications cover only some people (1,000 and 1,558). The registered
  rule scores a silent twin as the base, which pulls a half-silent twin towards the crowd. So
  `fair_llm_twin2k.py` also scores each twin on the people it answered; the conclusions do not change.
- **Exploratory witnesses.** The crowd-transition echo is exploratory. So is the per-task test of
  "copying beats the crowd iff ρ > ½".
- **Study 2c's coding.** The survey's age and religiosity hold impossible values (an age of −10¹¹,
  religiosity −1999). Values outside the README's ranges are treated as missing. A person is the user
  part of `ExtendedSessionID`, because the `UserID` column was written as a float rounded to 15
  digits.
- **Study 2c, exploratory.** These analyses go beyond the registration, and each is reported as such:
  - the looks-curve panels for K = 3, 6 and 10;
  - whether a browser is one person;
  - again against elsewhere.
