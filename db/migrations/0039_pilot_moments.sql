-- Every moment a pilot participant met (C87): what it was, the arm of its experiment they met, how long it
-- was in view and how near they came, and what became of it — the verb they chose, walking past, nothing,
-- or how an errand ended. It is the denominator the moments' analysis needs (registration §5): who met the
-- nine-coin purse, not only who took from it.
--
-- `pilot_moments` is PERSONAL DATA, one row per moment a person met, written once by its reference. It is
-- kept for the study (`lib/retention.ts` does not sweep it) and erased with the person (§13). It is
-- written only by the pilot route (`POST /api/pilot?op=moments`) and read only by its export: the engine
-- never sees it, so it moves no echo.
--
-- RLS on with zero policies, per 0015–0038.

create table if not exists pilot_moments (
  subject text not null,
  ref text not null check (char_length(ref) between 8 and 120),
  circle text,
  visit smallint not null check (visit between 1 and 3),
  kind text not null check (char_length(kind) between 1 and 40),
  lane text not null check (lane in ('people', 'passer', 'wayside', 'errand')),
  arm text check (arm is null or char_length(arm) between 1 and 24),
  arm_raw jsonb,
  seen_at timestamptz not null,
  ended_at timestamptz not null,
  seen_s real not null check (seen_s >= 0 and seen_s <= 3600),
  nearest_m real check (nearest_m is null or (nearest_m >= 0 and nearest_m <= 500)),
  outcome text not null check (char_length(outcome) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (subject, ref),
  check (ended_at >= seen_at)
);

alter table pilot_moments enable row level security;

create index if not exists pilot_moments_circle_idx on pilot_moments (circle);
create index if not exists pilot_moments_kind_idx on pilot_moments (kind, arm);
