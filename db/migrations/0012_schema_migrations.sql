-- The migration ledger. Until this file, db/migrations was applied BY HAND and NOTHING recorded
-- what any database had — commit 2db6375 states it, and used it as a licence to rename two files:
-- "no runner, no schema_migrations table, nothing recorded the old name". This table is what makes
-- "which migrations does production have?" a query instead of an archaeology problem
-- (SOCIETY-PLAN SOC-2.C).
--
-- Written ONLY by scripts/migrate.mjs. Never edit it by hand: a hand-edited ledger is worse than no
-- ledger, because it is believed.
--
-- NUMBERED 0012, NOT 0010. The 0010 gap is real and permanent (db/migrations/README.md), and 0011 is
-- referenced by name from five source files, so neither number is free to take.
create table if not exists schema_migrations (
  version      text primary key,           -- '0001'. The four-digit prefix, not the filename.
  name         text        not null,       -- 'init'. The rest of the filename, for readability only.
  checksum     text        not null,       -- sha256 of the file BYTES at apply time.
  applied_at   timestamptz not null default now(),
  applied_by   text        not null default current_user,
  execution_ms integer,                    -- null, or 0, for a baselined row.
  baselined    boolean     not null default false
);

comment on table schema_migrations is
  'One row per applied file in db/migrations. Written only by scripts/migrate.mjs. checksum is sha256 of the file bytes at apply time; a mismatch means an applied file was edited afterwards, which this repo forbids. baselined = recorded without being run, for a database migrated by hand before this table existed.';

-- WHY version IS THE PRIMARY KEY: a second attempt to record 0009 fails loudly instead of appending
-- a duplicate. The database enforces at write time what the folder could not enforce at write time,
-- which is exactly the gap that produced two collisions in this repo's history.
--
-- WHY baselined EXISTS: it distinguishes "we ran this" from "we found this already here". Without
-- it, an adopted database's history is a lie, and a lie in a ledger is the only thing worse than a
-- missing one.

-- The same rule as 0007 and 0011: RLS on with ZERO policies, so the anon key — which ships in the
-- browser bundle — can do nothing at all. A deployment history is not secret, but it is a free map
-- of the schema and there is no reason to publish it.
alter table schema_migrations enable row level security;
