-- Behavioral events: the durable record of every measurement a room-less session sends to the
-- learning engine (plan W5-0). One row per event, written by the Next ingress routes BEFORE the
-- forward to echo-ml and awaited, so what the table holds is what the posterior was shown.
--
-- Apply BY HAND:  psql $DATABASE_URL -f db/migrations/0011_behavioral_events.sql
-- There is no runner and no schema_migrations table (see 0007). If this file is skipped nothing
-- crashes, and nothing is lost silently either: apps/web/src/lib/behavioral-store.ts catches the
-- insert failure ("relation behavioral_events does not exist"), keeps the row in a per-instance
-- ring of 500, and both routes answer `durable:false` with the reason, which the inspector prints
-- beside every event. The symptom of a skipped migration is therefore a world that measures but
-- does not remember: /api/telemetry/recent returns only what this serverless instance has seen
-- since its last cold start, the second W re-anchor has no landing corpus to read, and the
-- account-erasure cascade (apps/web/src/app/api/account/delete/route.ts) finds no rows to wipe.
--
-- ONE table, two kinds. The two client paths, BehavioralEvent → /api/observe/behavioral and
-- TelemetryEvent → /api/telemetry, land side by side under a `kind` column rather than in two
-- tables, because everything that reads them wants them interleaved in time: the inspector's last
-- 25 events show an `enter_cave` between the locomotion windows walked to reach it, the re-anchor
-- reads one actor's whole session in order, and the erasure cascade wants one
-- `delete where actor_id = …`. The columns a TelemetryEvent does not have (channel, cue, polarity,
-- target, context, raw_signals) are null on its rows; the check at the bottom keeps a behavioral
-- row from ever being stored without the context that makes it readable (event-schema Rule 2).
--
-- Payloads are derived scalars only, never raw text (§4.4). context_json holds the eight mandatory
-- fields of packages/shared/src/telemetry.ts EventContext. session_mode is 'landing' | 'solo' |
-- 'room', stamped so the second W re-anchor can tell the rows apart (known-gaps ⚑10/⚑12/⚑20).
create table if not exists behavioral_events (
  id uuid primary key default gen_random_uuid(),
  -- 'behavioral' = a BehavioralEvent envelope; 'telemetry' = a TelemetryEvent (e.g. passive_locomotion).
  kind text not null check (kind in ('behavioral', 'telemetry')),
  -- The ONE bare user id (apps/web/src/lib/identity.ts); the erasure cascade keys on this.
  actor_id text not null,
  session_id text,
  -- The client's clock at the moment of the act (BehavioralEvent.t / TelemetryEvent.ts).
  t timestamptz not null,
  -- The coarse legacy TelemetryType, retained for routing (fork_decision, passive_locomotion, …).
  type text not null,
  channel text,
  cue text,
  -- The semantic label ingest.py routes on ("enter_cave"); for a telemetry row, its type.
  action text not null,
  polarity text check (polarity is null or polarity in ('take', 'refuse')),
  target_json jsonb,
  context_json jsonb,
  raw_signals_json jsonb,
  payload_json jsonb not null default '{}',
  session_mode text check (session_mode is null or session_mode in ('solo', 'room', 'landing')),
  provenance text check (provenance is null or provenance in ('live', 'legacy')),
  created_at timestamptz not null default now(),
  constraint behavioral_events_context_present check (kind <> 'behavioral' or context_json is not null)
);

-- The two reads: "everything this person did" (the erasure cascade, the re-anchor corpus) and
-- "the last n things this person did, newest first" (/api/telemetry/recent, the inspector).
create index if not exists behavioral_events_actor_idx on behavioral_events (actor_id, created_at desc);
create index if not exists behavioral_events_created_at_idx on behavioral_events (created_at desc);

-- The same rule as 0007: enable RLS + ZERO policies = the anon key, which ships in the browser
-- bundle, can do nothing at all. The routes write through the service role, which bypasses RLS.
-- Do not add a policy "to be safe"; a policy can only widen access.
alter table behavioral_events enable row level security;
