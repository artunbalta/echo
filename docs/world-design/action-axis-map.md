# Action → axis map (landing world)

The document twin of `apps/web/src/game/world/actionMap.ts`, aligned by hand row for row. The
data file is the source; W5-2 adds the test that keeps this table in step with it and checks every
label against what `services/ml/echo_ml/ingest.py` (and the `/telemetry` branch of `app.py`)
actually routes. Loadings are the telemetry block of the committed `measurement.npz`; they describe
the manner-driven part of an update only. The label embedding moves the posterior on every event as
well, so predictions for a scripted sequence come from `scripts/predict-sequence.py` through the
real engine, never from this table.

**Beat** = a scripted consequence of the act; fires with the measurement service down; the inspector
labels it a beat. **Reaction** = a bounded, monotone function of one axis of the live posterior mean;
zero offset when offline; the inspector shows base, offset, result, and the event and posterior
version it responded to. A reaction is promised only where the action's routed feature loads on the
axis at or above **0.15**; the loading quoted on the reaction is that feature's.

| Action (ingest label) | Cue | Route | Input | raw_signals → feature | Learned loadings | Beat | Reaction |
|---|---|---|---|---|---|---|---|
| `enter_cave` | F3 | behavioral | walk into the cave mouth | `risk01` → risk_index .75; `decision_latency_ms` → decision_latency | dominance +.41, warmth −.18, energy +.15 | the cave's glimmer brightens | **dominance → campfire size** (risk_index +.41), dead band .05, ×0.6 … ×1.8 |
| `stay_safe` | F3 | behavioral | linger 700 ms at the threshold and leave | `risk01` → risk_index .1; `decision_latency_ms` → decision_latency | dominance +.41, warmth −.18, energy +.15 | none | same channel as `enter_cave` |
| `plant_seed` | F1 | behavioral | E at the fertile patch | `delayed` → save_rate .85; `decision_latency_ms` → decision_latency | pace −.10, openness −.12, formality +.02 | the seed sprouts | none: save_rate loads formality at .016, nothing above threshold (F12) |
| `eat_now` | F1 | behavioral | E at the berry bush | `delayed` → save_rate .15; `decision_latency_ms` → decision_latency | pace −.10, openness −.12 | the bush thins | none, as `plant_seed` |
| `study_marker` | A4 | behavioral | dwell at the stone | `dwell_ms` → ts_learn | intellect +.035 | the glyph reveals with dwell | none: intellect has no honest world channel, inspector only |
| `dig_cache` | C7 | behavioral | hold E through two slips | `persist_after_fail` → persistence; `dwell_ms` → ts_build | formality +.28, energy +.15 | the cache opens | **formality → homestead tidiness** (persistence +.28), ×0.5 … ×1.5 |
| `sit_still` | A4 | behavioral | stand still 8 s at the marker stone | `still_ms` → solitude_tol | affect +.23, warmth −.16, energy −.14 | the shy creature appears (a beat) | **affect → sky saturation offset** (solitude_tol +.23), ×0.7 … ×1.3 |
| `help_at_cost` | H9 | behavioral | free the gull under the witness | ts_social .85 + approach; `thoroughness01` → persistence | warmth +.70, affect −.50, formality +.28 | the gull flies | **warmth → presence distance** (approach +.70), ×1.6 … ×0.4 (closer as warmth rises) |
| `abandon_free_gull` | H9 | behavioral | leave the gull | ts_leisure .5 | warmth −.025 | none | none: ts_leisure loads nothing above threshold |
| `passive_locomotion` | A9 | telemetry | how you walk | novel_tile_ratio, path_tortuosity | openness +.47 (path_tortuosity) / +.40 (novel_tile_ratio), affect +.34 | — | **openness → fog offset** (path_tortuosity +.47), ×0.75 … ×1.25 on the day cycle's base |

Channels are derived from the rows: a channel exists only where an emitter with a qualifying loading
exists. Pace (latency_norm +.87, emitted only by `first_move`, which has no emitter on the new host)
and energy (nothing routed above .15) therefore have no channel and are read in the inspector only.
`consistency` is a zero column in W and appears nowhere. Reactions are offsets on the day cycle's
base values, computed in one place, so a change at dusk is attributable; the definition-of-done
channel is the campfire, which the day cycle never touches.

**The vertical slice (Section A)** wires `enter_cave` / `stay_safe` → dominance → campfire size and
nothing else.
