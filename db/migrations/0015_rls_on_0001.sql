-- Row level security for every table 0001 created (SOCIETY-PLAN SOC-2.G, and the consequence of
-- SOC-2.D actually writing some of them).
--
-- 0007 is where this repo wrote the rule down, and it wrote it as a deliberate exception:
--
--     "This is the FIRST table in the repo to enable row level security, and the departure is
--      deliberate. Every other table relies on an implicit boundary ('the anon client never touches
--      tables'), which is SURVIVABLE FOR GAME STATE but not for a public list of real names and
--      email addresses: with RLS disabled, PostgREST exposes the table to anyone holding the anon
--      key, WHICH SHIPS IN THE BROWSER BUNDLE BY DEFINITION."
--
-- That reasoning was right and its premise has changed twice. `0011_behavioral_events` made the
-- behavioural log durable and enabled RLS for itself; and SOC-2.D has just started WRITING
-- `persona_state`, `behavior_index`, `reward_model_state` and `autonomy_buckets`, which had been
-- declared since June with zero writers. They are no longer empty and they were never game state:
-- `persona_state` is an eight-axis personality measurement of a named person, and `behavior_index`
-- is what they did, embedded, with SOC-2.F's evidentiary class attached.
--
-- SO THE EXCEPTION BECOMES THE RULE. Sixteen tables, one line each, zero policies.
--
--     enable row level security  +  ZERO policies  =  anon can do nothing at all.
--
-- ZERO POLICIES IS THE WHOLE POINT; do not add one "to be safe" — a policy can only widen access.
--
-- NOTHING THAT WORKS TODAY BREAKS, and that was checked rather than assumed. Every table access in
-- this repo goes through the service role, which bypasses RLS entirely: `supabaseAdmin.adminClient`,
-- `apps/realtime/src/{npcs,persistence}.ts`, and `services/ml`'s new `persistence.py`. The ONE
-- browser-side client, `lib/supabase.ts`, is used only for `auth.*` and Storage — it never reads a
-- table, which is exactly the "implicit boundary" 0007 named, now made explicit.
--
-- WHAT THIS IS NOT. It is not a retention window and it is not erasure. SOC-2.G is still open and
-- `0011`'s "no TTL, no expiry column, no pruning job" is now true of five more tables. This makes
-- the rows unreadable by the public; it does not make them go away.

alter table users              enable row level security;
alter table characters         enable row level security;
alter table worlds             enable row level security;
alter table npcs               enable row level security;
alter table world_entities     enable row level security;
alter table sessions           enable row level security;
alter table interactions       enable row level security;
alter table messages           enable row level security;
alter table telemetry_events   enable row level security;
alter table persona_state      enable row level security;
alter table behavior_index     enable row level security;
alter table preference_pairs   enable row level security;
alter table reward_model_state enable row level security;
alter table autonomy_buckets   enable row level security;
alter table meeting_outcomes   enable row level security;
alter table narrations         enable row level security;
