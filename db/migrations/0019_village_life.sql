-- What conversations change about villagers' lives, and what villagers remember of strangers (C44).
--
-- TWO TABLES, AND THEY ARE NOT THE SAME KIND OF THING.
--
-- `village_changes` is WORLD STATE, shared by every visitor: the delta the seed is the prior of (L1).
-- A row says that a person, on a world day, decided to leave, to stay after all, to take up a trade,
-- to want something, or to stop wanting it — in a closed grammar (`packages/planet/lib/changes.ts`)
-- with no free text, because what is here is shown to everyone who comes after. The village is
-- GENERATED from these rows (`settlementAt(..., changes)`), so one row can mean a family gone and a
-- generation of children never born — computed, never stored. Rows are never edited and never
-- deleted by the product: a decision that is unmade is a later `stay` or `drop`, so the history of a
-- village is append-only, like its graves.
--
-- `villager_memories` is PERSONAL DATA: what one villager remembers of one stranger, in the
-- villager's own words, written by the model after each line of a conversation. It is private to that
-- stranger — no other visitor's conversation reads it — and it is erased with them.
--
-- ERASURE (§13, `api/account/delete`). A memory row is deleted. A change row is NOT: it is the
-- world's history now, and deleting it would bring a family back from wherever it went, for every
-- other visitor. Its `subject` is set to null instead, so nothing left in it points at the person.
--
-- RLS on with zero policies, per 0015/0017/0018: the only writer and reader is the service role,
-- through the talk routes. The browser reads changes through `GET /api/village/changes`, which
-- returns no subject.

create table if not exists village_changes (
  id bigint generated always as identity primary key,
  -- The H3 cell of the settlement. Every read is "all changes for this cell".
  cell text not null,
  -- `Person.id` (C43): sixteen hex characters of the person's lineage.
  person text not null,
  kind text not null check (kind in ('leave', 'stay', 'trade', 'goal', 'drop')),
  -- World days (C24): the day the decision was made, and the day it takes effect.
  made_day int not null,
  day int not null,
  occupation text,
  goal text,
  target text,
  goal_id text,
  -- Who was talking to them when they decided. Null after that person's erasure.
  subject text,
  created_at timestamptz not null default now(),
  check (day >= made_day)
);

alter table village_changes enable row level security;

create index if not exists village_changes_cell_idx on village_changes (cell, id);
create index if not exists village_changes_subject_idx on village_changes (subject) where subject is not null;

create table if not exists villager_memories (
  subject text not null,
  cell text not null,
  person text not null,
  -- In the villager's words, at most 600 characters (the route trims to that). Never shown to anyone
  -- but the stranger it is about, and only through the villager.
  note text not null default '',
  meetings int not null default 0,
  first_day int not null,
  last_day int not null,
  updated_at timestamptz not null default now(),
  primary key (subject, cell, person)
);

alter table villager_memories enable row level security;

create index if not exists villager_memories_subject_idx on villager_memories (subject);
