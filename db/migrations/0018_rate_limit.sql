-- One rate limiter, with a bucket, so a second caller does not eat the first one's window (`⚑30`).
--
-- WHAT WAS WRONG WITH REUSING 0007's. `waitlist_rate`'s primary key is `(ip_hash, window_start)`.
-- It was written for one caller and it is correct for one caller — but the moment a second route
-- calls `waitlist_rate_hit`, a burst on that route consumes the SAME counter, and a person who has
-- generated five portraits is told the waitlist is full. Namespacing the key by prefixing the ip
-- hash ("vision:" || hash) would have worked and would have put the bucket inside a column named
-- `ip_hash`, where the next reader has to infer it. The bucket is a column here.
--
-- WHAT THIS IS NOT: a budget. It counts requests per (bucket, ip, window). It knows nothing about
-- what a request costs, and `COST_DAILY_USD_BUDGET` still enforces nothing (⚑30). A caller who
-- mints an identity per request is also unbounded by this — the limit is per IP, deliberately,
-- because the routes it protects are reached before a person has any durable identity worth
-- counting against.
--
-- FIXED WINDOW, NOT SLIDING, inherited from 0007 with its reasoning: the worst case is a burst
-- straddling a boundary letting through ~2x the limit, and that is cheaper than the bookkeeping a
-- sliding window needs. Same call shape, same atomicity argument:
--
--     The increment MUST be atomic and supabase-js cannot express `hits = hits + 1` in an upsert.
--     Read-then-write from the route would race — two concurrent requests both read N and both
--     write N+1, so a burst of parallel submits sails straight through the limit, which is the
--     exact scenario a rate limiter is for. `insert … on conflict do update` is a single statement,
--     so Postgres serialises it on the primary key and the count is always right.
--
-- 0007's `waitlist_rate` and `waitlist_rate_hit` are LEFT IN PLACE, because this folder is
-- forward-only and its rows are real. `api/waitlist/route.ts` now calls this one, so the old
-- function has no caller; it is not dropped, and a later migration that drops it should say so
-- rather than this one doing it quietly.
--
-- RLS with zero policies, per `0015`/`0017`: every writer here is the service role, which bypasses
-- it, and the anon key ships in the browser bundle.

create table if not exists rate_limit_hits (
  -- Which limiter. One short name per protected surface; see lib/rateLimit.ts for the list.
  bucket text not null,
  -- A salted SHA-256 of the client IP, never the IP. The point is to count requests, not to retain
  -- a network identifier for everyone who visits. Same derivation as 0007's, from one shared helper.
  ip_hash text not null,
  -- Start of the fixed window this counter covers.
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, ip_hash, window_start)
);

alter table rate_limit_hits enable row level security;

-- Lets old windows be swept without a table scan. There is no TTL in Postgres, so retention is a
-- housekeeping job:  delete from rate_limit_hits where window_start < now() - interval '1 day';
-- NOT WIRED TO ONE, and 0007 has the same gap — recorded rather than implied.
create index if not exists rate_limit_hits_window_idx on rate_limit_hits (window_start);

-- Count one request and return the running total for this (bucket, ip, window), atomically.
--
-- Not SECURITY DEFINER: the routes call this with the service role, which bypasses RLS anyway.
-- Granting it to anon would hand out a write primitive on a table anon must not touch.
create or replace function rate_limit_hit(p_bucket text, p_ip text, p_window timestamptz)
returns int
language plpgsql
as $$
declare
  v_hits int;
begin
  insert into rate_limit_hits (bucket, ip_hash, window_start, hits)
  values (p_bucket, p_ip, p_window, 1)
  on conflict (bucket, ip_hash, window_start)
  do update set hits = rate_limit_hits.hits + 1
  returning hits into v_hits;
  return v_hits;
end;
$$;

revoke all on function rate_limit_hit(text, text, timestamptz) from public, anon, authenticated;
