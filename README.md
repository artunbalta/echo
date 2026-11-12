# ECHO

> *"You've arrived in a country that does not exist. It is your first day. No one knows you here — not even you."*

ECHO is a world in the browser where an AI learns to predict one person, you, by watching what you
do, and tells you how well it knows you.

You walk into a village. Small things happen around you: a purse lies in the grass, an old man has
slipped and cannot get up, children ask you to lie about a throw. Before each one, your **echo**
seals a guess about what you will do. Afterwards you open the envelopes. Then a friend tries to do
better.

It is not a game: no score, no levels, nothing to win. The live site is
[echovirtualworld.com](https://echovirtualworld.com).

## Why

Companies now sell "digital twins" of people, built from what those people say about themselves.
On the largest public benchmark (Twin-2K-500: 2,058 people, 13 twins released by its authors) we
found that **all 13 twins know less about a person than a guess that knows nobody**: the crowd's
median answer. Given one earlier answer by the same person, each twin rises to 54–58% of what can
be known about them, above the person's own retest.

What a person will do is mostly not in what they say. It is in what they did the last time they
were in the same situation. So the scarce thing is repeated observation of the same person in the
same kind of moment, and a world people come back to produces that as play.

- The result, the method and its limits: [`/bench`](https://echovirtualworld.com/bench)
- The same audit on your own twins, in your browser: [`/audit`](https://echovirtualworld.com/audit)
- The research code and every number: [`research/deeds/`](research/deeds/) (four public datasets:
  Twin-2K-500, the Basel–Berlin Risk Study, the Self-Regulation Ontology, and 31.5 million Moral
  Machine decisions). The paper is under review.

We have a stake in this result: ECHO builds twins from behaviour. The code and the analysis plans
are here so that anyone can rerun it.

## What is in the world

| | |
|---|---|
| **A planet** | Procedural, 284,004 cells on an H3 grid; 28,305 of them hold a village. |
| **People** | Every village's people are a closed-form function of a seed and the world's clock: they are born, marry, work, age and die, and their children inherit. Nobody stores them. |
| **Moments** | 41 kinds of small event near whoever is walking. 30 are published psychology experiments in village clothes, 17 with counterbalanced arms (two coins in the purse or nine; bystanders or none). |
| **The echo** | Two layers. A Bayesian engine that places you on eight axes from how you move and choose (`services/ml`). And the envelopes: a call sealed before each moment, from what you did at moments like it, in your browser. |
| **The envelopes** | Each call is hashed with the one before it, so none can be changed afterwards. You open them; a friend can guess the same moments from a link that no server ever sees. |
| **The study** | A pilot in which friends predict each other, play twice or three times, and see who knew them best: themselves, their friends, or their echo. Off unless switched on. |

## Run it

Node 22 or newer. No keys are needed: every outside service has a stand-in.

```bash
npm install
npm run build:shared      # the two shared packages; needed before anything else
npm run dev:web           # http://localhost:3000
```

Open the page and press **Walk in**. WASD to walk, E to use what is near, O to open what your echo
sealed.

The engine and the shared-world server are optional:

```bash
npm run dev:ml            # the Bayesian engine (Python; see services/ml)
npm run dev:realtime      # the old shared room (Colyseus)
```

Copy `.env.example` to `.env` and `apps/web/.env.local` to turn real services on (Supabase,
Anthropic for villagers who talk, ElevenLabs for their voices). `npm run check:env` says whether the
two files agree.

## Check it

```bash
npm run check:register    # every defect reference in the docs resolves
npm run typecheck
npm test                  # shared, planet, realtime, web
cd services/ml && .venv/bin/python -m pytest -q
```

The research has its own tests: see [`research/deeds/README.md`](research/deeds/README.md) and
[`research/pilot/README.md`](research/pilot/README.md).

## Where things are

```
apps/web          Next.js: the world (three.js), every page, every route
apps/realtime     Colyseus: the older shared room
packages/planet   the planet, the villages, their people, the moments: pure TypeScript
packages/shared   types and logic both servers use
services/ml       the echo's engine: FastAPI, a Bayesian persona on eight axes
research/deeds    the four public-data studies, the twin audit
research/pilot    the pilot's analysis, written before any participant
research/paper    the manuscript and what builds it
db/migrations     Postgres, forward only
docs              the decisions, the open defects, the plans
```

Three documents are the record, and they are long on purpose:

- [`docs/DECISIONS.md`](docs/DECISIONS.md): every decision, what it answered, what was measured.
- [`docs/known-gaps.md`](docs/known-gaps.md): every known defect and limit, numbered.
- [`docs/SOCIETY-PLAN.md`](docs/SOCIETY-PLAN.md): how an empty planet becomes one shared, peopled world.

## The rules the work is held to

- A number is measured, or it is not a number.
- The seed is the prior; the database holds only what changed.
- Who lives in a village is a function of the seed and the clock, never of who visited.
- Nothing in the world is a prompt: a moment is people doing something, and leaving is an answer.
- No score, no XP, no levels.
- Behaviour is read only with a yes; typed words are never read into the echo; everything a person
  left can be erased.

## Where it stands

Honest, as of November 2026:

- Nobody has played it yet beyond its builder and bots. The pilot has not run.
- The production deployment renders the world but its engine and its database are not fully
  provisioned, so the eight-axis echo is silent there. The envelopes need none of that and work.
- The envelope echo's speed of learning rests on assumed stabilities until the pilot measures them.
- Choices in the world have not yet been tied to behaviour outside it.

Built by [Artun Balta](mailto:artun.balta@outlook.com).

*An earlier README, from when the world was two-dimensional, is kept at
[`docs/README-2026-09.md`](docs/README-2026-09.md).*
