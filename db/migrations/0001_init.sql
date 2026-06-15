-- ECHO initial schema (§5). Run against a Supabase Postgres with pgvector.
-- Apply via: supabase db reset / psql $DATABASE_URL -f db/migrations/0001_init.sql

create extension if not exists "pgcrypto";
create extension if not exists vector;

-- Embedding dimension (keep in sync with EMBEDDINGS_DIM / PERSONA latent decode).
-- We use 256-d context/action embeddings and an 8-d persona latent.

-- ── identity & consent ──────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_ref uuid unique,                       -- supabase auth.users id
  created_at timestamptz not null default now(),
  locale text default 'en',
  consent_world boolean not null default false,
  consent_telemetry boolean not null default false,
  consent_voice boolean not null default false,
  consent_biometric boolean not null default false
);

create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  sprite_sheet_url text,
  attribute_json jsonb not null default '{}',
  source text not null check (source in ('selfie','premade')),
  created_at timestamptz not null default now()
);

-- ── world ───────────────────────────────────────────────────────────────────
create table if not exists worlds (
  id text primary key,
  name text not null,
  tilemap_ref text,
  capacity int not null default 150,
  status text not null default 'active'
);

create table if not exists npcs (
  id text primary key,
  name text not null,
  persona_axes_json jsonb not null,
  system_prompt text not null,
  sprite_sheet_url text,
  home_x real not null,
  home_y real not null,
  behavior_params jsonb not null default '{}',
  venue text
);

create table if not exists world_entities (
  id uuid primary key default gen_random_uuid(),
  world_id text references worlds(id) on delete cascade,
  kind text not null check (kind in ('user','npc')),
  ref_id text not null,
  x real not null default 0,
  y real not null default 0,
  facing text not null default 'down',
  last_seen timestamptz not null default now()
);

-- ── interactions & messages ─────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  world_id text references worlds(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  world_id text references worlds(id),
  actor_id text not null,
  target_id text not null,
  kind text not null check (kind in ('message','approach','leave','gesture')),
  content jsonb,
  context_json jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid references interactions(id) on delete cascade,
  sender text not null,
  text text,
  audio_url text,
  latency_ms int,
  edits_count int default 0,
  ts timestamptz not null default now()
);

-- ── telemetry (implicit signals, §9.1) ──────────────────────────────────────
create table if not exists telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id text,
  type text not null,
  payload_json jsonb not null default '{}',
  ts timestamptz not null default now()
);
create index if not exists telemetry_user_ts on telemetry_events(user_id, ts desc);

-- ── learning engine state (§9) ──────────────────────────────────────────────
create table if not exists persona_state (
  user_id text primary key,
  z_mean vector(8),
  z_cov_json jsonb,            -- diagonal covariance as array
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists behavior_index (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  context_embedding vector(256),
  action_text text,
  outcome text,
  ts timestamptz not null default now()
);
create index if not exists behavior_user on behavior_index(user_id);
-- ANN index for retrieval (cosine). Build after data exists for best results.
create index if not exists behavior_vec on behavior_index using ivfflat (context_embedding vector_cosine_ops) with (lists = 100);

create table if not exists preference_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  context_json jsonb,
  chosen_json jsonb,
  rejected_json jsonb,
  source text,
  ts timestamptz not null default now()
);

create table if not exists reward_model_state (
  user_id text primary key,
  params_json jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists autonomy_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  context_bucket text not null,
  level text not null default 'copilot' check (level in ('copilot','supervised','auto')),
  agreement_ewma real not null default 0,
  volume int not null default 0,
  ece real not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, context_bucket)
);

create table if not exists meeting_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  counterpart_id text not null,
  requested_at timestamptz not null default now(),
  occurred boolean,
  rating int,
  notes text
);

create table if not exists narrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  interaction_id uuid,
  text text not null,
  audio_url text,
  observations_json jsonb,
  ts timestamptz not null default now()
);

-- Seed the default world.
insert into worlds (id, name, tilemap_ref, capacity, status)
values ('echo-world-1', 'The Country That Does Not Exist', 'procedural:seed=7', 150, 'active')
on conflict (id) do nothing;
