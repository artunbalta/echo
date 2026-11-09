-- Groups (C85): the owner's own named groups in the study, each with its own link, and a yes from the
-- owner before anyone who asks to join can play (`apps/web/src/lib/pilotCircles.ts`).
--
-- A group is a row of `pilot_circles` the owner made (`owner`), with a `name` its friends know it by and
-- `approval` on. Unlike a circle anyone starts (C83), it keeps its `code` as well as the code's hash, so
-- the owner's page can show the link again whenever it is wanted. A leaked code lets nobody in: it only
-- lets someone ask, and the owner says yes or no.
--
-- `pilot_people.waiting_since` is when someone asked to join a group that needs the owner's yes, and null
-- for everyone who is in. Nobody already in the pilot is waiting, so the default leaves them where they
-- are, and running this file again changes nothing.
--
-- Safe before the code that reads it, and the code is safe before it: with ECHO_GROUPS and ECHO_CIRCLES
-- unset the app reads and writes none of these columns. Either switch needs 0037 and this file.
--
-- RLS on with zero policies, per 0015–0037.

alter table pilot_circles add column if not exists name text check (name is null or char_length(name) between 1 and 40);
alter table pilot_circles add column if not exists code text check (code is null or code ~ '^[a-z0-9]{4}-[a-z0-9]{4}$');
alter table pilot_circles add column if not exists owner boolean not null default false;
alter table pilot_circles add column if not exists approval boolean not null default false;

create index if not exists pilot_circles_owner_idx on pilot_circles (owner) where owner;

alter table pilot_people add column if not exists waiting_since timestamptz;

create index if not exists pilot_people_waiting_idx on pilot_people (circle) where waiting_since is not null;
