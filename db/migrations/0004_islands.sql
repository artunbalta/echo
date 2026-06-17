-- The endless archipelago (user's world vision). Each registered user owns one island, placed
-- on an infinite hex lattice of "slots" (cell_q, cell_r) → a deterministic world position +
-- procedural shape (seed). A new signup claims the empty cell NEAREST the most-recent signup, so
-- the world fills in organically around recent arrivals (social gravity seed, BUILD-PLAN §7.C).
-- Empty cells are simply absent rows. Covered by the user-deletion cascade (owner set null).
create table if not exists islands (
  id uuid primary key default gen_random_uuid(),
  cell_q int not null,
  cell_r int not null,
  owner_user_id uuid references users(id) on delete set null,
  seed int not null,
  name text,
  claimed_at timestamptz not null default now(),
  unique (cell_q, cell_r)
);

create index if not exists islands_claimed_at_idx on islands (claimed_at desc);
create index if not exists islands_owner_idx on islands (owner_user_id);
