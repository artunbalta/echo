# ECHO: outreach drafts

*Drafted 2026-11-12. These are drafts for the founder to send. Nothing here has been sent.*

**Before sending any of them**

- `feat/echo-calls-it` must be deployed. Open both links on a phone and a laptop first:
  `https://echovirtualworld.com/bench` and `https://echovirtualworld.com/audit`.
- Send one at a time, to one person, from `artun.balta@outlook.com`. Fill every bracket.
- Find the person from the role in the table. This file holds no personal names and no addresses,
  on purpose.
- Keep to what was measured. We audited the 13 twins released with Twin-2K-500. We have not measured
  the reader's product, and the emails say so.
- Never write "pre-registered", "first", "standard", "certified" or "independent" about the audit.
  Always say that ECHO has a stake.

Numbers used below, and where they come from:

| Number | Source |
|---|---|
| 13 twins, 2,058 people | `research/deeds/runs/twin2k-audit.json`: `twins`, `people` |
| below the crowd by 3.6 to 8.2 points | same file: `twins.*.vs_crowd` |
| 54–58% of the knowable with one earlier answer | same file: `twins.*.knows_with_one_look` |
| a person's own retest at 52% | `research/deeds/runs/facts.json`: `t1.know.again` |
| arXiv:2609.13995 | `apps/web/src/app/bench/page.tsx`, "Whose idea the measure is" |

---

## A. To a twin vendor's head of research

**Subject:** A free individual-level audit of your twins, on your own panel

Hi [first name],

I build ECHO and study at Imperial College London. I audited the 13 AI twins released with the
public dataset Twin-2K-500, on 2,058 people. At predicting individuals, all 13 score below the
crowd's median answer, by 3.6 to 8.2 points. Given one earlier answer per person, each reaches
54–58% of what is knowable about a person.

Result and limits: https://echovirtualworld.com/bench

This is about individuals, not population averages, and I have not measured your twins. I would like
to. If you have a panel that answered the same items twice, the audit runs in your browser and
nothing is uploaded: https://echovirtualworld.com/audit

Or I can run it with you, free. I have a stake: ECHO builds twins from observed behaviour.

Artun Balta
artun.balta@outlook.com

## B. To an academic lab running twin or silicon-sample studies

**Subject:** Audit code for twin studies: a crowd floor and a reliability ceiling

Dear [title and surname],

I am a student at Imperial College London. I wrote an audit that places a twin's individual-level
accuracy between two marks: the crowd's median answer (0%) and the best any guess could score given
each item's test–retest reliability (100%). The floor-and-ceiling form is Netzer and Sambandam's
(arXiv:2609.13995). The ceiling is my addition.

On the 13 twins released with Twin-2K-500, all sit below the crowd. A person's own retest sits at
52%, not at the top.

Results: https://echovirtualworld.com/bench
Browser tool: https://echovirtualworld.com/audit
Code: github.com/artunbalta/echo, research/deeds/audit.py

Would you run it on your data and tell me where it breaks? It needs a panel that answered twice and
the twins' predictions. I have a stake: I build twins from behaviour.

Artun Balta
artun.balta@outlook.com

## C. To a brand or insights team, about an echo study

**Subject:** Your question, staged as a moment in a village

Hi [first name],

I build ECHO, a village in the browser where consented adults meet small situations. An echo study
stages your question as one of them: an offer, a price, a message. The same players meet it again on
later visits. You see what each person did and how steady it was, not what they say they would do.

There is no player base yet, so a first study recruits its own. I am looking for one design partner,
at no charge. Fifteen minutes?

Artun Balta
artun.balta@outlook.com

---

## D. Ten targets

Every organisation below is named in `docs/company/market.md`, and each "why" is from that file.
Roles only. Look the person up yourself.

| # | Organisation | Why them | Role to write to | Draft |
|---|---|---|---|---|
| 1 | **Simile** | Builds one twin per consenting person, from interviews and surveys. Its founders' paper reports accuracy as a share of the person's own retest. Says real-stakes experiments are next. | Head of research, or whoever owns evaluation | A |
| 2 | **Electric Twin** (London) | Ran the most careful vendor test the map found: pre-registered by them, human data collected by a third party, reported beside a human test–retest figure. | Chief Science Adviser, or head of research | A |
| 3 | **Semilattice** | Already compares itself with the academic twin literature on exact-answer match. Public prices. | Founder, or research lead | A |
| 4 | **YouGov** (Parallax) | Each twin is modelled on a real panellist, and live panellists validate in 30 minutes. The twice-answered panel the audit needs already exists there. | Product lead for Parallax, or head of data science | A |
| 5 | **Auxos** (YC, Spring 2026) | "1:1 replicas" of customers, built by interviewing real people. One-to-one twins, early, and in YC's network. | Founder | A |
| 6 | **The Columbia team behind Twin-2K-500** | It is their dataset and their released twins that we audited. They should see it early, and they can check it fastest. | Corresponding author of the dataset paper | B |
| 7 | **The Stanford group behind the 1,000-person interview study** (Park et al.) | The retest normalisation the field quotes comes from this study. It has interviews, surveys and a two-week retest for 1,052 people. | Corresponding author, or the lab's research lead | B |
| 8 | **Pew Research Center** (Data Labs) | Built twins of its own panel members and replicated nearly 300 questions across three waves. It has repeated waves and twin predictions in hand. | Lead of the team that ran the September 2026 study | B |
| 9 | **EY** | Its own wealth study shows the gap an echo study is for: 82% of investors said they would keep their parents' wealth manager, against real retention put at about 20–30%. | Insights lead for the wealth research | C |
| 10 | **CVS Health** | Used 400,000 twins to work out how to get patients to take their medication. That is a question about what people do, not what they say. | Head of behavioural or consumer insights | C |

<!-- docs/company/market.md: Simile row and text; Electric Twin row and text; Semilattice row; YouGov Parallax row; YC section (Auxos); "funhouse mirrors" paragraph (Columbia team, Twin-2K-500); Park et al. paragraphs (1,052 people, two weeks); Pew paragraph (nearly 300 questions, three waves); Aaru text (EY wealth study, 82%, 20–30%); Simile text (CVS, 400,000 twins) -->

**Notes on single rows**

- **Row 6.** Add one opening line to draft B: this is their dataset and their twins, used under
  their licence, and you would rather they find a mistake than a reviewer.
- **Rows 1 and 7.** The ceiling places a person's own retest at 52%. Their papers use the retest as
  the top. Say it as a measurement, and ask what they would change.
- **Rows 9 and 10.** These are long shots for a solo founder. Use them to learn who answers. A
  smaller team that already buys twins is a better first design partner.
  **[founder: add one or two you can reach through someone you know.]**

---

## E. Follow-up, after a week of silence

**Subject:** Re: [the first subject]

Hi [first name],
One line on my note below, in case it was buried: the audit runs in your browser on four CSV files, and nothing is uploaded.
https://echovirtualworld.com/audit has a synthetic panel if you would like to see it run first.
If this is not for you, tell me who it is for, and I will not write again.
Artun
