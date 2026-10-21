-- Five minutes to you (C72): a visit made for showing the world to someone, start to finish.
--
-- `demo_visits` is PERSONAL DATA: one row per visitor, kept only where the demo is switched on
-- (`ECHO_DEMO`). When the visit began, whose echo theirs meets (the host, by `ECHO_DEMO_HOST`), and the
-- visitor's own voice: cloned at ElevenLabs from three sentences they read aloud, ONLY if they said
-- yes to that, and deleted there within a day (`voice_until`), or at once when they erase. The row
-- records when the voice was deleted, so a sweep never asks twice and nobody has to take its word.
--
-- Erased with the visitor (§13), and the voice with it. RAW, swept after 90 days with the rest.
--
-- RLS on with zero policies, per 0015–0033: only the server's demo routes touch it.

create table if not exists demo_visits (
  subject text primary key,
  host text not null,
  name text not null check (char_length(name) between 1 and 40),
  started_at timestamptz not null default now(),
  voice_id text,
  voice_until timestamptz,
  voice_deleted_at timestamptz
);

alter table demo_visits enable row level security;

-- The voices a sweep must delete: cloned, not yet deleted, past their day.
create index if not exists demo_visits_voice_due_idx on demo_visits (voice_until) where voice_id is not null and voice_deleted_at is null;
create index if not exists demo_visits_started_idx on demo_visits (started_at);
