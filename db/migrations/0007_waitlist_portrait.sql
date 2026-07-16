-- Waitlist portrait jobs (landing §1b, photo path). Adds the generated-character flow onto the
-- waitlist rows created by 0006_waitlist.sql.
--
-- Apply via: psql $DATABASE_URL -f db/migrations/0007_waitlist_portrait.sql
-- Requires 0006_waitlist.sql to have been applied first.
--
-- THE ROW IS THE QUEUE. There is no Redis, no external job runner, and adding one for this would be
-- a whole dependency for at most a few hundred jobs. Generation takes ~60s, far past a serverless
-- response, so the work is claimed by a cron sweeper (apps/web/src/app/api/cron/waitlist-sweep) and
-- driven by a FAL webhook. The state machine lives here so a dropped webhook, a crashed function or
-- a redeploy mid-generation cannot lose a job:
--
--   pending  -> a seat exists, nothing submitted yet (or a retry is due)
--   claimed  -> submitted to FAL; portrait_lease_until holds the lease
--   done     -> portrait stored and the email sent
--   failed   -> gave up after portrait_attempts >= the route's MAX_ATTEMPTS; the email still goes
--               out, without a portrait, saying so plainly
--   none     -> the premade path. No generation was ever asked for.
--
-- THE SEAT IS NEVER AT RISK. waitlist_join() takes it atomically before any of this, and nothing
-- here can release it. A failed generation costs a portrait, never a place.
alter table waitlist add column if not exists portrait_status text not null default 'none'
  check (portrait_status in ('none', 'pending', 'claimed', 'done', 'failed'));

-- Attempt counter, so a job that keeps dying stops rather than burning the image budget forever.
alter table waitlist add column if not exists portrait_attempts int not null default 0;

-- Lease. A claimed job whose lease has expired is presumed dead and returns to pending, which is
-- what makes a crash mid-generation recoverable rather than a permanent 'claimed' tombstone.
alter table waitlist add column if not exists portrait_lease_until timestamptz;

-- FAL's request id, so a webhook can be matched back to a row and a duplicate delivery is a no-op.
alter table waitlist add column if not exists fal_request_id text;

-- Where the selfie sits on FAL's storage while the job runs. NOT our bucket, and never a URL we
-- host or serve. It exists for one reason: it is the only thing that cannot be recreated. Upload it
-- synchronously, record it here, and a submit that fails can be RETRIED by the sweeper. Without it,
-- a transient FAL blip at submit time would permanently deny someone a portrait, because the selfie
-- only ever lives in that one request's memory. Cleared by selfie_deleted_at.
alter table waitlist add column if not exists selfie_fal_url text;

-- The finished portrait, base64 PNG, inline.
--
-- Inline and not in Storage on purpose: the pipeline emits 72x108 on a 22-colour palette, which is
-- ~2KB — smaller than the URL bookkeeping around it. It also means the photo path has NO dependency
-- on the `characters` bucket at all: the selfie goes to fal.storage (not ours) and the result lands
-- here. One less thing to configure, one less public URL holding anything about a person.
alter table waitlist add column if not exists portrait_png_b64 text;

-- Why a job failed. Shown to nobody; kept so a run of failures is diagnosable.
alter table waitlist add column if not exists portrait_error text;

-- Consent is recorded, not assumed: the exact moment they ticked the box at the point of upload.
-- Null for the premade path, which never sees a selfie.
alter table waitlist add column if not exists selfie_consent_at timestamptz;

-- Set once the source selfie has been dropped from fal.storage. The selfie is never stored by us;
-- this records that the copy we handed to the generator is gone too.
alter table waitlist add column if not exists selfie_deleted_at timestamptz;

-- Sent-at, so a retry of the sweeper cannot email the same person twice.
alter table waitlist add column if not exists email_sent_at timestamptz;

-- The sweeper's only query: find work. Partial, because 'done' and 'none' rows are the vast
-- majority and should never be scanned.
create index if not exists waitlist_portrait_work_idx
  on waitlist (portrait_status, portrait_lease_until)
  where portrait_status in ('pending', 'claimed');

-- Match a webhook back to its row in one hop.
create unique index if not exists waitlist_fal_request_uidx
  on waitlist (fal_request_id) where fal_request_id is not null;

-- ── claim: hand exactly one due job to one worker, atomically ──────────────────────────────────
--
-- `for update skip locked` is the whole point: two sweeper invocations overlapping (a slow run, a
-- manual trigger, a redeploy) must not both claim the same row and pay for the same image twice.
-- SKIP LOCKED makes the second one take the next row instead of blocking on the first.
--
-- Claims a 'pending' row, OR a 'claimed' row whose lease has expired — which is exactly the
-- "webhook never arrived / function died mid-generation" case.
create or replace function waitlist_claim_portrait(p_lease_seconds int, p_max_attempts int)
returns table (id uuid, email text, name text, character_ref text, seat int, attempts int)
language plpgsql
as $$
begin
  return query
  with due as (
    select w.id
      from waitlist w
     where (w.portrait_status = 'pending'
            or (w.portrait_status = 'claimed' and w.portrait_lease_until < now()))
       and w.portrait_attempts < p_max_attempts
     order by w.created_at
     for update skip locked
     limit 1
  )
  update waitlist w
     set portrait_status = 'claimed',
         portrait_attempts = w.portrait_attempts + 1,
         portrait_lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
    from due
   where w.id = due.id
  returning w.id, w.email, w.name, w.character_ref, w.seat, w.portrait_attempts;
end;
$$;

revoke all on function waitlist_claim_portrait(int, int) from public, anon, authenticated;

-- Rows that have exhausted their attempts: the sweeper flips these to 'failed' and sends the
-- no-portrait email. Separate from the claim so a permanently-failing job stops costing money but
-- still gets its person an honest message.
create or replace function waitlist_exhausted(p_max_attempts int)
returns table (id uuid, email text, name text, seat int)
language sql
stable
as $$
  select w.id, w.email, w.name, w.seat
    from waitlist w
   where w.portrait_status in ('pending', 'claimed')
     and w.portrait_attempts >= p_max_attempts
     and w.email_sent_at is null
     and (w.portrait_lease_until is null or w.portrait_lease_until < now())
   order by w.created_at
   limit 5;
$$;

revoke all on function waitlist_exhausted(int) from public, anon, authenticated;
