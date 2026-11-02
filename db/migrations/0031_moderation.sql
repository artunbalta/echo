-- Moderation (C67): reports from strangers, strangers barred, and every moderator's action.
--
-- `moderation_reports`: a stranger's word that something is wrong in a cell (someone ruining the
-- village, something offensive on the land, anything else), with a short note, and a snapshot taken
-- when it was filed of who had left what there lately (`snapshot`, by subject, the reporter left
-- out). The reporter is their signed identity, or null for one who never let the echo watch.
-- Erased with the reporter.
--
-- `barred_subjects`: strangers barred from changing the shared world until a time, by whom, and why.
--
-- `moderation_actions`: everything a moderator did (undo, bar, lift, dismiss), to whom, and on which
-- report, kept so moderation is answerable. The subject is cleared when that stranger is erased.
--
-- RLS on with zero policies, per 0015–0030: only the server's moderation routes touch these.

create table if not exists moderation_reports (
  id bigserial primary key,
  reporter text,
  cell text not null,
  reason text not null check (reason in ('ruining', 'offensive', 'other')),
  note text check (note is null or char_length(note) <= 300),
  day int not null,
  made_at timestamptz not null default now(),
  snapshot jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  resolved_by text,
  outcome text
);

alter table moderation_reports enable row level security;

create index if not exists moderation_reports_open_idx on moderation_reports (id desc) where resolved_at is null;
create index if not exists moderation_reports_reporter_idx on moderation_reports (reporter) where reporter is not null;

create table if not exists barred_subjects (
  subject text primary key,
  until timestamptz not null,
  reason text not null,
  by_moderator text not null,
  at timestamptz not null default now()
);

alter table barred_subjects enable row level security;

create table if not exists moderation_actions (
  id bigserial primary key,
  moderator text not null,
  subject text,
  action text not null check (action in ('undo', 'bar', 'lift', 'dismiss')),
  report text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

alter table moderation_actions enable row level security;

-- Finding one stranger's traces, and a cell's recent ones, without a scan.
create index if not exists world_effects_subject_idx on world_effects (subject) where subject is not null;
create index if not exists village_deeds_subject_idx on village_deeds (subject);
