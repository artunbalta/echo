-- Circles (C83): "who knows you best" for any group of friends, not only the owner's study
-- (`apps/web/src/lib/pilotCircles.ts`).
--
-- `pilot_circles` is one circle: the SHA-256 of its join code (never the code), who started it (cleared
-- when they erase themselves, while the circle stays for its friends), how many visits it plays, and
-- whether its friends may give their data to research (false for every circle today). The owner's
-- registered study is the circle 'study', which has no row here: its code is ECHO_PILOT_CODE, as before.
--
-- `pilot_people` gains its circle ('study' for everyone already in it, so nothing moves) and
-- `research_at`, a yes to research of its own outside the study; in the study the one yes covers both.
-- `pilot_ratings` gains the circle the rating was made in. Nicknames become unique per circle instead of
-- across the pilot.
--
-- Safe before the code that reads it, and the code is safe before it: with ECHO_CIRCLES unset the app
-- reads and writes none of these columns.
--
-- RLS on with zero policies, per 0015–0036.

create table if not exists pilot_circles (
  id text primary key check (id ~ '^[a-z0-9]{6,24}$' and id <> 'study'),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by text,
  created_at timestamptz not null default now(),
  visits smallint not null default 3 check (visits in (2, 3)),
  research boolean not null default false
);

alter table pilot_circles enable row level security;

create index if not exists pilot_circles_created_by_idx on pilot_circles (created_by);

alter table pilot_people add column if not exists circle text not null default 'study';
alter table pilot_people add column if not exists research_at timestamptz;
update pilot_people set research_at = consent_at where circle = 'study' and research_at is null;

drop index if exists pilot_people_nickname_idx;
create unique index if not exists pilot_people_circle_nickname_idx on pilot_people (circle, lower(nickname));

alter table pilot_ratings add column if not exists circle text not null default 'study';
create index if not exists pilot_ratings_circle_idx on pilot_ratings (circle);
