# Village experiments (C86, C87)

> **What this is.** Every moment in the pilot village is a published behavioural paradigm, set in the
> village's clothes. This file names the paradigm behind each one: what it reads, where the evidence stands,
> what is varied (the *arm*), and the label it is sent under. The registry is `packages/planet/lib/moments.ts`
> (each moment's `paradigm` and `arms`), and the verbs and labels are in `affordances.ts`. Every label is one
> `services/ml/echo_ml/ingest.py` reads by name (C7), and none is a label of the pilot's six.
>
> **Sources.** The literature review behind C87 (2026-11-09) covered 71 paradigms. It checked 420 DOIs
> against Crossref; every DOI below is one of them, and Batson et al. (1981) was checked separately.
> Robustness grades follow the review: *robust*, *mixed*, *weak*.

## How the experiments run

- **Arms.** Where a paradigm has a manipulation, the moment has arms (`MomentDef.arms`):
  - Each stranger meets one arm first, picked so that each arm is met first equally often across strangers.
  - Later meetings rotate through the other arms (`armOf`), so one stranger meets them all.
  - A first-meeting comparison is therefore between people, and a later one is within a person. The number
    of meetings is kept per village on the device (`echo.moments.<cell>`), so the rotation carries over
    between visits.
- **What an act carries.** An act carries its arm:
  - in the raw signals: `arm`, plus the arm's own values, such as `onlookers: 2` or `coins: 9`;
  - in the context ingest.py conditions on: onlookers added to `audience_size`, `counterpart_status`,
    `time_pressure`, `stakes`, `public_or_private`.
- **Walking past.** Walking past a moment is measured only for moments where passing is a choice, and only
  once the stranger came within 8 m and then went past 20 m. A greeting counts as passed if it is still
  unanswered when the person who gave it walks on.
- **Reliability.** A single paradigm ranks people less reliably than it shows a group effect. So some
  constructs come in two or three surface forms:
  - communal effort: the wall and the net;
  - honesty: the purse, the basket, the knucklebone, the stall;
  - help at a cost: about ten moments.
- **Kept apart from the study's test items.**
  - No moment is one of the pilot's six (bread for a stranger, lending, the tide bet, seed now or later,
    the overgrown path, the lone traveller), and none uses their labels.
  - No moment begins while the stranger is within 40 m of a staging.
  - Awe raises generosity for a while (Piff et al., 2015). So the awe moments (dolphins, falling stars, the
    kaval player) wait until the first eight minutes of a visit are over (`MOMENT.aweAfterS`), by which time
    the six are done.
  - The review found that dividing a catch as the proposer is too close to the dictator item. That moment
    was removed before release.
- **Villagers who speak.** Some moments have a villager speak to the stranger: a pedlar asking the way, a
  woman asking for a loaf to be taken to her mother, an old woman offering tea. This is read as the world,
  not a prompt (Law 2).
  - Each is what that villager would say to anyone who came by.
  - Nothing marks it as a task, nothing waits on an answer, and leaving it is never a penalty.
  - The review flagged these as "request-type" so that the team can rule on them; this is that ruling.

## The moments

### Something happening ahead (`people`)

