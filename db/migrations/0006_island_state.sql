-- Island day-state — multi-session world memory (ECHO_PLAYABLE_BLUEPRINT.md P1 / VII.4;
-- closes known-gaps #5). One row per user: the homestead the world remembers between
-- sessions (crop, structure, vitality carry, scarcity, day count, tended-tie warmth).
-- Stored as one jsonb document (the shape lives in packages/shared/src/islandState.ts and
-- is validated there); wall-clock decay is applied ON LOAD by the app, never by the db.
-- Guarded/idempotent; hard-deleted by the §13 erasure cascade (user_id keyed).
create table if not exists island_state (
  user_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
