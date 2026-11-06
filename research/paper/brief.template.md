# One Look Beats the Persona: What Can Be Known About a Person's Next Choice

*Brief version, {{date}}. Artun Balta. Four pre-registered analyses of public data. The full working paper
has every table, test and deviation. Every number below is filled in from the analysis code's own output
(`research/paper/build.py`); none is typed by hand.*

## Abstract

Digital twins are models meant to predict what a particular person will do. The field judges them by how
often they reproduce people's answers, normalised by how often people reproduce themselves. We give a
closed-form theory of what can be known about a person's next choice, and of who can know it. We test it
in four pre-registered analyses of public data: {{f:t1.people:,d}}, 1,507 and 522 participants, and
{{f:t4.people:,d}} browsers.

- **A guess that knows nobody beats every released LLM twin** on the field's own benchmark.
- **One earlier observation of a person in the same situation knows more than a 500-question persona**,
  and one visit knows more than a survey's demographics, ideology and country.
- **Two laws hold at scale.** Copying a person's past choice scores 2ρ − 1 against the crowd, and
  reading it against the crowd scores ρ². They hold to the third decimal in two million people.
- **The rate of knowing is predictable.** The curve of how fast a person becomes knowable is drawn from
  pairs of observations alone. For everyone seen four times or more, it puts the measured skill after
  one, two and three visits inside its 95% interval.

Knowing a person takes watching them again, in the situation of interest.

## 1. The question

Language-model "digital twins" are built from what people say about themselves: interviews, surveys,
personas. They are scored against the person's own retest, as if one noisy answer guessing another were a
ceiling. Two questions are missing:

- Does a twin know the *individual*, or only the crowd's typical answer?
- How much of what can be known about a person does any witness know?

## 2. A theory of witnesses

Take one kind of situation and standardise a person's answer as y = A + U + e:

- **A** is what a persona can predict, a share π of the variance.
- **U** is the person's own steady way with this situation, so that A + U is a share ρ: the
  correlation between two occasions.
- **e** is the day.

Every witness's skill against the crowd (1 − MSE / variance) then has a closed form:

| Witness | Skill |
|---|---|
| the crowd | 0 |
| any model of the persona | at most π |
| copying the person's past answer | 2ρ − 1 |
| the echo after n looks: crowd plus κ times the looks' deviation | π + n(ρ − π)² / (n(ρ − π) + 1 − ρ) |
| what is knowable without the day | ρ |

The forms are old in forecasting and psychometrics. Copying is *persistence*, and one look read against
the crowd is the best blend of persistence and climatology (Murphy, 1992). The n-look curve is the
Spearman–Brown prophecy (Spearman, 1910; Brown, 1910) times ρ. They make three predictions:

- a persona caps knowledge at its share π;
- copying loses to knowing nobody wherever ρ < ½;
- the retest is not a ceiling.

## 3. Four tests

All four analyses were registered before any model was fitted on the data, and the Moral Machine's
before its response files were opened. Every witness is fitted on other people than the one it predicts.

### 3.1 The crowd beats every twin (Twin-2K-500)

Twin-2K-500 (Toubia et al., 2025) is the field's public benchmark. It has {{f:t1.people:,d}} US adults,
{{f:t1.tasks:d}} tasks retested after two weeks, and the authors' own released LLM twins. We reproduced
the authors' metric to the digit.

- **The crowd beats every twin.** The crowd's median answer knows nobody. It scores
  {{f:t1.base.acc:.3f}}, above all {{f:t1.llm.specs:d}} twin specifications, by {{f:t1.llm.delta_best:pts}} to
  {{f:t1.llm.delta_worst:pts}} points. By the field's yardstick it reaches {{f:t1.base.norm:%}} of the
  retest; the headline twin reaches {{f:t1.llm_headline.norm:%}}.
- **The persona adds nothing to accuracy.** A model of the 500-question persona that aims at the
  metric's own optimum scores exactly the crowd's accuracy ({{f:t1.persona_hgb.acc:.4f}}).
- **Individuals.** Twins tell people apart at r = {{f:t1.llm_headline.r:r2}}, and a ridge regression on
  the same persona at {{f:t1.persona.r:r2}}. One earlier answer to the same question reaches
  {{f:t1.again.r:r2}}, on all {{f:t1.tasks:d}} tasks.