| Moment | What happens | Paradigm | Evidence | Arm | Read as |
|---|---|---|---|---|---|
| `fallen-elder` | An old man slips and cannot get up | Bystander effect: Darley & Latané (1968) | Robust: Fischer et al. (2011) meta-analysis; weaker in dangerous emergencies | Alone, or two onlookers chatting nearby | `help_at_cost`, `pass_by` (H9) |
| `asch-boats` | Fishers insist the plainly shorter red boat is the longer | Conformity: Asch (1956) | Robust: Bond & Smith (1996). A dissenting ally cuts conformity (Allen & Levine, 1971) | A unanimous majority, or one dissenter | `conform_custom`, `deviate_custom` (H3) |
| `looking-up` | People stopped in the way, heads back | Crowd drawing power: Milgram, Bickman & Berkowitz (1969) | Replicated in the field (Gallup et al., 2012) | One looker, or five | `conform_custom` (H3) |
| `teasing` | Boys teasing a smaller one with a torn kite | Participant roles in bullying: Salmivalli et al. (1996) | Roles are robust; defending, meta-analysis (Polanin, Espelage & Pigott, 2012) | — | `join_exclusion` (D9), `asserts` (D3), `include_marginal` (G1); `pass_by` |
| `imece-wall` | A fallen field wall, and stones to lift | Communal effort, social loafing: Latané, Williams & Harkins (1979) | Robust: Karau & Williams (1993) | One old man alone, or a crew of four | `work_shift`; walking off mid-way, `shirk_work` (C11) |
| `net-haul` | A net to haul up the beach | Rope pulling and social loafing: Ingham et al. (1974) | Robust: Karau & Williams (1993) | One fisher alone, or three | `work_shift`, `shirk_work` (C11); effort is how long you pull |
| `musician` | An old man playing the kaval | Aesthetic dwell (J2); music reward differs stably between people (Mas-Herrero et al., 2013) | Individual differences robust | — | `gaze_reflection`, by how long you stay (J2) |
| `wrong-basket` | A busy fishwife holds out a basket meant for someone else | Honesty with a windfall that is not yours: Azar, Yosef & Bar-Eli (2013) | Registered replication (Procházka et al., 2021); civic honesty (Cohn et al., 2019) | Private: she would never know | `return_cache`, `keep_cache` (H2) |
| `tea-invite` | An old woman on her step beckons you to sit for tea | Answering a bid for company; ending encounters (Albert & Kessler, 1978; Mastroianni et al., 2021) | Weak as an experiment | — | `group_join` (G1), `close_graceful` (E4); walking by, `close_ghost` (E6) |
| `tangled-net` | A fisher at a hopelessly tangled net | Task persistence: Feather (1961) | Behavioural persistence is reliable (Gignac & Wong, 2020) | — | `repair`, graded by how long you keep at it (G8) |
| `bread-errand` → `bread-mother` | A woman asks you to take a loaf to her mother's door | Keeping a promise: Charness & Dufwenberg (2006); Vanberg (2008) | Robust | In a hurry, or not (Darley & Batson, 1973: weak) | `promise_made`, then `promise_kept` at the door, or `promise_broken` after five minutes (G7) |
| `drunk-or-ill` | A man lying on the path at night | Piliavin, Rodin & Piliavin (1969) | Mixed: the direction is robust, replications are few | A cane beside him, or a bottle | `help_at_cost`, `pass_by` (H9) |
| `campfire` | Villagers round a fire at night, telling stories | Joining a group or staying outside it (G4) | — | — | `group_join` (G1), `group_observe` (A4); walking off, `group_avoid` |
| `crying-alone` | A young woman sitting alone, crying | Empathy and ease of escape: Batson et al. (1981) | Robust | Right on your way, or well off to one side | `help_at_cost`, `pass_by` (H9) |
| `dolphins` | Dolphins in the bay | Awe: Keltner & Haidt (2003); Piff et al. (2015) | Piff's study has no independent replication | — | `gaze_reflection` (J2) |
| `bench-sit` | Someone sitting at one end of a bench | Personal space: Sommer (1959); Felipe & Sommer (1966) | Robust; stop distance is stable within a person (Hayduk, 1983) | An elder, or someone your age | `proxemics_close` (A1), `proxemics_far` (A3) |
| `unfinished-tale` | An old man stops a Nasreddin Hoca tale before its end to light his pipe | Information-gap curiosity paid for in time: Loewenstein (1994); Kang et al. (2009) | Effect robust; individual differences mixed | A short pause (20 s), or a long one (45 s) | `asks_question` (D2) |
| `knucklebones` | Children settle a pomegranate with a knucklebone; your throw is not *tava* | Lying for gain: Fischbacher & Föllmi-Heusi (2013) | Robust: Abeler, Nosenzo & Raymond (2019) | Under the cup, or both children watching (Gneezy, Kajackaite & Sobel, 2018) | `return_cache`, `keep_cache` (H2) |
| `stray-ball` (C86) | A child's throw hits you | Apology and forgiveness: Ohbuchi, Kameda & Agarie (1989) | Robust: Fehr, Gelfand & Nag (2010) | The child says sorry, or does not | `forgive`, `retaliate`; walking off, `withdraw` (G10) |

### Someone coming along (`passer`)

