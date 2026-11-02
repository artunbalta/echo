-- Two echoes meeting while both their people are away (C71).
--
-- `echo_invites` is PERSONAL DATA: a short code one stranger makes so that someone they know can let
-- their two echoes meet, with the name they go by. Single use, gone after a day, erased with them.
--
-- `echo_pairs` is PERSONAL DATA: two strangers who have both said yes (one made the code, the other
-- accepted it), each with the name the other knows them by. Either can end it; it is erased with
-- either of them.
--
-- `echo_meetings` is PERSONAL DATA OF BOTH: what their two echoes said to each other, in a village,
-- at a time when both were away. Every line passed its own echo's gate: said aloud, or held back and
-- kept as what it would have said. Each person answers only their own echo's lines. RAW, swept after
-- 90 days (`lib/retention.ts`), and erased with EITHER person: it is their echo's words too.
--
-- RLS on with zero policies, per 0015–0032: only the server's routes touch these.

create table if not exists echo_invites (
  code text primary key,
  subject text not null,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table echo_invites enable row level security;

create index if not exists echo_invites_subject_idx on echo_invites (subject);

create table if not exists echo_pairs (
  id text primary key,
  a text not null,
  b text not null,
  a_name text not null check (char_length(a_name) between 1 and 40),
  b_name text not null check (char_length(b_name) between 1 and 40),
  created_at timestamptz not null default now(),
  check (a <> b)
);

alter table echo_pairs enable row level security;

-- One pair per two people, whichever of them asked.
create unique index if not exists echo_pairs_people_idx on echo_pairs (least(a, b), greatest(a, b));
create index if not exists echo_pairs_a_idx on echo_pairs (a);
create index if not exists echo_pairs_b_idx on echo_pairs (b);

create table if not exists echo_meetings (
  id text primary key,
  pair text not null,
  a text not null,
  b text not null,
  a_name text not null,
  b_name text not null,
  status text not null check (status in ('planned', 'making', 'made', 'failed')),
  away_from timestamptz not null,
  away_to timestamptz not null,
  cell text,
  village text,
  day int,
  hour real,
  x real,
  y real,
  topic text,
  lines jsonb not null default '[]'::jsonb,
  witnesses text[] not null default '{}',
  made_at timestamptz not null default now(),
  making_at timestamptz,
  read_a timestamptz,
  read_b timestamptz,
  -- Each person's answers to their own echo's lines, by line index. Two columns, each written only by its
  -- person, so two people answering at once cannot overwrite each other.
  feedback_a jsonb not null default '{}'::jsonb,
  feedback_b jsonb not null default '{}'::jsonb,
  reason text
);

alter table echo_meetings enable row level security;

create index if not exists echo_meetings_a_idx on echo_meetings (a, made_at desc);
create index if not exists echo_meetings_b_idx on echo_meetings (b, made_at desc);
create index if not exists echo_meetings_pair_idx on echo_meetings (pair, made_at desc);
create index if not exists echo_meetings_made_idx on echo_meetings (made_at);
