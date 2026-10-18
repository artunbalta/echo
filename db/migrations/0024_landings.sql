-- A stranger coming in from the sea on a raft (C57), and who saw it.
--
-- `player_landings` is PERSONAL DATA: where one stranger came ashore, on what world day and hour, from
-- which parcel, and the `Person.id`s of the villagers who saw it. It is what lets a village say "you
-- came in out of the sea", and it is erased with the stranger (§13), as `village_deeds` is.
--
-- `side` is the travel stand's verdict (`packages/planet/lib/crossing.ts`): far, ashore in a parcel
-- other than the one launched from; near, back where they set out.
--
-- RLS on with zero policies, per 0015–0023.

create table if not exists player_landings (
  id bigint generated always as identity primary key,
  subject text not null,
  cell text not null,
  from_cell text not null,
  from_name text,
  side text not null check (side in ('far', 'near')),
  rings smallint not null check (rings >= 0),
  day int not null,
  hour real not null,
  witnesses text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table player_landings enable row level security;

create index if not exists player_landings_subject_cell_idx on player_landings (subject, cell, day);
