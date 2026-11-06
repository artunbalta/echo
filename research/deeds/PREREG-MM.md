# Pre-registration addendum: how fast a person becomes knowable (Moral Machine)

*Secondary analysis of public data. Committed before the response files were opened. The commit that
adds this file is the timestamp. It extends PREREG.md, PREREG-BBRS.md and PREREG-SRO.md. Those studies
saw each person at most twice, so the theory's looks curve, which says how knowing grows with each new
look at a person, was a model there. Here people came back many times to the same kinds of situation,
so the curve can be measured.*

## 0. What was seen before this was written

- The data's README (`MMdata_ReadMe.txt`, OSF 3hvt2): the files, columns and design.
- The original paper (Awad et al., 2018, *Nature* 563, 59–64). Its aggregate preferences: sparing
  humans over pets, more lives over fewer, and the young over the old. Its finding that respondents'
  characteristics shift these preferences only a little.
- No response file has been opened. No count of people, sessions or choices has been seen.

## 1. Data and coding

**Source.** The Moral Machine (Awad et al., 2018; OSF 3hvt2; CC BY 4.0):

- `SharedResponses.csv`: every shared response.
- `SharedResponsesSurvey.csv`: the responses of people who took the optional survey, joined to their
  answers.

A **session** is 13 dilemmas. Six character attributes are each set against each other in two
dilemmas per session:

| Dimension | The spared side y = 1 means |
|---|---|
| Utilitarian | more characters |
| Gender | males |
| Fitness | fit |
| Age | young |
| Social status | high |
| Species | humans |

**The choice.** For each dilemma of dimension d (filtered as the authors do: `ScenarioType` =
`ScenarioTypeStrict` = d), y is `Saved` on the row whose `AttributeLevel` is the dilemma's
`DefaultChoice`. The table above lists those default sides.

**A person** is a `UserID` (a browser fingerprint; say so wherever it matters). **A visit** is a
session.

**A look** at a person on dimension d is one visit's score: the mean of y over that visit's two
dilemmas of type d. Only visits with exactly two such dilemmas count.

**The situation** of a dilemma is the cell of its default-side row:

- d;
- `Intervention`, `PedPed`, `Barrier` and `CrossingSignal`;
- `NumberOfCharacters` and `DiffNumberOFCharacters`.

Sessions have no timestamp, so looks have no order. A person's looks are treated as exchangeable,
which is the theory's assumption. Choosing which look is predicted is random.

## 2. Witnesses

All witnesses are fitted on the other people: 10 folds over people, by a hash of `UserID`.

| Witness | Prediction of a held-out look |
|---|---|
| crowd | the mean of y in each dilemma's situation among the training people, averaged over the visit's two dilemmas. A cell with fewer than 100 training dilemmas falls back to (d, `Intervention`, `PedPed`, `Barrier`), then to d. |
| copy | crowd + the residual of one other look: the look trusted fully (κ = 1). Situations differ between visits, so this is the copy the theory's 2ρ − 1 describes. The raw other score is reported too, as description. |
| echo after n looks | crowd + κ_n · (mean residual of n other looks), with κ_n = nρ̂ / (nρ̂ + 1 − ρ̂) |
| persona (survey takers) | crowd + ridge on age, gender, education, income, the political and religious sliders, and country (countries with fewer than 500 survey takers pooled). The ridge penalty is chosen by exact leave-one-out on the training people. |
| persona + one look | crowd + a + b·persona + c·(the other look's residual), fitted on the training people |

**ρ̂** is fitted per dimension and per training split. Each training person in the analysed panel
contributes one random pair of looks, and ρ̂ is the correlation of the pair's residuals around the
crowd. Only pairs enter it: nothing about three or more looks.

**Skill** is 1 − MSE / MSE(crowd) on held-out looks.

**The theory's predictions,** all from ρ̂ alone:

- copy: 2ρ̂ − 1;
- the echo after n looks: nρ̂² / (nρ̂ + 1 − ρ̂);
- the ceiling: ρ̂.

**The panel.** For each dimension, the people with at least K + 1 looks. K is the largest n ≤ 20 for
which at least 2,000 people qualify. Each panel person is predicted once per draw:

- one random look is the target;
- the n looks are random other looks, nested so that the n-look set contains the (n − 1)-look set.

There are 20 draws. The same people serve every n.

**M2 and M3** use everyone with at least two looks in the dimension (for M3, the survey takers among
them), and their ρ̂ is fitted on that population's training people.

## 3. Hypotheses

- **M1 (the looks curve).** Over all six dimensions and n = 1…K, the measured skill of the echo after
  n looks tracks the theory's nρ̂² / (nρ̂ + 1 − ρ̂). Their correlation across the (d, n) points
  exceeds .95, and the mean absolute difference is below .01. The test that matters is n ≥ 2, because
  ρ̂ was fitted on pairs.
- **M2 (copying).** In each dimension, copying beats the crowd exactly when ρ̂ > ½: the sign of
  skill(copy) is the sign of 2ρ̂ − 1 in 6 of 6. Also, |skill(copy) − (2ρ̂ − 1)| < .03 in each.
- **M3 (one look against the persona).** Among survey takers with at least two looks, the persona's
  skill is below the one-look echo's in 6 of 6 dimensions. In the mean over dimensions, the bootstrap
  interval of (one look − persona) lies above zero.
- **M4** (descriptive). Three quantities:
  - Within-visit against across-visit stability: the correlation of the two choices inside one visit,
    against the correlation of single choices from two visits.
  - The looks needed for 80% of the knowable: n = 4 · (1 − ρ̂) / ρ̂.
  - A country crowd: crowd plus a shrunken per-country mean residual, n/(n + 100).

**Inference.** Intervals are bootstrap percentiles over people, with 500 draws (fewer only if run time
demands it, which would be reported). Skills are pooled over the 20 random draws of target and looks.

## 4. Deviations

Any departure from this file is reported as such, next to the registered analysis.
