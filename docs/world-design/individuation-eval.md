# Individuation harness: measured variance

What `services/ml/scripts/run_individuation_3d.sh` actually returns, run many times, so the numbers
the project gates on stop being point estimates. This is the regression anchor the second W re-anchor
and every future flow gets checked against, which is why it lives here rather than in a report.

Pure measurement. Nothing was tuned to move any number.

---

## 2026-08-07: the first characterization, 20 runs

### Method

Two arms, 10 runs each, on one machine in one sitting, **sequentially and never in parallel**, since
parallel runs contend on ports and skew exactly the timing the harness measures.

| Arm | Commit | What it is |
|---|---|---|
| **A** | `dd50f8e` | current `main` |
| **B** | `48e529f` | the pre-hotfix state, in which **the island landmass did not render at all** |

Arm B is not a curiosity. It is the direct demonstration behind known-gaps ⚑11: that a correct
individuation number was produced against a world in which the land was not drawn. The prediction was
that the two arms would be indistinguishable, because the measurement spine is renderer-independent
and collision was never touched. That is confirmed statistically below rather than asserted.

`services/ml/**` is **byte-identical between the two commits** (`git diff 48e529f main -- services/ml/`
is empty), verified before the run, so this compares application code and nothing else. The harness
web port was parameterized (`ECHO_WEB_PORT`, default 3000) for this run because an unrelated dev
server held 3000; port only, no logic, no timing, no gate.

Each run records the completeness verdict, pooled `‖μ_tessa − μ_hank‖`, the per-axis delta for all
eight axes, the `still_ms` maxima the harness already logs, and wall clock. No new instrumentation
was added.

### Per-run results

`still_T` and `still_H` are the per-persona `still_ms` maxima the harness prints.

| run | verdict | secs | pooled | warmth | dominance | openness | energy | formality | intellect | pace | affect | still_T | still_H |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | COMPLETE | 93 | 0.1612 | +0.0095 | -0.1169 | +0.0496 | -0.0823 | -0.0239 | +0.0494 | +0.0005 | -0.0028 | 8005.2 | 1502.8 |
| A2 | COMPLETE | 94 | 0.1610 | +0.0096 | -0.1166 | +0.0495 | -0.0824 | -0.0237 | +0.0492 | +0.0005 | -0.0027 | 8005.7 | 1501.2 |
| A3 | COMPLETE | 98 | 0.2044 | -0.0159 | -0.0936 | +0.0791 | -0.1433 | -0.0273 | +0.0012 | -0.0008 | +0.0721 | 8022.2 | 1509.6 |
| A4 | COMPLETE | 98 | 0.1610 | +0.0104 | -0.1167 | +0.0499 | -0.0818 | -0.0233 | +0.0496 | -0.0004 | -0.0026 | 8004.0 | 1507.7 |
| A5 | COMPLETE | 87 | 0.1609 | +0.0108 | -0.1167 | +0.0501 | -0.0815 | -0.0230 | +0.0497 | -0.0009 | -0.0026 | 8007.0 | 1504.1 |
| A6 | COMPLETE | 87 | 0.1610 | +0.0105 | -0.1167 | +0.0503 | -0.0817 | -0.0232 | +0.0493 | -0.0003 | -0.0027 | 8009.8 | 1503.6 |
| A7 | COMPLETE | 86 | 0.1611 | +0.0099 | -0.1168 | +0.0498 | -0.0822 | -0.0237 | +0.0494 | -0.0000 | -0.0028 | 8009.2 | 1510.9 |
| A8 | COMPLETE | 87 | 0.1610 | +0.0098 | -0.1166 | +0.0502 | -0.0824 | -0.0235 | +0.0486 | +0.0012 | -0.0026 | 8012.1 | 1503.5 |
| A9 | COMPLETE | 89 | 0.1615 | +0.0099 | -0.1169 | +0.0502 | -0.0823 | -0.0238 | +0.0494 | -0.0002 | -0.0026 | 8009.4 | 1501.7 |
| A10 | COMPLETE | 87 | 0.1612 | +0.0107 | -0.1167 | +0.0508 | -0.0816 | -0.0232 | +0.0497 | -0.0007 | -0.0026 | 8011.4 | 1503.5 |
| B1 | COMPLETE | 87 | 0.1598 | +0.0114 | -0.1166 | +0.0487 | -0.0815 | -0.0200 | +0.0479 | +0.0092 | -0.0021 | 8002.6 | 1507.8 |
| B2 | COMPLETE | 86 | 0.1599 | +0.0119 | -0.1168 | +0.0492 | -0.0810 | -0.0198 | +0.0482 | +0.0084 | -0.0022 | 8012.4 | 1502.6 |
| B3 | COMPLETE | 87 | 0.1615 | +0.0096 | -0.1169 | +0.0501 | -0.0825 | -0.0239 | +0.0492 | +0.0002 | -0.0027 | 8009.7 | 1502.1 |
| B4 | COMPLETE | 86 | 0.1616 | +0.0095 | -0.1170 | +0.0501 | -0.0825 | -0.0241 | +0.0493 | -0.0000 | -0.0027 | 8009.3 | 1508.1 |
| B5 | COMPLETE | 86 | 0.1600 | +0.0113 | -0.1167 | +0.0490 | -0.0817 | -0.0201 | +0.0478 | +0.0094 | -0.0021 | 8001.3 | 1505.8 |
| B6 | COMPLETE | 86 | 0.1611 | +0.0098 | -0.1168 | +0.0497 | -0.0821 | -0.0237 | +0.0493 | +0.0001 | -0.0028 | 8007.6 | 1504.3 |
| B7 | COMPLETE | 88 | 0.1621 | +0.0095 | -0.1172 | +0.0499 | -0.0826 | -0.0245 | +0.0503 | -0.0015 | -0.0028 | 8000.8 | 1505.8 |
| B8 | COMPLETE | 88 | 0.1611 | +0.0098 | -0.1167 | +0.0497 | -0.0823 | -0.0236 | +0.0492 | +0.0003 | -0.0027 | 8005.3 | 1508.8 |
| B9 | COMPLETE | 86 | 0.1602 | +0.0121 | -0.1169 | +0.0495 | -0.0813 | -0.0198 | +0.0484 | +0.0080 | -0.0019 | 8008.0 | 1508.7 |
| B10 | COMPLETE | 86 | 0.1613 | +0.0098 | -0.1168 | +0.0498 | -0.0823 | -0.0237 | +0.0494 | -0.0000 | -0.0026 | 8009.9 | 1507.3 |
### Completeness

