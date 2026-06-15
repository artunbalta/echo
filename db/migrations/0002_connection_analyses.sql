-- Connection analyses (§10/§11): the real, LLM-grounded read of each end-of-day
-- conversation the user had in the world, plus the human's final connect/skip verdict.
-- Stores the full transcript so it can serve as labeled training data for the reward
-- model (a grounded "why this stood out" + the human ground-truth decision).
create table if not exists connection_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_id uuid,
  counterpart_id text not null,
  counterpart_name text,
  turns int not null default 0,
  transcript_json jsonb,          -- full [{who,text}] exchange
  reason text,                    -- grounded, conversation-specific observation
  recommend boolean,              -- echo's suggestion (human still decides)
  depth text,                     -- brief | warming | real
  mocked boolean not null default false, -- true when the heuristic fallback produced it
  ts timestamptz not null default now()
);

create index if not exists connection_analyses_user_idx on connection_analyses (user_id, ts desc);