| Moment | What happens | Paradigm | Evidence | Arm | Read as |
|---|---|---|---|---|---|
| `greeting` | Someone coming along greets you | Passing encounters (Patterson et al., 2007); courtesy across status (G2, G11) | No study tests the stability of status-conditioned courtesy directly | The headman, a water-carrier, or anybody | `opener_warm` (G2), `opener_neutral` (G3); unanswered, `opener_silent` (G5) |
| `rude-bump` | A man with sacks knocks into you and swears | Answering an insult: Cohen, Nisbett, Bowdle & Schwarz (1996) | No preregistered direct replication | — | `cold_response_deescalate` (G8), `cold_response_persist` (D8); walking off, `cold_response_withdraw` (G9) |
| `narrow-way` | Someone coming the other way on the narrow path | Giving way: Dabbs & Stokes (1975); Willis, Gier & Smith (1979) | Mixed | An elder with a staff, or a girl with two full jugs | `let_others_ahead` (H2), `asserts` (D3) |
| `ask-way` | A pedlar asks you the way to the harbour | Helping strangers: Levine et al. (1994; 2001) | Robust | — | `help_at_cost`: you walk them there (H9); `transact_neutral`: you point (G15); unanswered, `opener_silent` |
| `heavy-jugs` | An old woman struggling with two heavy jugs | Help with a burden (Levine et al., 2001) | Robust | — | `help_at_cost` (she walks home beside you), `pass_by` (H9) |
| `dark-lantern` | At night, a woman whose lantern has gone out | Help at a cost (H9) | — | — | `help_at_cost` (you walk her to her door), `pass_by` |

### Something by the way (`wayside`)

| Moment | What happens | Paradigm | Evidence | Arm | Read as |
|---|---|---|---|---|---|
| `lost-purse` | A purse lying in the grass | Civic honesty: Cohn, Maréchal, Tannenbaum & Zünd (2019) | Robust: 40 countries; more money in the wallet, more returned | Two coins, or nine | `return_cache`, `keep_cache` (graded) (H2) |
| `open-gate` | A field gate left open | Keeping an unenforced rule: Keizer, Lindenberg & Steg (2008) | Mixed: a smaller effect in Volker (2017) | — | `conform_custom` (H3) |
| `litter` | Rubbish dropped by the way, a basket by the wall | Littering norms: Cialdini, Reno & Kallgren (1990) | Mixed: the single-piece effect reversed in a preregistered replication (2021) | One piece, or seven | `stack_tidy` (J5) |
| `caught-lamb` | A lamb with its head caught in the fence | Costly help to a creature (H9) | — | — | `help_at_cost`, `pass_by` (H9) |
| `woodpile` | A woodpile that has come down beside a house | Order as conscientiousness: Gosling et al. (2002) | Robust as a cue to conscientiousness | — | `stack_tidy` (J5) |
| `honey-stall` | An honesty stall, one jar each, nobody minding it | Honesty boxes (Levitt, 2006); watching eyes (Bateson, Nettle & Roberts, 2006) | Mixed: eyes cut norm-breaking by about a third (Dear, Dutton & Fox, 2019), but not generosity (Northover et al., 2017) | A nazar charm over it, or none | `conform_custom` (H3); taking three, `keep_cache` (H2) |

## Considered and not built

- **The catch divided as proposer.** Too close to the held-out dictator item; removed before release.
- **Stag hunt and commons.** They overlap the trust and delay items.
- **Physical-risk games (the jumping rock, the cairn).** Risk would overlap the tide wager, and no label fits
  the act honestly.
- **Riddles (cognitive reflection), an unfamiliar food, playfulness.** No label reads them, and a riddle put
  to the stranger is too near a prompt.
- **Fragile effects (the Pandora effect, sunk cost, the endowment effect in barter).** The Pandora effect
  has no independent replication, sunk cost failed replication, and the endowment effect depends on the
  procedure.
- **Next, both built in two stages:**
  - "Keep an eye on my basket?" and a thief (commitment and intervention; Moriarty, 1975);
  - helping someone who just littered (indirect punishment).

## References

