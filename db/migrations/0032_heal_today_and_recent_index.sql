-- Two defects in 0020 and 0023, found when 0018–0031 first ran on a real Postgres (2026-10-21, C70).
-- Every test had passed, because the tests use the in-process store, which enforces no constraint
-- and has no indexes. Forward-only, as db/migrations/README.md requires: 0020 and 0023 are applied,
-- and they are not edited.
--
-- 1. A MARK MADE TODAY COULD NOT BE HEALED TODAY. 0020 wrote `check (until_day > day)` on
--    `world_effects`: every mark lasts at least a day. A moderator's undo (C67) heals a mark by
--    setting `until_day` to today, and for a mark made today that is `until_day = day`, which the
--    check refused. The griefer's newest marks, the ones an undo is most often for, stayed for their
--    whole term, and the undo said they were not healed. Measured on Postgres 16:
--
--        new row for relation "world_effects" violates check constraint "world_effects_check"
--
--    Every read already shows a mark only while `until_day > day` (`effectsFor`, `activeEffects`), so
--    a mark healed on the day it was made is simply not shown that day, as a mark from yesterday
--    healed today is not. The check becomes `until_day >= day`. Marks are still written with at least
--    a day to run: the act route records an effect only when its `lastsDays` is above zero.
--    Postgres named 0020's unnamed table check `world_effects_check` (measured); it is replaced by
--    name, as 0022, 0023 and 0030 replaced `village_changes_kind_check`.
--
-- 2. THE NEWEST-FIRST INDEX 0023 ASKED FOR WAS NEVER BUILT. 0023 wrote
--    `create index if not exists villager_memories_subject_idx on villager_memories (subject, updated_at desc)`,
--    but 0019 had already made an index of that NAME on `(subject)`, and `if not exists` looks at the
--    name and nothing else: Postgres skipped it with a notice. `metBy` (everyone a stranger has talked
--    to, newest first) has sorted instead of reading in order ever since. It is built here under a
--    name of its own. 0019's stays: this folder drops nothing, and it is small.
--
-- Re-runnable: the constraint is dropped by name and added again, and the index is `if not exists`
-- under a name nothing else uses.

alter table world_effects drop constraint if exists world_effects_check;
alter table world_effects add constraint world_effects_check check (until_day >= day);

create index if not exists villager_memories_subject_recent_idx on villager_memories (subject, updated_at desc);
