-- The bounded archipelago (ECHO_level_design_7flows.md §1–2). The 7-flow arc places every user
-- on ONE shared ocean of 100 pre-generated island slots, each at stable coordinates with a
-- deterministic terrain seed (packages/shared/src/archipelago.ts). A new sign-in claims the EMPTY
-- slot nearest the most-recently-joined island, so the world grows in a tight cluster around the
-- latest arrival (the cold-start fix). This supersedes the endless hex-lattice (cell_q/cell_r),
-- which is kept nullable for back-compat with 0004 rows until the old /island route is folded in.
alter table islands add column if not exists slot_index int;
alter table islands alter column cell_q drop not null;
alter table islands alter column cell_r drop not null;

-- One owner per slot; a returning user keeps their slot (assignment is persistent).
create unique index if not exists islands_slot_index_uidx on islands (slot_index) where slot_index is not null;
create index if not exists islands_owner_slot_idx on islands (owner_user_id);
