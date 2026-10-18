-- A need met (C50): one more kind of village change, and a deed that remembers whose need it met.
--
-- Additive. `village_changes.kind` gains `met`, whose `goal_id` is the need's id and whose `goal`,
-- `target` and `occupation` name the goal it was for, if any. The kind check was written inline in
-- 0019 and Postgres named it `village_changes_kind_check`; it is replaced, not edited in place.
-- `village_deeds.met` is the people whose need the act met, by `Person.id`; null for every deed before.

alter table village_changes drop constraint if exists village_changes_kind_check;
alter table village_changes add constraint village_changes_kind_check
  check (kind in ('leave', 'stay', 'trade', 'goal', 'drop', 'met'));

alter table village_deeds add column if not exists met text[];
