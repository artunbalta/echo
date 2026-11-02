-- Meeting a death on its way (C66): two more kinds of life change, and who tended.
--
-- `tend`: a stranger fetched the healer, or left herbs, for someone lying ill (`by`: 'healer' or
-- 'herbs'). `ashore`: a stranger kept a fisher ashore on the day they meant to go out under a wrong sky.
-- `packages/planet/lib/mortality.ts` weighs them; each changes a life only from its own day.
--
-- The kind check is replaced, not edited in place, as 0022 and 0023 did.

alter table village_changes drop constraint if exists village_changes_kind_check;
alter table village_changes add constraint village_changes_kind_check
  check (kind in ('leave', 'stay', 'trade', 'goal', 'drop', 'met', 'arrive', 'court', 'pair', 'tend', 'ashore'));

alter table village_changes add column if not exists by text check (by is null or by in ('healer', 'herbs'));
