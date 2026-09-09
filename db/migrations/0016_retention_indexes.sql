-- Indexes for the retention sweep (SOCIETY-PLAN SOC-2.G, DECISIONS C35).
--
-- C35 sets a 90-day window on the RAW behavioural log and keeps the DERIVED profile while the
-- account lives. There is no TTL in Postgres — 0007 already wrote that sentence — so retention is a
-- daily sweep, and a sweep is a `delete … where <ts> < cutoff` on five tables.
--
-- WITHOUT THESE IT IS FIVE SEQUENTIAL SCANS, every day, on the tables that grow fastest, and the
-- first one to hurt is `behavioral_events`: it takes a row per measurement event and the whole
-- design of SOC-2.F is that more classes of event will arrive. 0007 made the same observation about
-- its own sweep — "Lets old windows be swept without a table scan" — and this is that, for the
-- tables C35 put on a clock.
--
-- Only the RAW tables get one. The derived profile is not swept, so an index for a query nobody
-- runs would be pure write cost on the hottest tables in the schema.
--
-- FORWARD ONLY and re-runnable (db/migrations/README.md).

create index if not exists behavioral_events_created_idx on behavioral_events (created_at);
create index if not exists telemetry_events_ts_idx       on telemetry_events (ts);
create index if not exists interactions_started_idx      on interactions (started_at);
create index if not exists messages_ts_idx               on messages (ts);
create index if not exists narrations_ts_idx             on narrations (ts);
