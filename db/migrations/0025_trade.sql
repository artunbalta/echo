-- What a villager gave a stranger in a trade, or in return for their help (C58).
--
-- A trade is a deed (`verb = 'trade'`, read as respect): `item` is what the stranger handed over, as
-- for a gift, and `got` is what came back. A return for help is `verb = 'ask-back'` with `got` alone.
-- Nothing here is a price or a value: one thing for another, as the villager judged it. Additive;
-- null for every deed that is not one of these. Erased with the stranger with the rest of the deed.

alter table village_deeds add column if not exists got text;
