-- Row level security for the ten tables 0015 did not reach (SOCIETY-PLAN SOC-2.G, `⚑29`).
--
-- 0015 made the case and it is not restated here: with RLS disabled, PostgREST exposes a table to
-- anyone holding the anon key, WHICH SHIPS IN THE BROWSER BUNDLE BY DEFINITION, and
--
--     enable row level security  +  ZERO policies  =  anon can do nothing at all.
--
-- ZERO POLICIES IS STILL THE WHOLE POINT; do not add one "to be safe" — a policy can only widen
-- access. Every table access in this repo goes through the service role, which bypasses RLS
-- entirely, and that was re-checked for these ten rather than inherited: 23 `.from(` sites and 10
-- raw `rest/v1` fetches, every one of them reading SUPABASE_SERVICE_ROLE_KEY with no anon fallback;
-- `lib/supabase.ts`, the one browser-side client, is still `auth.*` and Storage only and never reads
-- a table; and there is no `.channel(` / `postgres_changes` subscription anywhere that RLS would
-- silence.
--
-- WHAT 0015 GOT WRONG, AND IT IS AN ARITHMETIC ERROR IN A CLOSED FLAG. Its header says "Sixteen
-- tables, one line each" and `⚑25` closed on that number. Sixteen was the count of tables it
-- CHANGED, not the count that needed changing: 0015 was scoped to what 0001 created, and 0002, 0003,
-- 0004, 0006 and 0009 had created ten more. MEASURED on this tree before this file: 20 of 30 tables
-- had RLS. `⚑25` was closed at 61%.
--
-- THE FOUR THAT ARE LIVE, and one of them is the reason this is not a tidy-up:
--
--   connection_analyses   0002:5   user_id + transcript_json — the FULL [{who,text}] exchange.
--                                  The same sensitivity class as `messages.text`, which
--                                  `lib/retention.ts:44-48` marks with a ⚠️.
--   island_validation     0003:6   user_id, per-session validation rows.
--   islands               0004:6   owner_user_id — which island belongs to whom.
--   island_state          0006:7   user_id primary key; a person's day, ties and raft.
--
-- THE SIX THAT ARE NOT REACHED YET are 0009's planet registry (world_manifest, parcels,
-- unclaimed_cells, rounds, landless_waitlist, referrals). `lib/planet.ts:99` hardcodes
-- `backend: "memory"` and the pg-backed registry is never instantiated, so nothing writes them
-- today — but this folder is forward-only and SOC-2.A is the decision that turns them on. RLS
-- before the first row is free; after it is a migration nobody wants to reason about.
--
-- WHY THE EXISTENCE GUARD, which 0015 did not need. `scripts/migrate.mjs` runs a whole file in ONE
-- transaction, so one missing relation aborts all of it and nothing is recorded. A production
-- database that was migrated by hand and adopted with `--baseline` has 0009 RECORDED AS APPLIED AND
-- NOT RUN — which is the expected shape here, because the planet registry has never been deployed.
-- MEASURED: a bare `alter table world_manifest …` in this file fails such a database with
-- `relation "world_manifest" does not exist`, THE FOUR LIVE TABLES GET NOTHING, and every later
-- `--apply` fails identically because 0009 will never run. The operator is handed an error naming a
-- parcel table with no personal data in it while the transcript table stays open — SOCIETY-PLAN §3
-- item 8's species exactly, a reference that is true in one database and false in the one in front
-- of you.
--
-- The ten names stay written out, because 0015's explicitness is right: a reader must be able to see
-- what this file does without querying a database. What the guard removes is the coupling between
-- them, not the list.
--
-- THE ELEVENTH TABLE IS NOT THIS FILE'S JOB. A future migration that creates a table and forgets
-- RLS is caught by the CI assertion added beside this one (`.github/workflows/ci.yml`), which reads
-- `pg_tables` after the whole folder has been applied and fails on any table with `rowsecurity`
-- false. A loop over `pg_tables` HERE would have covered it too, and was rejected: it would silently
-- enable RLS on tables nobody has looked at, in a forward-only folder, which is the opposite of the
-- decision 0015 documented for each of its sixteen.
--
-- WHAT THIS IS NOT. It is not retention and it is not erasure — 0015's sentence, inherited. But 0015
-- could inherit it cleanly and this file cannot: `connection_analyses` and `island_validation` are
-- in NEITHER of `lib/retention.ts`'s lists, and that file says in its own words that "a table in
-- neither list is a table nobody has decided about". C35 classified thirteen identity-keyed tables
-- and did not see these two. Making the rows unreadable by the public does not decide how long they
-- live, and `connection_analyses` holds the transcripts `messages` is on a clock for. Owed to C35.

do $$
declare
  t text;
begin
  foreach t in array array[
    -- live today
    'connection_analyses',
    'island_validation',
    'islands',
    'island_state',
    -- 0009's planet registry: no writers until SOC-2.A, and forward-only means now is the cheap time
    'world_manifest',
    'parcels',
    'unclaimed_cells',
    'rounds',
    'landless_waitlist',
    'referrals'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    else
      raise notice '0017: skipping %, which this database does not have', t;
    end if;
  end loop;
end $$;