- **The retest is not the ceiling.** A two-layer echo that reads that one answer against the crowd scores
  {{f:t1.echo.acc:.3f}}, above the retest's {{f:t1.again.acc:.3f}}. The difference's 95% interval is
  {{f:t1.H4.lo:.4f}}–{{f:t1.H4.hi:.4f}}. Its simplest form scores {{f:t1.echo_transition.acc:.4f}},
  which is the theory's one-look optimum ({{f:t1.model.looks1:.3f}}), computed before it was observed.
  The knowable ceiling is {{f:t1.model.ceiling:.3f}} ({{f:t1.model.ceiling.lo:.3f}}–{{f:t1.model.ceiling.hi:.3f}}).

The share of the knowable each witness knows:

| Witness | Share |
|---|---|
| the headline twin | {{f:t1.know.llm_headline:%}} |
| the retest | {{f:t1.know.again:%}} |
| the registered echo | {{f:t1.know.echo:%}} |
| the simplest echo | {{f:t1.know.echo_transition:%}} |

<!-- figure:ladder -->

### 3.2 One look beats the persona

- **In Twin-2K-500,** the best pool of self-descriptions, 256 items, reaches r = {{f:t1.ex.self.max_r:r2}}.
  One look reaches {{f:t1.again.r:r2}}.
- **In the Moral Machine** (§3.4), {{f:t4.survey:,d}} people also answered a survey: age, gender,
  education, income, a political and a religious slider, and country. A ridge regression on all of it
  knows less than one visit in {{f:t4.m3.beats:d}} of 6 kinds of dilemma (mean gap
  {{f:t4.m3.gap:.3f}}, {{f:t4.m3.gap.lo:.3f}}–{{f:t4.m3.gap.hi:.3f}}). Country, for which this dataset is known,
  gains between an eighth and about half of what one visit gains.

### 3.3 The laws, with money at stake, across 138 measures, and in two million people

- **With money at stake.** In the Basel–Berlin Risk Study (Frey et al., 2017), risk tasks were
  incentivised and retested after six months. Copying loses to the crowd on all {{f:t2.low.n:d}} tasks
  less than half steady. Mean skill is {{f:t2.mean.copy:+.2f}}, tracking 2ρ − 1 (r =
  {{f:t2.copy_theory_corr:r2}}). The echo, from the same one observation, scores {{f:t2.mean.echo:+.2f}};
  self-reports score {{f:t2.mean.words:+.2f}}.
- **Across 138 behavioural measures.** In the Self-Regulation Ontology (Eisenberg et al., 2019),
  copying loses on {{f:t3.deeds.low_negative:d}} of the {{f:t3.deeds.low:d}} measures less than half steady.
  The echo beats copying on {{f:t3.deeds.echo_beats:d}} of {{f:t3.deeds.n:d}} and tracks ρ² (r =
  {{f:t3.deeds.echo_rho2_corr:r2}}). What people say about themselves knows {{f:t3.deeds.mean.words:+.3f}}
  of what they do.
- **In two million people.** In the Moral Machine, copying another visit scores 2ρ̂ − 1, and one look
  ρ̂², to the third decimal in {{f:t4.m2.holds:d}} of 6 kinds of dilemma (22,202 to 311,536 people
  each). Where a browser's stated person never changes, ρ̂ for humans against pets passes one half
  ({{f:t4.p.same.species.rho:.2f}}). There, and as the theory says, copying beats the crowd
  ({{f:t4.p.same.species.copy:+.3f}} against {{f:t4.p.same.species.theory:+.3f}}).

<!-- figure:laws -->

### 3.4 How fast a person becomes knowable (Moral Machine)

The studies above saw each person at most twice, so the value of a second or third look was a model.
The Moral Machine (Awad et al., 2018) set {{f:t4.dilemmas:,d}} dilemmas, to {{f:t4.people:,d}} browsers,
many of them again and again. Each session sets two dilemmas on each of six contrasts of character. A
look is one visit's choice on one contrast. ρ̂ is fitted on pairs of visits only. From it the theory draws
the whole curve, nρ̂² / (nρ̂ + 1 − ρ̂), which is then measured on held-out visits.

- **As registered,** on browsers with more than twenty visits, the curve holds by its criterion (r =
  {{f:t4.m1.corr:.3f}}, mean gap {{f:t4.m1.mad:.4f}}). Those browsers are barely self-consistent, though, so
  the test is weak.
