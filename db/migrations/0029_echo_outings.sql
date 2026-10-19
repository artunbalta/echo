-- When a stranger was last in the world, and what their echo did while they were away (C64).
--
-- `player_presence` is PERSONAL DATA: one row per stranger, the last moment the page said they were
-- there and in which parcel. It is how an absence is known at all. Raw (a record of being somewhere),
-- swept after 90 days, erased with the person.
--
-- `echo_outings` is PERSONAL DATA: what the stranger's echo did in one absence: where it went, whom
-- it met, every line it said or held back with the gate's confidence for it, what the villagers said,
-- and the stranger's own answer to each line afterwards ("that's me" / "not me"). Raw, 90 days, erased
-- with the person. What the villagers remember of those meetings is in `villager_memories` (C44),
-- erased the same way.
--
-- RLS on with zero policies, per 0015–0028.

create table if not exists player_presence (
  subject text primary key,
  last_seen_at timestamptz not null,
  last_cell text not null
);

alter table player_presence enable row level security;

create index if not exists player_presence_seen_idx on player_presence (last_seen_at);

create table if not exists echo_outings (
  id text primary key,
  subject text not null,
  cell text,
  village text,
  away_from timestamptz not null,
  away_to timestamptz not null,
  made_at timestamptz not null default now(),
  read_at timestamptz,
  encounters jsonb not null default '[]'::jsonb,
  waits jsonb,
  reason text
);

alter table echo_outings enable row level security;

create index if not exists echo_outings_subject_idx on echo_outings (subject, made_at desc);
create index if not exists echo_outings_made_idx on echo_outings (made_at);