**0 of 20 runs were INFRA. All 20 were COMPLETE and exited PASS.** The completeness gate added in
`0a485df` did not have to reject anything in this sitting, so on this evidence the harness is not
flaky and is a usable gate. That is a stronger result than expected and should be re-checked rather
than assumed: it is one sitting on one machine, and the earlier per-beat gate exists precisely because
drive flakiness has been seen before.

Wall clock was 86 to 98 seconds per run, 90.6s mean on arm A and 86.6s on arm B. A 10-run arm is
about 15 minutes.

### Summary over COMPLETE runs

**Arm A, `main` (n=10)**

| metric | mean | sd | min | max |
|---|---|---|---|---|
| pooled L2 | 0.1654 | 0.0137 | 0.1609 | 0.2044 |
| warmth | +0.0075 | 0.0082 | -0.0159 | +0.0108 |
| dominance | -0.1144 | 0.0073 | -0.1169 | -0.0936 |
| openness | +0.0530 | 0.0092 | +0.0495 | +0.0791 |
| energy | -0.0882 | 0.0194 | -0.1433 | -0.0815 |
| formality | -0.0239 | 0.0012 | -0.0273 | -0.0230 |
| intellect | +0.0445 | 0.0152 | +0.0012 | +0.0497 |
| pace | -0.0001 | 0.0007 | -0.0009 | +0.0012 |
| affect | +0.0048 | 0.0236 | -0.0028 | +0.0721 |

**Arm B, `48e529f`, invisible landmass (n=10)**