- **Exploratory, on everyone with four visits or more** ({{f:t4.x3.people_min:,d}}–{{f:t4.x3.people_max:,d}}
  browsers per contrast): all {{f:t4.x3.points:d}} predicted points lie inside their measured 95%
  intervals. For humans against pets, one, two and three visits know {{f:t4.x3.species.obs1:.3f}},
  {{f:t4.x3.species.obs2:.3f}} and {{f:t4.x3.species.obs3:.3f}}. The theory said {{f:t4.x3.species.pred1:.3f}},
  {{f:t4.x3.species.pred2:.3f}} and {{f:t4.x3.species.pred3:.3f}}.
- **Where people differ most,** the curve lands at every point of every panel, out to twenty visits.
- **Where ρ̂ is near zero and noisy,** in the heaviest panels, it misses. The full paper reports every
  panel.

<!-- figure:looks_mm -->

## 4. What follows

- **For evaluating twins.** Report the crowd beside random guessing, and individual-level r beside
  accuracy. Normalising by the retest compares a twin with a noisy witness, not with what is knowable.
- **For building twins.** The bottleneck is information, not the model.
  - A persona carries a few percent of what is knowable about a person's next choice in a situation.
  - One observation of them in that situation carries a share ρ of it (ρ² of ρ). That is about half on
    Twin-2K-500's tasks, and less where people are less steady.
  - The rate at which further observations add is predictable.
- **For an instrument.** If knowing someone takes watching them again in the situations one cares about,
  the instrument is a place people come back to. It sets out comparable situations at no cost per
  observation, with consent, as play. ECHO is such a world. Its pre-registered pilot, with friends as the
  human baseline, is the next study.

**Limitations.**
- Twin-2K-500's choices are hypothetical, and the Moral Machine's people are browsers.
- The knowable ceiling for discrete answers rests on an ordered latent model.
- Better prompting may raise the twins, but not past the persona bound if the persona is all they read.

## Methods in brief

- **Data:**
  - Twin-2K-500 (HuggingFace, CC BY 4.0);
  - the Basel–Berlin Risk Study (OSF rce7g);
  - the Self-Regulation Ontology (GitHub, CC BY 4.0);
  - the Moral Machine (OSF 3hvt2, CC BY 4.0).
- **Registrations:** `research/deeds/PREREG*.md`, each committed before the analysis it governs.
- **Skill** is 1 − MSE / MSE(crowd). Twin-2K-500 uses its own accuracy metric.
- **Intervals** are bootstrap percentiles over people.
- **Leaks.** Six planted leaks are each caught by the tests.
- **The Moral Machine pipeline** was first run on synthetic people whose answer is known, which caught
  a bug before the real run.
- **Deviations and misses** are reported in full in the working paper.

## References

- Awad, E., Dsouza, S., Kim, R., Schulz, J., Henrich, J., Shariff, A., Bonnefon, J.-F., & Rahwan, I. (2018). The Moral Machine experiment. *Nature, 563*(7729), 59–64. https://doi.org/10.1038/s41586-018-0637-6
- Brown, W. (1910). Some experimental results in the correlation of mental abilities. *British Journal of Psychology, 3*(3), 296–322. https://doi.org/10.1111/j.2044-8295.1910.tb00207.x
- Eisenberg, I. W., Bissett, P. G., Enkavi, A. Z., Li, J., MacKinnon, D. P., Marsch, L. A., & Poldrack, R. A. (2019). Uncovering the structure of self-regulation through data-driven ontology discovery. *Nature Communications, 10*, 2319. https://doi.org/10.1038/s41467-019-10301-1
- Frey, R., Pedroni, A., Mata, R., Rieskamp, J., & Hertwig, R. (2017). Risk preference shares the psychometric structure of major psychological traits. *Science Advances, 3*(10), e1701381. https://doi.org/10.1126/sciadv.1701381
- Murphy, A. H. (1992). Climatology, persistence, and their linear combination as standards of reference in skill scores. *Weather and Forecasting, 7*(4), 692–698. https://doi.org/10.1175/1520-0434(1992)007<0692:CPATLC>2.0.CO;2
- Spearman, C. (1910). Correlation calculated from faulty data. *British Journal of Psychology, 3*(3), 271–295. https://doi.org/10.1111/j.2044-8295.1910.tb00206.x
- Toubia, O., Gui, G. Z., Peng, T., Merlau, D. J., Li, A., & Chen, H. (2025). Twin-2K-500: A data set for building digital twins of over 2,000 people based on their answers to over 500 questions. *Marketing Science, 44*(6), 1446–1455. https://doi.org/10.1287/mksc.2025.0262
