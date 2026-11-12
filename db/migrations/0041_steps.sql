-- How far people come (C92): for each day, how many page loads reached each step of the way in: the
-- landing, walking in, arriving, saying yes or no to being watched, a first moment met, the envelopes
-- opened, words given, a friend's link made, a friend's page opened and finished, the evidence read, an
-- audit run.
--
-- `step_days` holds NUMBERS ONLY: a day, a step's name, a count. No id, no address, no agent string: a
-- request adds one to a number and leaves nothing of itself. So it is not personal data, needs no
-- erasure path, and says nothing of anyone. It is written by `POST /api/steps` through `step_hit` and
-- read by its owner (`GET /api/steps`, behind the pilot's admin token).
--
-- RLS on with zero policies, per 0015–0040.

create table if not exists step_days (
  day date not null,
  step text not null check (char_length(step) between 1 and 32),
  n integer not null default 0 check (n >= 0),
  primary key (day, step)
);

alter table step_days enable row level security;

create or replace function step_hit(p_step text)
returns void
language sql
as $$
  insert into step_days (day, step, n)
  values ((now() at time zone 'utc')::date, p_step, 1)
  on conflict (day, step) do update set n = step_days.n + 1;
$$;

revoke all on function step_hit(text) from public, anon, authenticated;