| metric | mean | sd | min | max |
|---|---|---|---|---|
| pooled L2 | 0.1609 | 0.0008 | 0.1598 | 0.1621 |
| warmth | +0.0105 | 0.0011 | +0.0095 | +0.0121 |
| dominance | -0.1168 | 0.0002 | -0.1172 | -0.1166 |
| openness | +0.0496 | 0.0005 | +0.0487 | +0.0501 |
| energy | -0.0820 | 0.0006 | -0.0826 | -0.0810 |
| formality | -0.0223 | 0.0021 | -0.0245 | -0.0198 |
| intellect | +0.0489 | 0.0008 | +0.0478 | +0.0503 |
| pace | +0.0034 | 0.0046 | -0.0015 | +0.0094 |
| affect | -0.0025 | 0.0003 | -0.0028 | -0.0019 |

### Paired comparison, arm A against arm B

Welch's two-sided t-test. Intervals are mean ± 2sd.

| metric | A mean | B mean | diff | A ± 2sd | B ± 2sd | overlap | p |
|---|---|---|---|---|---|---|---|
| pooled | 0.1654 | 0.1609 | +0.0046 | [0.1381, 0.1928] | [0.1592, 0.1625] | yes | 0.317 |
| warmth | +0.0075 | +0.0105 | -0.0030 | [-0.0090, 0.0240] | [0.0083, 0.0126] | yes | 0.289 |
| dominance | -0.1144 | -0.1168 | +0.0024 | [-0.1291, -0.0998] | [-0.1172, -0.1165] | yes | 0.321 |
| openness | +0.0530 | +0.0496 | +0.0034 | [0.0346, 0.0714] | [0.0486, 0.0505] | yes | 0.276 |
| energy | -0.0882 | -0.0820 | -0.0062 | [-0.1269, -0.0494] | [-0.0831, -0.0808] | yes | 0.339 |
| formality | -0.0239 | -0.0223 | -0.0015 | [-0.0263, -0.0214] | [-0.0265, -0.0181] | yes | 0.065 |
| intellect | +0.0445 | +0.0489 | -0.0044 | [0.0141, 0.0750] | [0.0474, 0.0505] | yes | 0.388 |
| pace | -0.0001 | +0.0034 | -0.0035 | [-0.0015, 0.0012] | [-0.0059, 0.0127] | yes | 0.040 |
| affect | +0.0048 | -0.0025 | +0.0073 | [-0.0425, 0.0521] | [-0.0032, -0.0018] | yes | 0.355 |

**Verdict: the arms are indistinguishable.** Every axis and the pooled distance overlap at ± 2sd. The
smallest p is `pace` at 0.040 and `formality` at 0.065; across nine comparisons a single p near 0.04
is what chance produces (a Bonferroni threshold here would be 0.05/9 = 0.006), and neither survives
that. **⚑11 is confirmed with statistics rather than by assertion: the harness returns the same
individuation number whether or not the world's land is drawn.** It reads `/observe/behavioral` events
off the network and never the framebuffer, so a green individuation number says nothing about the
render.

### Where the variance actually lives

The two arms' spreads are very different, and that is not an arm effect. **Arm A's larger sd is one
run.** Run A3 is a single large excursion (pooled 0.2044 against 0.1610 typical, dominance -0.0936
against -0.1167). Excluding it, dominance over the remaining 19 runs has **sd 0.00016** and a range of
[-0.11724, -0.11659]. The harness is far more deterministic than the arm-A table alone suggests.

Arm B shows a second, smaller mode: runs B1, B2, B5 and B9 sit at `pace` about +0.009 and `formality`
about -0.020, against about 0.000 and -0.024 for the rest. So there are at least two discrete modes,
not a continuous spread.

**The variance is essentially all in the Tessa (thorough) arm.** Standard deviation of each persona's
own posterior across all 20 COMPLETE runs:

| axis | sd μ_tessa | sd μ_hank | ratio |
|---|---|---|---|
| warmth | 0.00598 | 0.00033 | 18× |
| dominance | 0.00514 | 0.00018 | 29× |
| openness | 0.00662 | 0.00022 | 30× |
| energy | 0.01376 | 0.00023 | 59× |
| formality | 0.00195 | 0.00032 | 6× |
| intellect | 0.01072 | 0.00031 | 34× |
| pace | 0.00369 | 0.00058 | 6× |
| affect | 0.01668 | 0.00010 | 161× |

Hank, the hasty persona, is effectively deterministic. Tessa is not, and she is the one who holds the
build for 16.5 seconds and sits still through the shy-creature beat. That long hold is where
frame-timing noise enters.

