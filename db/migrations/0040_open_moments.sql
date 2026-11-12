-- The village's count (C91): what people who walked the open world did at each moment, with no names,
-- so that an echo can start from what most people do and be held against it.
--
-- One row is one settled envelope (C89): the moment, the arm of its experiment that was met, the echo's
-- call and what was done, how many times the echo had seen the person there before, and when it was
-- sealed. `visitor` is a random id made in the browser for this count alone: it is not the echo's
-- subject, it is in no other table, and it is what lets a person remove their rows
-- (`DELETE /api/calls`). `seal` is the envelope's own hash, so a row is written once.
--
-- `open_moments` is PERSONAL DATA all the same (a person's rows hang together), added only by someone
-- who said yes to the count in words that named it. It is written by `POST /api/calls` and read back
-- only as counts (`open_moments_crowd`); the engine never sees it, so it moves no echo. Nothing here is
-- the study's: the pilot's record is `pilot_moments` (0039), and a pilot visit adds nothing to this.
--
-- RLS on with zero policies, per 0015–0039.

create table if not exists open_moments (
  visitor text not null check (visitor ~ '^[a-z0-9]{20,40}$'),
  seal text not null check (seal ~ '^[0-9a-f]{64}$'),
  cell text not null check (cell ~ '^[0-9a-f]{15}$'),
  kind text not null check (char_length(kind) between 1 and 40),
  arm text check (arm is null or char_length(arm) between 1 and 24),
  call text not null check (char_length(call) between 1 and 24),
  did text not null check (char_length(did) between 1 and 24),
  looks_same integer not null default 0 check (looks_same >= 0),
  looks_family integer not null default 0 check (looks_family >= 0),
  sealed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (visitor, seal)
);

alter table open_moments enable row level security;

create index if not exists open_moments_kind_idx on open_moments (kind, arm);

-- The count the page is given: for a moment and an arm of it, how often it ended each way, and among how
-- many people. Read by the service role only; the route keeps back any cell too few people have met.
--
-- The arm is taken once, below the grouping ('-' for a moment with none): Postgres will not match a
-- grouped expression inside the correlated count, so grouping by `coalesce(arm, '-')` directly fails
-- with "subquery uses ungrouped column" (found on PostgreSQL 16 before this was ever applied).
create or replace view open_moments_crowd
with (security_invoker = true) as
select
  m.kind,
  m.arm,
  m.did,
  count(*)::integer as n,
  (
    select count(distinct p.visitor)::integer
    from open_moments p
    where p.kind = m.kind and coalesce(p.arm, '-') = m.arm
  ) as people
from (select kind, coalesce(arm, '-') as arm, did from open_moments) m
group by m.kind, m.arm, m.did;