- Abeler, J., Nosenzo, D., & Raymond, C. (2019). Preferences for truth-telling. *Econometrica*, 87(4), 1115–1153. doi:10.3982/ECTA14673
- Albert, S., & Kessler, S. (1978). Ending social encounters. *JESP*, 14(6), 541–553. doi:10.1016/0022-1031(78)90048-3
- Allen, V. L., & Levine, J. M. (1971). Social support and conformity. *JESP*, 7(1), 48–58. doi:10.1016/0022-1031(71)90054-0
- Asch, S. E. (1956). Studies of independence and conformity. *Psychological Monographs*, 70(9), 1–70. doi:10.1037/h0093718
- Azar, O. H., Yosef, S., & Bar-Eli, M. (2013). Do customers return excessive change in a restaurant? *JEBO*, 93, 219–226. doi:10.1016/j.jebo.2013.03.031
- Bateson, M., Nettle, D., & Roberts, G. (2006). Cues of being watched enhance cooperation in a real-world setting. *Biology Letters*, 2(3), 412–414. doi:10.1098/rsbl.2006.0509
- Batson, C. D., Duncan, B. D., Ackerman, P., Buckley, T., & Birch, K. (1981). Is empathic emotion a source of altruistic motivation? *JPSP*, 40(2), 290–302. doi:10.1037/0022-3514.40.2.290
- Bond, R., & Smith, P. B. (1996). Culture and conformity. *Psychological Bulletin*, 119(1), 111–137. doi:10.1037/0033-2909.119.1.111
- Charness, G., & Dufwenberg, M. (2006). Promises and partnership. *Econometrica*, 74(6), 1579–1601. doi:10.1111/j.1468-0262.2006.00719.x
- Cialdini, R. B., Reno, R. R., & Kallgren, C. A. (1990). A focus theory of normative conduct. *JPSP*, 58(6), 1015–1026. doi:10.1037/0022-3514.58.6.1015
- Cohen, D., Nisbett, R. E., Bowdle, B. F., & Schwarz, N. (1996). Insult, aggression, and the southern culture of honor. *JPSP*, 70(5), 945–960. doi:10.1037/0022-3514.70.5.945
- Cohn, A., Maréchal, M. A., Tannenbaum, D., & Zünd, C. L. (2019). Civic honesty around the globe. *Science*, 365(6448), 70–73. doi:10.1126/science.aau8712
- Dabbs, J. M., & Stokes, N. A. (1975). Beauty is power: The use of space on the sidewalk. *Sociometry*, 38(4), 551. doi:10.2307/2786367
- Darley, J. M., & Batson, C. D. (1973). "From Jerusalem to Jericho". *JPSP*, 27(1), 100–108. doi:10.1037/h0034449
- Darley, J. M., & Latané, B. (1968). Bystander intervention in emergencies. *JPSP*, 8(4), 377–383. doi:10.1037/h0025589
- Dear, K., Dutton, K., & Fox, E. (2019). Do "watching eyes" influence antisocial behavior? *Evolution and Human Behavior*, 40(3), 269–280. doi:10.1016/j.evolhumbehav.2019.01.006
- Feather, N. T. (1961). The relationship of persistence at a task to expectation of success and achievement related motives. *J. Abnormal and Social Psychology*, 63(3), 552–561. doi:10.1037/h0045671
- Fehr, R., Gelfand, M. J., & Nag, M. (2010). The road to forgiveness. *Psychological Bulletin*, 136(5), 894–914. doi:10.1037/a0019993
- Felipe, N. J., & Sommer, R. (1966). Invasions of personal space. *Social Problems*, 14(2), 206–214. doi:10.1525/sp.1966.14.2.03a00080
- Fischbacher, U., & Föllmi-Heusi, F. (2013). Lies in disguise. *JEEA*, 11(3), 525–547. doi:10.1111/jeea.12014
- Fischer, P., Krueger, J. I., Greitemeyer, T., et al. (2011). The bystander-effect: A meta-analytic review. *Psychological Bulletin*, 137(4), 517–537. doi:10.1037/a0023304
- Gallup, A. C., et al. (2012). Visual attention and the acquisition of information in human crowds. *PNAS*, 109(19), 7245–7250. doi:10.1073/pnas.1116141109
- Gignac, G. E., & Wong, K. K. (2020). A psychometric examination of the anagram persistence task. *Assessment*, 27(6), 1198–1212. doi:10.1177/1073191118789260
- Gneezy, U., Kajackaite, A., & Sobel, J. (2018). Lying aversion and the size of the lie. *AER*, 108(2), 419–453. doi:10.1257/aer.20161553
- Gosling, S. D., Ko, S. J., Mannarelli, T., & Morris, M. E. (2002). A room with a cue. *JPSP*, 82(3), 379–398. doi:10.1037/0022-3514.82.3.379
- Hayduk, L. A. (1983). Personal space: Where we now stand. *Psychological Bulletin*, 94(2), 293–335. doi:10.1037/0033-2909.94.2.293
- Ingham, A. G., Levinger, G., Graves, J., & Peckham, V. (1974). The Ringelmann effect. *JESP*, 10(4), 371–384. doi:10.1016/0022-1031(74)90033-X
- Kang, M. J., Hsu, M., Krajbich, I. M., et al. (2009). The wick in the candle of learning. *Psychological Science*, 20(8), 963–973. doi:10.1111/j.1467-9280.2009.02402.x
- Karau, S. J., & Williams, K. D. (1993). Social loafing: A meta-analytic review. *JPSP*, 65(4), 681–706. doi:10.1037/0022-3514.65.4.681
- Keizer, K., Lindenberg, S., & Steg, L. (2008). The spreading of disorder. *Science*, 322(5908), 1681–1685. doi:10.1126/science.1161405
- Keltner, D., & Haidt, J. (2003). Approaching awe. *Cognition and Emotion*, 17(2), 297–314. doi:10.1080/02699930302297
- Latané, B., Williams, K., & Harkins, S. (1979). Many hands make light the work. *JPSP*, 37(6), 822–832. doi:10.1037/0022-3514.37.6.822
- Levine, R. V., Martinez, T. S., Brase, G., & Sorenson, K. (1994). Helping in 36 U.S. cities. *JPSP*, 67(1), 69–82. doi:10.1037/0022-3514.67.1.69
- Levine, R. V., Norenzayan, A., & Philbrick, K. (2001). Cross-cultural differences in helping strangers. *J. Cross-Cultural Psychology*, 32(5), 543–560. doi:10.1177/0022022101032005002
- Levitt, S. D. (2006). White-collar crime writ small. *AER*, 96(2), 290–294. doi:10.1257/000282806777212161
- Loewenstein, G. (1994). The psychology of curiosity. *Psychological Bulletin*, 116(1), 75–98. doi:10.1037/0033-2909.116.1.75
- Mas-Herrero, E., Marco-Pallarés, J., Lorenzo-Seva, U., Zatorre, R. J., & Rodriguez-Fornells, A. (2013). Individual differences in music reward experiences. *Music Perception*, 31(2), 118–138. doi:10.1525/mp.2013.31.2.118
- Mastroianni, A. M., Gilbert, D. T., Cooney, G., & Wilson, T. D. (2021). Do conversations end when people want them to? *PNAS*, 118(10), e2011809118. doi:10.1073/pnas.2011809118
- Milgram, S., Bickman, L., & Berkowitz, L. (1969). Note on the drawing power of crowds of different size. *JPSP*, 13(2), 79–82. doi:10.1037/h0028070
- Northover, S. B., Pedersen, W. C., Cohen, A. B., & Andrews, P. W. (2017). Artificial surveillance cues do not increase generosity. *Evolution and Human Behavior*, 38(1), 144–153. doi:10.1016/j.evolhumbehav.2016.07.001
- Ohbuchi, K., Kameda, M., & Agarie, N. (1989). Apology as aggression control. *JPSP*, 56(2), 219–227. doi:10.1037/0022-3514.56.2.219
- Patterson, M. L., Iizuka, Y., Tubbs, M. E., Ansel, J., Tsutsumi, M., & Anson, J. (2007). Passing encounters East and West. *J. Nonverbal Behavior*, 31(3), 155–166. doi:10.1007/s10919-007-0028-4
- Piff, P. K., Dietze, P., Feinberg, M., Stancato, D. M., & Keltner, D. (2015). Awe, the small self, and prosocial behavior. *JPSP*, 108(6), 883–899. doi:10.1037/pspi0000018
- Piliavin, I. M., Rodin, J., & Piliavin, J. A. (1969). Good Samaritanism: An underground phenomenon? *JPSP*, 13(4), 289–299. doi:10.1037/h0028433
- Polanin, J. R., Espelage, D. L., & Pigott, T. D. (2012). A meta-analysis of school-based bullying prevention programs' effects on bystander intervention behavior. *School Psychology Review*, 41(1), 47–65. doi:10.1080/02796015.2012.12087375
- Procházka, J., Fedoseeva, Y., & Houdek, P. (2021). A field experiment on dishonesty: A registered replication of Azar et al. (2013). *J. Behavioral and Experimental Economics*, 90, 101617. doi:10.1016/j.socec.2020.101617
- Salmivalli, C., Lagerspetz, K., Björkqvist, K., Österman, K., & Kaukiainen, A. (1996). Bullying as a group process. *Aggressive Behavior*, 22(1), 1–15. doi:10.1002/(SICI)1098-2337(1996)22:1<1::AID-AB1>3.0.CO;2-T
- Sommer, R. (1959). Studies in personal space. *Sociometry*, 22(3), 247–260. doi:10.2307/2785668
- Vanberg, C. (2008). Why do people keep their promises? *Econometrica*, 76(6), 1467–1480. doi:10.3982/ECTA7673
- Volker, B. (2017). Revisiting broken windows. *Sociological Science*, 4, 528–551. doi:10.15195/v4.a22
- Willis, F. N., Gier, J. A., & Smith, D. E. (1979). Stepping aside: Correlates of displacement in pedestrians. *J. Communication*, 29(4), 34–39. doi:10.1111/j.1460-2466.1979.tb01739.x