`still_ms` for Tessa: mean 8008.1, sd 4.7, range [8000.8, 8022.2], against the 8000ms threshold in
`ingest.py` (`solitude_tol = clip01(still_ms / 8000)`). **Every run cleared 8000, in the worst case by
0.8ms.** That is a knife edge, but it is not the driver of the excursions: the value clips at 1.0, so
variation above 8000 is absorbed.

**What the driver is, honestly: not established.** The raw-signal maxima the harness already logs
(`still_ms`, `speed_var`, `heading_var`, `explore_ratio`, `dwell_ms`) do **not** separate the two
modes in arm B; the ALT and main runs overlap on every one. And `heading_var` / `speed_var` /
`explore_ratio` are documented in ⚑6 as deliberately unmapped in `ingest.py`, so they cannot move the
posterior directly. The remaining hypothesis is that the *number and composition* of
`movement_sample` events during Tessa's long hold varies with frame timing, which changes how many
times `solitude_tol` is observed rather than what value it takes. Confirming that needs the
per-event dump the harness already supports (`DUMP=1`, which writes `/tmp/<label>_{tessa,hank}.json`)
captured on a run that happens to land in the excursion mode. No new instrumentation was added for
this, per the brief.

### Where the previously quoted readings fall

Over all 20 COMPLETE runs:

| axis | measured mean | sd | range |
|---|---|---|---|
| dominance | -0.1156 | 0.0052 | [-0.1172, -0.0936] |
| energy | -0.0851 | 0.0137 | [-0.1433, -0.0810] |
| pace | +0.0016 | 0.0037 | [-0.0015, +0.0094] |

- **dominance** quoted at -0.117, -0.1167, -0.1166, -0.1168: all inside, all within 0.3 sd of the
  measured mean. The axis the project has been gating on is genuinely the stable one.
- **energy** quoted at -0.076, -0.0827, -0.0821, -0.0814: the last three are inside; **-0.076 is
  outside the measured range** (z = +0.66, but above the observed maximum of -0.0810). That reading
  came from an earlier session on a different code state, so it is not a contradiction, but it does
  mean the -0.076 to -0.0827 "band" quoted in earlier briefs was never a characterized band and
  should not be used as one.
- **pace** quoted at -0.0001, +0.0009, +0.0094: -0.0001 and +0.0009 are inside; **+0.0094 sits at the
  very top of the measured range** (z = +2.10, equal to the observed maximum). It corresponds to the
  arm-B alternate mode, so it is a real mode rather than an outlier.

### Proposed regression gate, NOT enforced

Written down so the human can decide. **The gate is off. Nothing in CI checks this.**

> **Proposal: `dominance`, median of n = 3 runs, must fall within -0.1168 ± 4 × 0.00016, i.e.
> [-0.11742, -0.11615]. COMPLETE runs only; INFRA runs are re-run, never counted.**

- **Why `dominance`:** it is the cave fork, the strongest individuator, and it is measurably the most
  stable axis (clean-mode sd 0.00016). `energy` and `pace` are locomotion-driven and demonstrably
  bimodal, so they would false-alarm.
- **Why the median, and why n = 3:** the observed failure mode is a *single-run excursion*, seen once
  in 20 (5%). A mean of 3 is dragged by one excursion; a median of 3 is immune to it. The probability
  that a median of 3 is itself an excursion is P(2 or 3 of 3) = 0.73%. Three runs cost about 4.5
  minutes, which is cheap enough to run per branch.
- **Why k = 4, against the clean-mode sd:** the sd over all 20 runs (0.0052) is inflated 32× by the
  single excursion, and a band built from it would be [-0.136, -0.095], wide enough to miss a real
  regression of 0.02. Taking the median first removes the excursion, so the band should be built from
  the clean-mode sd, which makes the gate genuinely sensitive: it would catch any shift larger than
  about 0.0006.
- **False-alarm rate against the 20 runs just collected: 0.** Across all 18 consecutive 3-run windows,
  every median falls inside the band. For comparison, a *single-run* gate at the same band would have
  fired once (on A3), a 5% false-alarm rate.

Re-measure this before trusting it on different hardware. Every number above is one machine, one
sitting, 2026-08-07.
