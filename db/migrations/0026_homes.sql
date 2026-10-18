-- A stranger's own house on their own land, and their own look (C59).
--
-- `player_homes` is PERSONAL DATA: one row per stranger. It holds where their house stands on their
-- parcel (local metres in the parcel's frame, and the way the door faces), how many of its four
-- stages are built, the dyes its door and walls are painted with, and what is set down inside it
-- (`packages/planet/lib/homes.ts`). The house is on the stranger's own land, so anyone visiting the
-- parcel sees it. It is erased with the stranger (§13), and the land goes back to being land.
--
-- `player_looks` is what they have dyed their clothes, by dye.
--
-- RLS on with zero policies, per 0015–0025.

create table if not exists player_homes (
  subject text primary key,
  cell text not null,
  x real not null,
  y real not null,
  facing real not null,
  stage smallint not null default 0 check (stage between 0 and 4),
  colours jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  made_day int not null,
  updated_at timestamptz not null default now()
);

alter table player_homes enable row level security;

create index if not exists player_homes_cell_idx on player_homes (cell);

create table if not exists player_looks (
  subject text primary key,
  look jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table player_looks enable row level security;
