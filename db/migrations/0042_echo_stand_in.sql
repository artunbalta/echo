-- An echo standing in for its person in a village room (C103): whether they let it, and the record it
-- earns that right from.
--
-- `echo_stand_in` is one person's yes: a row while they let their echo keep their body in a room when they
-- leave it. No row, no stand-in. Saying no deletes the row and every `echo_looks` row of theirs.
--
-- `echo_looks` is PERSONAL DATA: each moment the person met in the village, the call their echo sealed
-- before it, how sure it was, and what the person did. It is the whole of what the echo stands in from,
-- and nothing else reads it. Erased with the person (§13). `seal` is the hash the browser's chain gave the
-- call (`seal.ts`), so a row can be matched to the envelope it came from and is never kept twice.
--
-- RLS on with zero policies, per 0015–0023.

create table if not exists echo_stand_in (
  subject text primary key,
  since timestamptz not null default now()
);

alter table echo_stand_in enable row level security;

create table if not exists echo_looks (
  subject text not null,
  seal text not null,
  cell text not null,
  kind text not null,
  arm text,
  call text not null,
  p real not null check (p >= 0 and p <= 1),
  did text not null,
  sealed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (subject, seal)
);

alter table echo_looks enable row level security;

create index if not exists echo_looks_subject_idx on echo_looks (subject, sealed_at);

-- What an echo did while it kept its person's body in a room, and "that was not me" (C105).
--
-- `echo_away` is PERSONAL DATA: one row per time the echo kept the body, as the room reported it when the
-- keeping ended (signed by the room; `/api/echo/keeping`): each moment it met, its call there, where it stood,
-- and what it did. Kept only while the person's yes stands; a no deletes it with the rest.
--
-- `echo_vetoes` is the person saying of one of those moments that it was not them. Each one raises what
-- the echo must show in that moment's kind of situation (C103 `vetoes`). One per moment.
--
-- RLS on with zero policies, per 0015–0023. Both erased with the person (§13).

create table if not exists echo_away (
  subject text not null,
  cell text not null,
  room text not null,
  since timestamptz not null,
  until timestamptz not null,
  log jsonb not null,
  created_at timestamptz not null default now(),
  primary key (subject, since)
);

alter table echo_away enable row level security;

create table if not exists echo_vetoes (
  subject text not null,
  at bigint not null,
  kind text not null,
  call text not null,
  made_at timestamptz not null default now(),
  primary key (subject, at, kind)
);

alter table echo_vetoes enable row level security;
