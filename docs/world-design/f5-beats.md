# Flow 5 beats: the Ring of Gyges, embodied

The design table for F5's two private moral probes, written before the code, in the shape of F1's beat
table. This is the document the acceptance bars are judged against.

Status: **the two probes. Stress and scarcity response is deferred to a following round** so that
three pieces of design do not get crammed into one budget.

---

## What already existed, and what this adds

P7 shipped the **measurement** half of F5: the two probes as entities, the public-minus-private delta,
`privacy:public|private` conditioning on the conditional buckets, and a BALD situation-director that
chooses which probe to present and under which condition. All of that is reused unchanged.

What P7 shipped as the **interaction** half was a centre-screen popup with two buttons. That is the
disguised multiple-choice questionnaire the project's own record rules out: every behaviour collapses
to "which button", and a button cannot individuate people. The decision cue it emitted
(`help_at_cost` / `pass_by`, `return_cache` / `keep_cache`) is kept exactly as it is, with its existing
routing. What is added is the **manner** of performing it.

The rule this table is written under: measurement comes from the manner of performance, sampled
continuously. Not from which option was picked.

---

## Beat 1: the tangled gull (help at cost)

A gull is caught in your own trap line. Freeing it costs you real time and real strength and there is
no witness and no reward. The line resists; the bird struggles; the work slips and has to be re-taken.

**What the player physically does.** Walk to it. Hold to work the line. The bird struggles at intervals
and the hold **slips**, exactly as the raft's lashings do, and has to be re-taken. The release is
progressive: the line comes free in stages and the gull's posture opens stage by stage, so the
silhouette is the progress and there is no bar. You may stop at any point and walk away, leaving the
bird partly free. Vitality drains while you work, so the cost is real and felt.

**Duration:** about 9 seconds of held work for a full release, reachable in 3 to 5 holds around the
slips. A partial release is a legitimate ending, not a failure.

| Manner scalar | What it measures | Produced by |
|---|---|---|
| `latency_ms` | deliberation before committing to the first hold | arrival to first hold input |
| `approach_detour01` | whether the path bent toward the gull at all, or it was simply on the way | path length against the straight line from where the player was when it entered awareness |
| `work_ms` | total held time on the line | accumulated hold |
| `persist_after_fail01` | re-engagement after each slip, the grit read | re-holds after slips / slips seen |
| `thoroughness01` | fraction of the release actually completed | release stages reached / total |
| `abandoned` | walked away mid-work | left the radius with work started and release incomplete |
| `cost_paid01` | vitality actually spent | drain accumulated during the hold |

## Beat 2: the marked cache (honesty unobserved)

A half-buried cache with **someone else's mark** carved into the lid. Food inside, by the weight. You
have to get close enough to read the mark, which means the act of noticing whose it is happens in the
body rather than in a sentence.

**What the player physically does.** Walk to it. The mark is legible only within about a tile, so
learning it belongs to someone requires closing. Then hold to dig: the take is **progressive**, so how
long you hold is how much you take, and the cache visibly empties. Stopping early is a partial take.
Holding in the opposite direction covers it back over, mark up.

**Duration:** about 6 seconds of held digging empties it. Any stopping point is a legitimate ending.

| Manner scalar | What it measures | Produced by |
|---|---|---|
| `latency_ms` | deliberation before the first dig input | arrival to first dig |
| `circled01` | whether the approach circled the cache before acting rather than going direct, the looking-around tell | angular sweep around the cache during approach, normalized |
| `dwell_at_marker_ms` | time spent adjacent to the mark before acting, hesitation in the presence of the evidence of ownership | dwell within mark-reading range before first dig |
| `hold_ms` | total dig time | accumulated hold |
| `taken01` | how much was actually taken | dig progress at the moment of leaving |
| `reburied` | covered it back over | the opposite hold completed |

---

## The privacy condition, which is the thesis

Each beat runs under `privacy:public` or `privacy:private`, chosen by the existing P7 director.

- **private:** nobody is anywhere near. The world is quiet.
- **public:** a witness NPC stands in sight but **outside the `CLOSE <= 2.0` gate**, so they are
  visibly present and cannot be interacted with. Being seen is a fact about the situation, not a
  conversation.

The existing `audience_size` and `public_or_private` context fields carry the condition, and the
existing conditional buckets already read them. **The measurement is the shift, not the act.** A
player who works the gull free identically observed and unobserved is telling us something different
from one who only does it when watched, and the second acceptance bar exists to prove that difference
is visible.

---

## Routing: what lands on an existing feature, and what is flagged

The rule is that cue-to-axis loadings stay **learned**. A manner scalar may be routed onto an existing
feature only where the feature's definition genuinely fits. Anything else is emitted, carried in
`raw_signals` for the next re-anchor's corpus, and flagged, never quietly attached to the nearest
plausible loading.

| Scalar | Disposition | Why |
|---|---|---|
| `latency_ms` | **routed**, `decision_latency` | the generic top-block already carries it; identical definition to every other beat's |
| `persist_after_fail01` | **routed**, `persistence` | byte-identical definition to the raft's slips, which is what the feature was anchored on |
| `thoroughness01` | **routed**, `persistence` | same definition as the gather's thoroughness, the feature's other anchor |
| `work_ms` / `hold_ms` | **routed**, `ts_social` (gull) and `ts_build` (cache) via the existing dwell time-share | the existing `_EMBODIED_TS` mechanism, same normalization |
| `abandoned` | **routed**, `ts_leisure` | the existing `abandon_*` branch already does exactly this |
| `taken01` | **routed**, `consistency` | `return_cache` and `keep_cache` already set `consistency` 0.9 / 0.1; a graded value between them is interpolation on an anchored feature, not a new direction |
| `cost_paid01` | **⚑ flagged** | doc-intended warmth. `ts_social` already carries the gull's time-share, and cost-paid is a different quantity from time-spent. No anchored feature means the cost of a costly act |
| `approach_detour01` | **⚑ flagged** | doc-intended openness/approach. `approach` is a boolean the cue already sets; a graded detour has no anchored direction, and `path_tortuosity` was anchored on the P3 sampler's normalized ratio, which this is not |
| `circled01` | **⚑ flagged** | doc-intended impression-management. There is no feature for "checked whether anyone was looking". This is the single most F5-specific signal in the flow and it is precisely the one with nowhere clean to go |
| `dwell_at_marker_ms` | **⚑ flagged** | closest existing feature is `decision_latency`, which `latency_ms` already carries. Routing both would double-count one construct |

**Expected outcome: 6 routed, 4 flagged.** Per the project's own rule the second W re-anchor happens
once, after all flows exist, on the full cue set, so a real share of F5's new manner scalars being
emitted and flagged rather than measured today is the correct result and not a failure. `circled01` in
particular is worth carrying unrouted: it is the behavioural definition of the unobserved self, and
inventing a loading for it now would be exactly the silent re-route the cross-cutting rule forbids.

---

## What this is not

No points, no score, no XP, no level, no win state, no leaderboard, no visible timer. The gull's
posture and the cache's emptiness are the only progress indicators, the same way the raft's silhouette
is. Nothing on screen counts anything. Walking past either probe remains unmeasured unless the player
declines explicitly, which is Law 2 and is unchanged from P7.
