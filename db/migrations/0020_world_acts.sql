-- What strangers do to the world, and the marks it leaves (C45).
--
-- TWO TABLES, two kinds of thing, as in 0019.
--
-- `world_effects` is WORLD STATE, shared by every visitor: a trampled field, a forced door, a shell
-- that has been taken, a grave someone tidied. Each mark has the day it was made and the day it heals
-- — every mark heals, because the world is shared and one person's afternoon must not be everyone's
-- village for good. The browser reads them through `GET /api/village/changes` (no subject).
--
-- `village_deeds` is PERSONAL DATA: what one stranger did that touched somebody, with the
-- `Person.id`s of who saw it and who it was done to. It is what a villager knows of you, and it is
-- private to you — no other visitor's conversation reads your deeds — and it is erased with you
-- (§13, `api/account/delete`). Deleting a deed makes the villagers forget it, which is what erasure
-- should mean; a mark it left on the world stays until it heals, with its subject cleared.
--
-- RLS on with zero policies, per 0015/0017/0018/0019: the service role is the only reader and writer.

create table if not exists world_effects (
  id bigint generated always as identity primary key,
  cell text not null,
  -- The thing's reference (`packages/planet/lib/things.ts`): `field:3`, `house:12`, `shell@4.2,-17.0`.
  thing text not null,
  kind text not null check (kind in ('trampled', 'tended', 'forced', 'taken', 'tidied', 'worked')),
  -- World days (C24): made, and healed.
  day int not null,
  until_day int not null,
  -- Who made the mark. Null after that person's erasure.
  subject text,
  created_at timestamptz not null default now(),
  check (until_day > day)
);

alter table world_effects enable row level security;

create index if not exists world_effects_cell_idx on world_effects (cell, until_day);
create index if not exists world_effects_subject_idx on world_effects (subject) where subject is not null;

create table if not exists village_deeds (
  id bigint generated always as identity primary key,
  subject text not null,
  cell text not null,
  verb text not null,
  kind text not null,
  thing text not null,
  thing_name text not null,
  reading text not null check (reading in ('help', 'kindness', 'respect', 'harm', 'theft', 'trespass', 'disrespect')),
  weight smallint not null check (weight between 1 and 3),
  day int not null,
  hour real not null,
  -- `Person.id`s (C43): who saw it, and who it was done to.
  witnesses text[] not null default '{}',
  owners text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table village_deeds enable row level security;

create index if not exists village_deeds_subject_cell_idx on village_deeds (subject, cell, day);
