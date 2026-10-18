-- Between villages (C53): a move written into both villages' changes, and a marriage a stranger
-- brought about.
--
-- Additive. `village_changes` gains three kinds:
--   `arrive`  someone came from another village (or came home), carrying who they are;
--   `court`   word sent by a stranger, that they would marry someone the stranger had met;
--   `pair`    the wedding that came of two such words.
-- It also gains three columns:
--   `to_cell`    the village a `leave` went to, or the one a `court` was sent to;
--   `from_cell`  the village an `arrive` came from;
--   `spec`       the person who came: their name, dates, trade and temperament, as their own village
--                drew them. Never free text; everything in it is another village's seed.
-- The kind check was replaced in 0022 and is replaced again here.

alter table village_changes drop constraint if exists village_changes_kind_check;
alter table village_changes add constraint village_changes_kind_check
  check (kind in ('leave', 'stay', 'trade', 'goal', 'drop', 'met', 'arrive', 'court', 'pair'));

alter table village_changes add column if not exists to_cell text;
alter table village_changes add column if not exists from_cell text;
alter table village_changes add column if not exists spec jsonb;

-- "Everyone this stranger has talked to", newest first (`metBy`).
create index if not exists villager_memories_subject_idx on villager_memories (subject, updated_at desc);
