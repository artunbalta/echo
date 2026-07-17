-- Waitlist (landing §1b/§3): name + email capture from the "choose your character" roster on the
-- public landing page. Distinct from public.users / Supabase Auth (0001_init.sql): a waitlist row is
-- an intent to be invited, NOT an account. There is no password, no auth_ref, and no island claim.
--
-- Apply via: psql $DATABASE_URL -f db/migrations/0007_waitlist.sql
--
-- RENUMBERED from 0006 to 0007. It was written as 0006 by reading the migration folder on a stale
-- branch, where 0005 was the last one; main already had 0006_island_state.sql (12 July), so there
-- were briefly two 0006s and the order was a coin toss. island_state came first and keeps 0006.
-- Renaming is safe here precisely because this repo applies migrations BY HAND: there is no runner
-- and no schema_migrations table, so nothing recorded the old filename. If this table already
-- exists in your database it was applied under the old name and needs no action; the file is
-- idempotent (create table if not exists / create or replace) either way.
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

  -- ── seat + status: real scarcity, and the door left open for payment ──────────────────────
  -- The landing states a hard cap and shows the true remaining count. `seat` is the claim: 1..cap,
  -- unique, assigned atomically by waitlist_join() below. It is a real number, not a display prop.
  seat int,
  -- status is the ONE structural concession to a payment step that does not exist yet (and is NOT
  -- built here). Today every row is inserted 'confirmed', because the waitlist is free.
  --
  -- Why it earns its place now rather than later: the cap counts CONFIRMED rows only. Adding
  -- payment later therefore becomes "insert 'pending', let the webhook flip it to 'confirmed'"
  -- — a new state on an existing axis. Without this column, seats would have to be consumed at
  -- insert time, and a paid flow would need either seat reservation retro-fitted into a table with
  -- no notion of an unconfirmed row, or a second table and a migration of live signups. That is the
  -- "tearing it apart" case. One column and one seat rule avoid it.
  status text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  -- Reserved for the payment step; always null today. Named now so the shape is agreed, not so it
  -- is used — nothing reads or writes these until payment is actually built.
  paid_at timestamptz,
  payment_ref text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A seat is a claim on a real, limited thing, so the DB enforces uniqueness rather than the app
-- hoping. Partial: pending/abandoned rows hold no seat.
create unique index if not exists waitlist_seat_uidx on waitlist (seat) where seat is not null;

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

-- ── waitlist_join: claim a seat, atomically, or be told the list is full ───────────────────────
--
-- The landing says spots are limited and shows the real remaining count, so the cap has to be a
-- fact rather than a decoration. That means it cannot be enforced as "SELECT count(*) then INSERT"
-- from the route: two requests at seat cap-1 would both read cap-1, both pass the check, and both
-- insert. A cap you can beat by clicking twice is not a cap.
--
-- pg_advisory_xact_lock serialises seat allocation for the length of the transaction, so the count
-- and the insert cannot interleave. It is scoped to one lock key, so it costs nothing to anything
-- else in the database, and it releases automatically on commit or rollback.
--
-- Returns jsonb: {ok, already, full, seat, taken, remaining}. `full` is a real answer, not an error.
create or replace function waitlist_join(
  p_email text,
  p_name text,
  p_cap int,
  p_source text default 'premade',
  p_ref text default null,
  p_sprite_url text default null,
  p_attributes jsonb default null,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_existing waitlist%rowtype;
  v_taken int;
  v_seat int;
begin
  -- A repeat signup updates and keeps its original seat: changing your character must not cost you
  -- your place, and must not consume a second one (§3 "a repeat signup should update, not error").
  select * into v_existing from waitlist where email = p_email;
  if found then
    update waitlist
       set name = p_name,
           character_source = p_source,
           character_ref = p_ref,
           character_sprite_url = coalesce(p_sprite_url, character_sprite_url),
           character_attributes = coalesce(p_attributes, character_attributes),
           ip_hash = coalesce(p_ip_hash, ip_hash),
           user_agent = coalesce(p_user_agent, user_agent),
           updated_at = now()
     where email = p_email;
    select count(*) into v_taken from waitlist where status = 'confirmed';
    return jsonb_build_object('ok', true, 'already', true, 'full', false,
                             'seat', v_existing.seat, 'taken', v_taken,
                             'remaining', greatest(0, p_cap - v_taken));
  end if;

  perform pg_advisory_xact_lock(hashtext('echo_waitlist_seat'));

  -- Only CONFIRMED rows consume the cap. Today that is every row; when payment lands, an unpaid
  -- 'pending' row will hold no seat until its webhook confirms it. See the status column.
  select count(*) into v_taken from waitlist where status = 'confirmed';
  if v_taken >= p_cap then
    return jsonb_build_object('ok', false, 'already', false, 'full', true,
                             'seat', null, 'taken', v_taken, 'remaining', 0);
  end if;

  select coalesce(max(seat), 0) + 1 into v_seat from waitlist;

  insert into waitlist (email, name, character_source, character_ref, character_sprite_url,
                        character_attributes, ip_hash, user_agent, seat, status)
  values (p_email, p_name, p_source, p_ref, p_sprite_url, p_attributes, p_ip_hash, p_user_agent,
          v_seat, 'confirmed');

  return jsonb_build_object('ok', true, 'already', false, 'full', false,
                           'seat', v_seat, 'taken', v_taken + 1,
                           'remaining', greatest(0, p_cap - (v_taken + 1)));
end;
$$;

revoke all on function waitlist_join(text, text, int, text, text, text, jsonb, text, text)
  from public, anon, authenticated;

-- The public count, for the landing's "N of CAP left". Confirmed rows only, and no PII: this is the
-- ONE thing about the waitlist the world is allowed to know. Still service-role only — the route
-- calls it and returns just the number, so anon never gets a handle on the table itself.
create or replace function waitlist_taken()
returns int
language sql
stable
as $$
  select count(*)::int from waitlist where status = 'confirmed';
$$;

revoke all on function waitlist_taken() from public, anon, authenticated;
