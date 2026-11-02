-- What a stranger carries (C47), and which thing a gift was.
--
-- `player_items` is PERSONAL DATA: one row per stranger, their pack as a small JSON object of item id
-- → count (`packages/planet/lib/items.ts`, eight things at most). It is checked by the server on every
-- gift, so a gift is of something actually carried, and it is erased with the stranger (§13).
--
-- `village_deeds.item` names what a gift was ("a shell necklace"), so the villager who received it can
-- say so. Additive; null for every deed that is not a gift.
--
-- RLS on with zero policies, per 0015–0020.

create table if not exists player_items (
  subject text primary key,
  pack jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table player_items enable row level security;

alter table village_deeds add column if not exists item text;
