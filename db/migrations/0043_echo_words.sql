-- An echo learning how its person talks (C108): their yes, their own lines, and the guesses it sealed.
--
-- `echo_words` is one person's yes to keeping what they say, so that their echo can learn to talk as they
-- do. It is a yes of its own, apart from `echo_stand_in` (0042): no row, nothing they say is kept. Saying no
-- deletes the row and every `echo_lines` and `echo_talk_looks` row of theirs.
--
-- `echo_lines` is PERSONAL DATA: lines the person typed, to a villager, to someone in a village room, or
-- aloud in one, while their yes stood. `heard` is what a villager had just said to them; it is never kept
-- for a line said to another person, whose words are theirs and not this person's to give. Lines have an id of
-- their own: two said in the same millisecond are two lines.
--
-- `echo_talk_looks` is PERSONAL DATA: before the person answered a villager, their echo guessed the answer
-- and sealed it (`seal` is the hash of what it sealed); once they had answered, a model said whether the
-- two meant the same and sounded the same. `p` is how sure the echo said it was. These are the talk looks
-- the echo earns the right to talk from (C103's "talk" kind, 30 looks and 0.85).
--
-- RLS on with zero policies, per 0015–0023. All three erased with the person (§13).

create table if not exists echo_words (
  subject text primary key,
  since timestamptz not null default now()
);

alter table echo_words enable row level security;

create table if not exists echo_lines (
  id bigint generated always as identity primary key,
  subject text not null,
  at timestamptz not null,
  cell text not null,
  room text,
  to_kind text not null check (to_kind in ('villager', 'person', 'aloud')),
  heard text check (heard is null or char_length(heard) <= 700),
  said text not null check (char_length(said) between 1 and 400)
);

alter table echo_lines enable row level security;

-- Newest first, one person's: what the guesser and the speaker are shown.
create index if not exists echo_lines_subject_idx on echo_lines (subject, at desc);

create table if not exists echo_talk_looks (
  subject text not null,
  seal text not null,
  cell text not null,
  heard text not null check (char_length(heard) <= 700),
  guess text not null check (char_length(guess) <= 400),
  p real not null check (p >= 0 and p <= 1),
  said text not null check (char_length(said) between 1 and 400),
  hit boolean not null,
  why text check (why is null or char_length(why) <= 200),
  sealed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (subject, seal)
);

alter table echo_talk_looks enable row level security;

create index if not exists echo_talk_looks_subject_idx on echo_talk_looks (subject, sealed_at);
