-- BUILD-PLAN §0.F — the validation harness store. One row per dusk reading the player rated:
-- per-line "this is me / not me" split into SPECIFIC (axis-bound) vs CONTROL (Barnum) statements,
-- plus the overall 1–5. This is the instrument that produces Phase 0's go/no-go number (§5.G):
-- mean overall ≥ 4.0, specific "this is me" ≥ 70%, and specific must out-score control (no
-- horoscope effect). Append-only; covered by the GDPR delete cascade via user_id.
create table if not exists island_validation (
  id bigserial primary key,
  user_id text,
  session_id text,
  ts timestamptz not null default now(),
  overall int not null check (overall between 1 and 5),
  specific_total int not null default 0,
  specific_me int not null default 0,      -- "this is me" count on axis-bound statements
  control_total int not null default 0,
  control_me int not null default 0,       -- "this is me" count on generic Barnum controls
  recognition real,
  mocked boolean not null default false,
  raw jsonb
);

create index if not exists island_validation_ts_idx on island_validation (ts);
