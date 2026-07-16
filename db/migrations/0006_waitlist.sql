-- Waitlist (landing §1b/§3): name + email capture from the "choose your character" roster on the
-- public landing page. Distinct from public.users / Supabase Auth (0001_init.sql): a waitlist row is
-- an intent to be invited, NOT an account. There is no password, no auth_ref, and no island claim.
--
-- Apply via: psql $DATABASE_URL -f db/migrations/0006_waitlist.sql
--
-- RLS — READ THIS. This is the FIRST table in the repo to enable row level security, and the
-- departure is deliberate. Every other table relies on an implicit boundary ("the anon client never
-- touches tables"), which is survivable for game state but not for a public list of real names and
-- email addresses: with RLS disabled, PostgREST exposes the table to anyone holding the anon key,
-- which ships in the browser bundle by definition. So:
--     enable row level security  +  ZERO policies  =  anon can do nothing at all.
-- The service role bypasses RLS entirely, so apps/web/src/app/api/waitlist/route.ts is unaffected.
-- Zero policies is the whole point; do not add one "to be safe" — a policy can only widen access.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  -- Stored already normalised (lowercased + trimmed) by the route. The check enforces that at the
  -- DB level so a hand-written INSERT cannot smuggle in a duplicate that differs only by case, and
  -- so the plain unique index below is a genuine case-insensitive constraint rather than a hope.
  email text not null check (email = lower(email) and email = btrim(email)),
  name text not null,
  -- Which path filled the empty slot. 'premade' = picked from the roster; 'selfie' = uploaded a
  -- photo. Mirrors characters.source in 0001_init.sql so the two vocabularies stay one vocabulary.
  character_source text not null default 'premade' check (character_source in ('selfie', 'premade')),
  -- The premade id (e.g. 'premade_5') for the premade path, so the character survives to invite
  -- time; null for the selfie path, where character_sprite_url holds the result instead.
  character_ref text,
  -- Storage URL of the generated sprite sheet, when one was produced and uploaded. Never a data
  -- URL: uploadSheet() falls back to an inline data URL when Storage is unconfigured, and a ~40KB
  -- base64 blob per row does not belong in a Postgres text column. Null means "no art persisted".
  character_sprite_url text,
  -- Derived style attributes from the selfie path (hair/skin words), never the photo itself.
  -- The raw image is processed once and discarded server-side (§13); it is never stored here.
  character_attributes jsonb,
  -- Coarse abuse forensics only. NOT a durable identifier: see waitlist_rate below for the
  -- rate-limit counter, which is what actually does the work.
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe on email: a repeat signup must update, not error out ugly (§3).
--
-- Indexed on the BARE column, not on lower(email), and that is load-bearing. This index is the
-- ON CONFLICT target for the route's upsert, and PostgREST's `on_conflict=email` infers
-- `ON CONFLICT (email)` — which an *expression* index on lower(email) cannot satisfy, so the upsert
-- would fail at runtime with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". The check constraint on the column above is what makes this case-insensitive.
create unique index if not exists waitlist_email_uidx on waitlist (email);

-- "Show me the signups, newest first" — the only read pattern this table has.
create index if not exists waitlist_created_at_idx on waitlist (created_at desc);

alter table waitlist enable row level security;

-- Per-IP rate limiting (§3). A counter table rather than Upstash/Redis: the routes run as
-- serverless functions, so an in-memory counter would be per-instance and would not hold across
-- lambdas, and this repo has no cache dependency to reuse. One row per (ip_hash, window_start).
--
-- ip_hash is a salted SHA-256 of the client IP, never the IP itself — the point is to count
-- requests, not to retain a network identifier for everyone who looked at the landing page.
create table if not exists waitlist_rate (
  ip_hash text not null,
  -- Start of the fixed window this counter covers (see WINDOW_MS in the route).
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (ip_hash, window_start)
);

alter table waitlist_rate enable row level security;

-- Lets old windows be swept without a table scan. There is no TTL in Postgres, so retention is a
-- housekeeping job:  delete from waitlist_rate where window_start < now() - interval '1 day';
create index if not exists waitlist_rate_window_idx on waitlist_rate (window_start);

-- Count one request and return the running total for this (ip, window), atomically.
--
-- This exists because the increment MUST be atomic and supabase-js cannot express `hits = hits + 1`
-- in an upsert. Doing it as read-then-write from the route would race: two concurrent requests both
-- read N and both write N+1, so a burst of parallel submits sails straight through the limit — which
-- is the exact scenario a rate limiter is for. `insert … on conflict do update` is a single
-- statement, so Postgres serialises it on the primary key and the count is always right.
--
-- Not SECURITY DEFINER: the route calls this with the service role, which bypasses RLS anyway.
-- Granting it to anon would hand out a write primitive on a table anon must not touch.
create or replace function waitlist_rate_hit(p_ip text, p_window timestamptz)
returns int
language plpgsql
as $$
declare
  v_hits int;
begin
  insert into waitlist_rate (ip_hash, window_start, hits)
  values (p_ip, p_window, 1)
  on conflict (ip_hash, window_start)
  do update set hits = waitlist_rate.hits + 1
  returning hits into v_hits;
  return v_hits;
end;
$$;

revoke all on function waitlist_rate_hit(text, timestamptz) from public, anon, authenticated;
