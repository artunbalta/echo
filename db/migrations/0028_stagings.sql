-- What the director set out for a stranger, and what became of it (C63).
--
-- `player_stagings` is PERSONAL DATA: one row per encounter the world set out for one stranger (a gull
-- in netting, a dropped pouch, a carved stone, a dark cleft; `packages/planet/lib/director.ts`), where,
-- why the engine picked it (`info_gain`), and how it was answered: the verb, "passed", or null while
-- it stands. The mirror shows these to the stranger afterwards. It records what someone did, so it is
-- RAW: swept after 90 days (`lib/retention.ts`), and erased with the person (§13).
--
-- RLS on with zero policies, per 0015–0027.

create table if not exists player_stagings (
  id text primary key,
  subject text not null,
  cell text not null,
  situation text not null check (situation in ('netted_gull', 'lost_pouch', 'carved_mark', 'dark_cleft')),
  x real not null,
  y real not null,
  facing real not null,
  owner text,
  owner_name text,
  info_gain real,
  created_at timestamptz not null default now(),
  resolved text,
  resolved_at timestamptz
);

alter table player_stagings enable row level security;

create index if not exists player_stagings_subject_idx on player_stagings (subject, created_at desc);
create index if not exists player_stagings_created_idx on player_stagings (created_at);
