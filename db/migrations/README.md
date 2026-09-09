# db/migrations

Applied by `npm run db:migrate:apply` (`scripts/migrate.mjs`). Reported, changing nothing, by
`npm run db:migrate` — the default is REPORT, so a typo cannot write to a database.

## Reversibility rule: FORWARD ONLY. There are no down migrations and there will not be.

A mistake is corrected by a NEW numbered migration that undoes it going forward. Never by editing an
applied file, and never by a down script.

Three reasons, and the first two are measured rather than asserted:

1. **Every file here is re-runnable.** All ten were re-applied against an already-migrated database
   with zero errors and zero row loss. Guarded DDL (`if not exists`, `or replace`,
   `on conflict do nothing`) is a property this repo already has; the rule only names it.
2. **No migration here destroys anything.** There is no `drop table`, no `truncate`, and no
   top-level `delete` in any of them. A down script would be the first destructive SQL in the
   folder, and it would be written to be run in the worst hour of a bad day.
3. `0011_behavioral_events` is an identity-keyed personal-data log. A `down` for it is an erasure
   path, and erasure already has an owner — the §13 cascade in
   `apps/web/src/app/api/account/delete/route.ts`. **Two erasure paths is one too many.**

If a change genuinely cannot be expressed additively, its first line must be

    -- IRREVERSIBLE: <what is lost, and what a restore would cost>

and that sentence is the review.

## Numbering: take the next number from `main`, never from a branch

This repo has broken that rule twice.

- **0006, twice.** `0006_island_state.sql` (2026-07-12) and `0006_waitlist.sql` (2026-07-16).
  Resolved by `2db6375` — waitlist 0006→0007, waitlist_portrait 0007→0008 — while the folder was
  still applied by hand and nothing had recorded the old names. **That escape hatch is now closed:**
  once a version is in `schema_migrations`, renaming its file shows up as an ORPHAN plus a new
  PENDING, and applying that PENDING re-runs the migration under a new number.
- **0009, twice, and still open.** `0009_planet_registry.sql` here; `0009_measurement_corpus.sql` on
  `feat/measurement-corpus`. **Note the dates, because the obvious blame is backwards:** the corpus
  took 0009 on 2026-08-07 and its commit message documents checking `git log --all --diff-filter=A`
  first, which at that date correctly showed 0008 as the maximum. The planet registry took the same
  number on 2026-09-02, twenty-six days later, without. The branch that broke the rule is this one.

**The resolution, owed and deliberately not taken here:** rename the corpus migration to
`0013_measurement_corpus.sql` **on `feat/measurement-corpus`, before it merges** — 0013 because 0012
is the ledger above. That branch has never been applied to any database, so nothing recorded the old
name and the rename is free. It is the `2db6375` window exactly, and it is the window that closes the
moment this ledger ships anywhere. It breaks four prose references and, verified, **no code**:
`services/ml/echo_ml/corpus.py` targets the TABLE `measurement_corpus`, never the filename.

`0009_planet_registry.sql` must **not** be renamed. It is on five refs, it is applied to every planet
test database, and `packages/planet/tests/registry.test.ts` names it in its setup line.

## 0010 does not exist, and never did

Verified across every ref, every reflog-reachable commit, every dangling object, and every tree in
the object database. **No commit message or doc anywhere explains the skip** — 0011 simply followed
0009, and why is unverifiable rather than merely unrecorded, so this file says so instead of
inventing a reason.

The gap is PERMANENT and is left open on purpose. The runner keys on the version string and never
requires contiguity, and 0010 is not free to reuse: a number a reader cannot account for is exactly
what this folder is trying to stop producing.

## They are not portable to a plain Postgres, and it takes TWO things to apply them

`0001_init.sql:1` says it out loud — "Run against a Supabase Postgres with pgvector" — and the set
needs both halves of that sentence.

1. **pgvector.** `0001_init.sql:5` is `create extension if not exists vector;`. **`if not exists`
   guards against the extension being already CREATED, never against its being unavailable**, so on
   a Postgres without pgvector the very first migration dies at line 5 and **zero of the thirty
   tables are created**:

       psql:db/migrations/0001_init.sql:5: ERROR:  extension "vector" is not available

   The columns that need it are real and correct: `persona_state.z_mean vector(8)` matches
   `persona.D == 8`, and `behavior_index.context_embedding vector(256)` matches
   `SETTINGS.embed_dim == 256`.

2. **The `anon` and `authenticated` roles.** 0007 (eight references) and 0008 (two) hard-depend on
   them at `revoke all on function … from public, anon, authenticated`; without them
   `0007_waitlist.sql` fails with `role "anon" does not exist`.

CI provisions both: `pgvector/pgvector:pg16` rather than `postgres:16`, and `create role anon;
create role authenticated;` before the runner.

### ⚠️ This section was wrong when it was first written, and the reason matters more than the fix

It said, under the heading "and that is measured", that the first failure on a stock Postgres was
0007's missing role. **It is not — it is pgvector at 0001:5, before a single table.** The original
measurement was taken on a machine where Homebrew's pgvector 0.8.6 had been installed **27 hours
earlier**, so 0001 sailed past and 0007 was merely the first failure *that machine* could reach. The
condition was never stated, so the result read as unconditional.

That is SOCIETY-PLAN §3's exact failure mode — *a number measured under an unstated condition,
recorded as unconditional* — and it shipped in the commit that built the migration ledger to prevent
this class of thing. It also made CI red for one commit: the job used `postgres:16`, which does not
carry pgvector, so `db:migrate:apply` would have died at 0001:5.

**A measurement carries its environment or it carries nothing.** If you re-measure portability, say
which Postgres, with which extensions, installed when.
