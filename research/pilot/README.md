# Who knows you best? The pilot's analysis

The analysis of the pilot village (web decisions C75–C77): friends meet six classic paradigms in the
world, twice, and their own words, their friends' guesses and the world's echoes are held to what
they actually did. Everything here runs on the engine's own Python, without changing it (C7).

```
research/pilot/
  analyze.py          the analysis from the command line: an export, or --simulate
  visits.py           what a third visit would buy in power
  power.py            how many friends the tests need (simulated groups at eight sizes)
  study.py            every panel of the simulated report, across many groups at one size
  echo_pilot/
    paradigms.py      the six, their codes, and how the web sends them
    engine.py         the engine as a library: its endpoints in-process (Exact) and the same calls direct
    layers.py         the two-layer echo: the person's traits and their own ways (the C77 proposal)
    simulate.py       friend groups built to the literature's ranges, shaped like the export
    analysis.py       witnesses, settings, scoring, the curve, the gap, what a choice is made of
    stats.py          small-sample inference over people (bootstrap, exact sign-flip)
    power.py, study.py, report.py
  tests/              what the analysis promises, including that nothing sees what it predicts
  runs/               the runs the draft rests on: power, the many-group study, sensitivity (committed)
  out/                results and reports (not committed)
```

## Running it

All commands use the engine's virtualenv, from the repository root.

```sh
# The pilot: the owner's export (GET /api/pilot?op=export with x-pilot-admin), through the engine's endpoints.
services/ml/.venv/bin/python research/pilot/analyze.py export.json

# The rehearsal: one simulated group, its report drawn from the many-group study when it exists.
services/ml/.venv/bin/python research/pilot/power.py 200          # runs/power.json, ~45 min on 10 cores
services/ml/.venv/bin/python research/pilot/study.py 200 16       # runs/study-16.json, ~8 min
services/ml/.venv/bin/python research/pilot/sensitivity.py 60     # runs/sensitivity.json, ~11 min
services/ml/.venv/bin/python research/pilot/visits.py 200         # runs/power-3visits.json: what a third visit buys
services/ml/.venv/bin/python research/pilot/analyze.py --simulate # out/sim-16-<seed>-report.html

# The guarantees.
services/ml/.venv/bin/python -m pytest research/pilot/tests -q
```

## What it asks

Each choice is predicted by eight witnesses:

| Witness | What it is |
|---|---|
| self | the person's own words, given before they met any of the six |
| friends | the friends' guesses (C76), pooled by the median |
| echo | ECHO's engine as it stands: eight axes and its own measurement model |
| echo_axes | a one-layer echo fitted on the group: traits only |
| echo_2l | the two-layer echo: traits and the person's own steady ways |
| traits | a questionnaire twin: the rated axes through the fitted model |
| twin | a model of the group: people who chose like this went on to choose… |
| together | the median of self, friends and echo_2l |

The witnesses are asked in two settings:

- **again**: the second visit predicted from the first. With more visits, each is predicted from all the visits before it.
- **elsewhere**: each choice predicted without that paradigm ever being seen.

Each is scored against:

- **the bar**: the group's median choice, leave-one-person-out.
- **the retest**: the person's own other visit.
- **in simulation, two oracles**: exact knowledge of the traits, and of the person.

**Skill** is 1 − MAE/MAE<sub>bar</sub>. A silent witness is scored as the bar. **The curve** gives the echoes' skill after the first t minutes of the first visit.

## What it promises

The tests in `tests/` check:

- **Contracts.** The research code reads verbs, passing and the export exactly as the web and the planet write them. These tests read the TypeScript sources.
- **The engine, read faithfully.**
  - The library path equals the engine's endpoints bit for bit.
  - Each option's telemetry is what ingest really makes of it.
  - An act's noise multiplier is recorded (it is 7, see below).
- **The two-layer model.**
  - With one layer it is the engine's own Kalman step.
  - Its fit recovers a known variance split.
  - One act moves only its own feature's layer.
- **Nothing sees what it predicts.** Changing a person's second visit, an unseen paradigm, or the curve's later minutes leaves every prediction made without them unchanged, to the last float. That covers the bar, the fitted models, the twin and the engine's echo.

Ten deliberate leaks were planted to check this, and all ten fail a test.

## What it found in the engine (for the owner to decide; C7)

- **Acts are weighed as wordless messages.** `observe` multiplies an act's noise by
  `reliability_noise_scale("", …)` = 1 + 6/(1+0) = 7. That is a heuristic for short chat messages.
- **Trust has no route** (G16, C75). The engine cannot hear lending at all.
- **One layer cannot keep a person's own ways.** Whatever about a choice is steady but unexplained by the
  eight axes is treated as noise. The two-layer model in `layers.py` is the proposal. It is the
  same linear-Gaussian update on the stacked state [z; u].
