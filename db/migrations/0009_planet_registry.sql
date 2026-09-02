-- The planet and the parcel registry.
--
-- The surface of one generated sphere, divided into H3 cells, each with exactly one owner and no
-- second owner ever. Three tables carry it: what the planet IS and can never stop being
-- (world_manifest), what has been sold (parcels), and what is left (unclaimed_cells). A fourth,
-- rounds, exists only so that the moment the registry subdivides can happen exactly once.
--
-- Four things here are not in the design document's section 8, and each is the result of running
-- the capacity simulation rather than of taste.
--
--   world_manifest.peak_elevation  The biome table takes height on a 0 to 1 scale so it describes
--                                  landscape rather than a set of constants tied to one set of
--                                  noise frequencies. That scale needs a top as well as a bottom.
--
--   world_manifest.reserved        The twelve commons are fixed by geometry, but a pentagon that
--                                  falls in open ocean is relocated onto the best land near it, and
--                                  that choice depends on the terrain. `commons` is what is public;
--                                  `reserved` is `commons` plus every pentagon a commons moved off,
--                                  because a pentagon must never be assignable and has six children
--                                  rather than seven, which would corrupt the inventory arithmetic.
--
--   unclaimed_cells.terminal       A cell with no land is never sold and must never subdivide. The
--                                  document's rule subdivides every unassigned cell, which fills
--                                  this table with 140 million rows of ocean nobody can buy.
--
--   rounds.assignable_remaining    The document's trigger watches "unassigned parcels", which
--                                  includes cells that can never be assigned. On the shipped
--                                  terrain that stalls the planet in round 2 at 787 owners. The
--                                  trigger watches the ASSIGNABLE pool instead, held as a counter
--                                  on one row so the subdivision can fire exactly once under
--                                  concurrent claims. See the version column.

-- ── the planet ────────────────────────────────────────────────────────────────
-- Written once, at creation, and then a fixed fact. Nothing in here may ever be updated: owners
-- are standing on the terrain these values produce. A change is a new planet and a new row.
create table if not exists world_manifest (
  id                   text primary key,
  seed                 text not null,
  terrain_version      int  not null,
  radius_km            double precision not null,
  start_resolution     int  not null,
  floor_resolution     int  not null,
  trigger_fraction     double precision not null,
  land_fraction_target double precision not null,
  min_land_fraction    double precision not null,
  commons_resolution   int  not null,
  sea_level            double precision not null,
  peak_elevation       double precision not null,
  commons              text[] not null,
  reserved             text[] not null,
  created_at           timestamptz not null default now(),
  constraint world_manifest_span check (floor_resolution >= start_resolution),
  constraint world_manifest_commons_coarser check (commons_resolution <= start_resolution),
  constraint world_manifest_twelve_commons check (array_length(commons, 1) = 12)
);

-- ── what has been sold ────────────────────────────────────────────────────────
create table if not exists parcels (
  h3_index      text primary key,
  resolution    int  not null,
  owner_id      text not null,
  round_assigned int not null,
  assigned_at   timestamptz not null default now(),
  land_fraction real not null,
  area_km2      real not null,
  display_name  text
);
create index if not exists parcels_owner_idx on parcels (owner_id);
create index if not exists parcels_assigned_at_idx on parcels (assigned_at desc);

-- ── what is left ──────────────────────────────────────────────────────────────
-- assignable: holds at least min_land_fraction land, so somebody may be given it.
-- terminal:   holds no land at all, so it will never be sold and must never subdivide.
-- A cell can be neither: it holds some land but not enough. Those are not sold and DO subdivide,
-- which is how a coastline that is too fine to see at one resolution becomes claimable at the next.
create table if not exists unclaimed_cells (
  h3_index      text primary key,
  resolution    int  not null,
  assignable    boolean not null,
  terminal      boolean not null default false,
  land_fraction real not null,
  constraint unclaimed_terminal_has_no_land check (not terminal or land_fraction = 0),
  constraint unclaimed_assignable_not_terminal check (not (assignable and terminal))
);
-- The claim path only ever looks at assignable rows, so the index carries only those.
create index if not exists unclaimed_assignable_idx on unclaimed_cells (h3_index) where assignable;
-- The subdivision path walks everything that is not terminal.
create index if not exists unclaimed_subdividable_idx on unclaimed_cells (resolution) where not terminal;

-- ── the rounds ────────────────────────────────────────────────────────────────
-- One open round at a time. assignable_remaining is decremented by each claim in the same
-- transaction that inserts the parcel, and the claim whose decrement crosses trigger_at is the one
-- that performs the subdivision. version exists so that a read-modify-write cannot let two claims
-- both believe they crossed: the decrement and the read are a single statement.
create table if not exists rounds (
  n                    int primary key,
  resolution           int not null,
  inventory_at_start   int not null,
  trigger_at           int not null,
  assignable_remaining int not null,
  version              bigint not null default 0,
  opened_at            timestamptz not null default now(),
  closed_at            timestamptz,
  constraint rounds_remaining_not_negative check (assignable_remaining >= 0)
);
-- At most one round open at any time. This is the constraint that makes the trigger exactly once.
create unique index if not exists rounds_one_open_idx on rounds ((closed_at is null)) where closed_at is null;

-- ── the people with no land ───────────────────────────────────────────────────
-- Reached only when the floor round has sold every assignable cell. Not a queue: there is no
-- further supply unless floor_resolution moves, so the UI must say so plainly.
create table if not exists landless_waitlist (
  user_id   text primary key,
  joined_at timestamptz not null default now()
);

-- ── referrals ─────────────────────────────────────────────────────────────────
create table if not exists referrals (
  referrer_user_id text not null,
  referred_user_id text primary key,
  placed_adjacent  boolean not null,
  created_at       timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on referrals (referrer_user_id);
