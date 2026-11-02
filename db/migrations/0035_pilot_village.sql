-- The pilot village (C75): a group of friends, each come twice, meet six classic paradigms in the
-- world, and say how they see each other (`apps/web/src/lib/pilot.ts`, `packages/planet/lib/pilot.ts`).
--
-- `pilot_people` is PERSONAL DATA, one row per person in the pilot:
--   - the nickname their friends know them by;
--   - their yes to the research (`consent_at`);
--   - where they place themselves on the eight axes;
--   - what they said they would do in each of the six, before they met any of them;
--   - their visits;
--   - what became of a raft they lent or a seed they planted.
-- `pilot_ratings` is one friend's view of another: how well they know them, and the eight axes.
-- Both are kept for the study (`lib/retention.ts` does not sweep them) and erased with the person (§13),
-- ratings either way.
--
-- `player_stagings` gains the pilot's six situations (`packages/planet/lib/director.ts`).
--
-- RLS on with zero policies, per 0015–0034.

create table if not exists pilot_people (
  subject text primary key,
  nickname text not null check (char_length(nickname) between 1 and 24),
  joined_at timestamptz not null default now(),
  consent_at timestamptz not null,
  self_axes jsonb not null,
  stated jsonb not null,
  sessions jsonb not null default '[]'::jsonb,
  settled jsonb not null default '{}'::jsonb
);

alter table pilot_people enable row level security;

-- One nickname per group, whatever its case: a friend rates another by the name they know.
create unique index if not exists pilot_people_nickname_idx on pilot_people (lower(nickname));

create table if not exists pilot_ratings (
  rater text not null,
  ratee text not null,
  know smallint not null check (know between 0 and 3),
  axes jsonb,
  created_at timestamptz not null default now(),
  primary key (rater, ratee),
  check (rater <> ratee)
);

alter table pilot_ratings enable row level security;

create index if not exists pilot_ratings_ratee_idx on pilot_ratings (ratee);

-- The pilot's six, beside the director's four.
alter table player_stagings drop constraint if exists player_stagings_situation_check;
alter table player_stagings add constraint player_stagings_situation_check check (situation in (
  'netted_gull', 'lost_pouch', 'carved_mark', 'dark_cleft',
  'hungry_stranger', 'raft_borrower', 'tide_fisher', 'seed_offer', 'overgrown_path', 'lone_traveler'
));
