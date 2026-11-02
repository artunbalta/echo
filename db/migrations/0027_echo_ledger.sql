-- The mirror's record: what each update did to a person's echo (C61).
--
-- `echo_ledger` is PERSONAL DATA: one row per act, choice or implicit signal the echo was moved by,
-- and one per batch of walking windows. Each row holds what it was (the action label, the cue, take or
-- refuse, the context it was folded into), what it was read as (the features the engine used), and
-- its own move: `delta`, the posterior mean after minus before on each of the eight axes, from the
-- version `v0` to `v1`. The engine reports that move (services/ml, the C61 fields); nothing here is
-- computed from a guess.
--
-- The mirror adds the moves up. What they do not account for, of where the echo puts the person
-- now, is shown as "not in this record" rather than left out: rows that aged off the clock below,
-- updates from before the record began, and updates no route recorded.
--
-- It is a record of what someone did, with a time: RAW, swept after 90 days (`lib/retention.ts`),
-- and erased with the person (§13).
--
-- RLS on with zero policies, per 0015–0026.

create table if not exists echo_ledger (
  id bigserial primary key,
  subject text not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('act', 'choice', 'sense', 'walk')),
  action text not null,
  cue text,
  polarity text check (polarity in ('take', 'refuse')),
  cond_key text,
  read_as jsonb,
  delta double precision[] not null check (array_length(delta, 1) = 8),
  v0 int not null,
  v1 int not null,
  windows int not null default 1
);

alter table echo_ledger enable row level security;

create index if not exists echo_ledger_subject_id_idx on echo_ledger (subject, id desc);
create index if not exists echo_ledger_at_idx on echo_ledger (at);

-- Walking sends a window about every 1.5 s. Rather than a row each, a batch of windows is folded into
-- the person's last row when that row is a walk, under ten minutes old, and ends exactly where this
-- batch begins (`v1 = p_v0`: nothing else moved the echo in between). Otherwise it starts a new row.
-- Folding is adding: the deltas add axis by axis, the versions join, the windows count up. Atomic,
-- so two batches arriving together cannot both fold into the same row and lose one.
create or replace function echo_ledger_walk(
  p_subject text,
  p_delta double precision[],
  p_v0 int,
  p_v1 int,
  p_windows int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last echo_ledger;
begin
  select * into last from echo_ledger where subject = p_subject order by id desc limit 1 for update;
  if found and last.kind = 'walk' and last.v1 = p_v0 and last.at > now() - interval '10 minutes' then
    update echo_ledger
       set delta = (select array_agg(a + b order by i) from unnest(last.delta, p_delta) with ordinality as t(a, b, i)),
           v1 = p_v1,
           windows = last.windows + p_windows,
           at = now()
     where id = last.id;
  else
    insert into echo_ledger (subject, kind, action, delta, v0, v1, windows)
    values (p_subject, 'walk', 'passive_locomotion', p_delta, p_v0, p_v1, p_windows);
  end if;
end;
$$;

revoke all on function echo_ledger_walk(text, double precision[], int, int, int) from public, anon, authenticated;
