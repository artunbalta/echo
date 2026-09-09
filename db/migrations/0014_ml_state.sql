-- The learning engine's durable state (SOCIETY-PLAN SOC-2.D, DECISIONS C34).
--
-- WHAT WAS ALREADY HERE AND UNUSED. `persona_state`, `behavior_index`, `reward_model_state`,
-- `autonomy_buckets`, `preference_pairs` and `meeting_outcomes` have been declared in 0001_init.sql
-- since June 15th with ZERO WRITERS — nothing in services/ml has ever read or written a database, so
-- every posterior resets on every redeploy, and with `autoDeploy: true` and no `buildFilter` that is
-- every push to the connected branch. Measured over 90 days on main: 143 commits across 17 active
-- days, of which only 38 touch services/ml. A DOCS COMMIT RESETS EVERYONE.
--
-- This is the same shape as `parcels.display_name`, which SOC-2.B filled in rather than superseded,
-- and this migration takes the same decision: USE the tables, add only what has no column at all.
-- The two expensive things were already right — `z_mean vector(8)` matches `persona.D == 8`, and
-- `context_embedding vector(256)` matches `SETTINGS.embed_dim == 256`, both enforced by pgvector.
--
-- FORWARD ONLY, additive, and re-runnable (db/migrations/README.md).

-- ── the correction that is a comment and not a column ──────────────────────────────────────────
--
-- `z_cov_json`'s comment in 0001 says "diagonal covariance as array". The shipped Σ is a FULL 8×8.
-- The comment was true for SEVEN HOURS: 0001 shipped at 08:23 and "WI-1: full-covariance persona
-- posterior" landed at 15:45 the same day, twelve commits later. Nobody noticed for 85 days because
-- nothing writes the column — and `jsonb` cannot notice: measured, it accepts both the true 8×8 and
-- a flat 8-number diagonal and reads back as an array either way. A writer that believed the comment
-- would silently discard 28 of the 36 independent numbers.
--
-- Sized honestly: `_floor_eigs` pins every eigenvalue at `min_var`, so Σ is exactly 0.02·I from
-- about the twelfth fold onward. The off-diagonals are load-bearing for a user's first eleven
-- observations and vacuous after — which is still exactly the cold-start case a snapshot is for.
comment on column persona_state.z_cov_json is
  'The FULL 8x8 covariance, row-major nested arrays. NOT diagonal: 0001''s original comment was wrong from seven hours after it shipped. persona.Posterior.Sigma is dense and symmetric; storing only the diagonal discards 28 of 36 independent numbers.';

-- ── what UserState carries that had no column anywhere ─────────────────────────────────────────
alter table persona_state add column if not exists cond_json     jsonb;
alter table persona_state add column if not exists temperature   real;
alter table persona_state add column if not exists calib_json    jsonb;
alter table persona_state add column if not exists baseline_mu   vector(8);

-- THE W STAMP, and it is what makes a snapshot survivable across the one-time re-anchor (C29).
--
-- A posterior is only meaningful under the W it was folded through. When W is re-anchored, every
-- stored mu becomes a number in a coordinate system that no longer exists. Replay was the other
-- candidate design precisely because it would survive that — but a snapshot that SELF-INVALIDATES
-- degrades to the prior, which is exactly today's behaviour, so the re-anchor costs nothing
-- relative to the status quo and this one column buys the whole of replay's advantage.
--
-- A hydrate whose stamp does not match the running W must discard the row, not adapt it.
alter table persona_state add column if not exists w_sha256 text;
comment on column persona_state.w_sha256 is
  'sha256 of the measurement matrix this snapshot was folded under. A hydrate MUST discard a row whose stamp differs from the running W (DECISIONS C29/C34): a posterior is a point in W''s coordinate system and nothing else.';

-- NO `behaviors_len` COLUMN, deliberately. It is tempting, because `EchoPanel` gates its "No one
-- knows you here yet" on `behaviors === 0` and a count is one integer against 500 rows of 256-float
-- embeddings. But a count without the rows is a lie with a number on it: `retrieve()` would return
-- nothing while the panel said twelve. The behaviours go in `behavior_index`, which is the table
-- built for them and already has the right vector column.

-- ── behavior_index: the two fields BehaviorEntry has and the table did not ──────────────────────
--
-- `context` is BehaviorEntry's third field — the cond_key that is embedded ALONGSIDE the action
-- ("privacy:private || return_cache"), so a row without it cannot reproduce what was embedded.
-- `provenance` is the evidentiary class SOC-2.F started carrying today (L7); it must survive with
-- the row it describes or the class is lost exactly as it was before.
alter table behavior_index add column if not exists context         text;
alter table behavior_index add column if not exists provenance_json jsonb;

-- ── autonomy_buckets: the drift detector, and deliberately NOT the other one ────────────────────
--
-- `_cusum` is load-bearing: it accumulates evidence that agreement dropped and `_reevaluate` demotes
-- on it, so a bucket that loses it cannot be demoted for drift after a restart.
--
-- `_recent` is NOT added, and the reason is worth recording because the obvious argument for it is
-- false. It looks like it feeds the ECE that gates promotion — but `grep -rn "_recent"` finds a
-- declaration, an append and a truncation, AND NO READER ANYWHERE. The gating ECE is computed from
-- `UserState.calib` and pushed in via `set_ece`. Persisting `_recent` would durably store dead
-- state; `calib_json` above is the field that genuinely needed one.
alter table autonomy_buckets add column if not exists cusum real not null default 0;

-- ── the snapshot's own bookkeeping ─────────────────────────────────────────────────────────────
alter table persona_state add column if not exists snapshot_version integer not null default 1;
comment on column persona_state.snapshot_version is
  'The shape of the JSON columns above. A hydrate that does not recognise the version discards the row rather than guessing — the same rule as w_sha256, for the same reason.';
