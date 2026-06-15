# ECHO

> *"You've arrived in a country that does not exist. It is your first day. No one knows you here — not even you."*

ECHO is a persistent 2D virtual world where, while you explore and talk to people, your
AI **agent** quietly learns who you are — from what you say and, more importantly, from
how you behave — and progressively earns the right to act on your behalf. It is **not a
game**: no scores, XP, levels, or win states. The engagement loop is the *mirror effect*
and a faithful "echo" of yourself that grows over time.

This repo is a runnable monorepo. It is being built in phases (§15 of the spec); each
phase leaves the app runnable.

## Repository

The canonical repository we use is **https://github.com/artunbalta/echo** — push work here:

```bash
git push echo main
```

(The `git remote` config also has `origin` → `echo-virtual-world` and `vercelrepo` →
`echovirtualworld`, kept around historically; `echo` is the one to use.)

## Status

| Phase | Subsystem | State |
|------|-----------|-------|
| 1 | Foundation: monorepo, shared protocol, PixiJS world, Colyseus server, Supabase schema | ✅ runnable & verified |
| 2 | Authoritative multiplayer: prediction, reconciliation, interpolation, reconnect | ✅ prediction + snapshot-interpolation buffer + 20s reconnection window; verified 2-client |
| 3 | Asset pipeline: consent → selfie→attributes→avatar / premade gallery, Fal+Higgsfield (verified contracts) | ✅ no-key paths verified |
| 4 | NPCs: spanning probe set, movement AI, event-driven LLM dialogue, telemetry, DB persistence | ✅ 100-NPC spanning set, wander AI, dialogue, telemetry; room loads from Supabase→JSON→generation |
| 5 | ML learning engine (§9): persona posterior, reward model, autonomy gate, BALD | ✅ 25 tests + live e2e |
| 6 | Agency UX: copilot/supervised/auto, transparency, outcome surfacing | ✅ verified (copilot→auto promotion in-UI) |
| 7 | TTS narrator: grounded debrief + voice | ✅ verified (grounded caption, stays silent, voice fallback) |
| 8 | Privacy, security, cost, observability, tests, load test | ◑ deletion cascade + cost meter + `/metrics` + privacy page verified; rate-limit/moderation/load-test are documented follow-ups |

**Run all three services** (web :3000, realtime :2567, ML :8000):
```bash
npm run dev:realtime &   # forwards telemetry/observations to ML (reads repo-root .env)
npm run dev:ml &         # the learning engine
npm run dev:web          # the client
```
In the world: walk to anyone, **"let my echo answer"** drafts your reply with a "why it
said that" trace; approve/edit/reject teaches the agent. Open **your echo** to see what it
has learned and which contexts it has earned autonomy in; **connections** surfaces who to
actually meet.

## Architecture

```
apps/web        Next.js + Tailwind + PixiJS client (renders the world, captures telemetry)
apps/realtime   Colyseus authoritative WorldRoom (positions, presence, NPC AI, dialogue broker)
services/ml     Python FastAPI — the learning engine (§9). [Phase 5]
packages/shared TS contract: world constants, wire protocol, sprite spec, persona axes, NPC generator
db              Supabase migrations (Postgres + pgvector) + NPC seed
pipeline/assets selfie → sprite generation scripts (Higgsfield/Fal). [Phase 3]
infra           deploy configs
```

The realtime server is a **long-lived process** — deploy it to Fly/Railway/Render, never
serverless. The web app deploys to Vercel. The DB is Supabase.

## Quick start (zero external keys)

Everything runs locally with **no API keys** — providers fall back to mocks (procedural
art, in-character mock dialogue, in-memory persistence).

```bash
npm install
npm run build:shared          # build the shared package first
npm run seed                  # generate db/seed/npcs.generated.json (100-NPC spanning set)

# two terminals (or `npm run dev` to run both):
npm run dev:realtime          # Colyseus on :2567
npm run dev:web               # Next.js on :3000
```

Open <http://localhost:3000>, pick a name, **Step through**. Move with **WASD / arrows**,
walk up to anyone and press **E** to talk. Open a second browser tab to see multiplayer
presence — both players share one world.

## Enabling real services

Copy `.env.example` → `.env` (and the `NEXT_PUBLIC_*` vars into `apps/web/.env.local`) and
fill in keys. Each provider is independently swappable:

- **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) → persistence of
  telemetry/interactions/persona turns on; run `db/migrations/0001_init.sql`, then `npm run seed`.
- **Anthropic** (`ANTHROPIC_API_KEY`) → NPCs speak via Claude (cheap model for ambient
  turns, strong model for sustained conversations). Falls back to mock otherwise.
- **Higgsfield/Fal** (`ART_PROVIDER`, keys) → real selfie→sprite generation [Phase 3].
- **ElevenLabs/OpenAI TTS** (`TTS_PROVIDER`, keys) → narrator voice [Phase 7].

## Documented assumptions (§18)

| Parameter | Value | Where |
|-----------|-------|-------|
| Tile size | 16 px (×3 render scale) | `packages/shared/src/world.ts` |
| Map | 64 × 64 tiles, procedural seed=7 | `world.ts`, `apps/web/src/game/tilemap.ts` |
| Net tick | 20 Hz | `world.ts` |
| Move speed | 4 tiles/s | `world.ts` |
| Interaction radius | 1.5 tiles | `world.ts` |
| Room capacity / shard | 150 | `world.ts` |
| Sprite frame | 16×24, 4 frames × 4 facings | `packages/shared/src/sprite.ts` |
| Persona latent dim `d` | 8 (bipolar axes) | `packages/shared/src/persona.ts` |
| Context/action embedding | 256-d | `db/migrations`, `.env` |
| NPC spanning set | 100, deterministic seed=1337 | `packages/shared/src/npcgen.ts` |

Covariance form, promotion thresholds `(α*, n*, e*)`, hysteresis, and stakes/cost values
are defined in `services/ml` (Phase 5).

## Privacy

Selfies are biometric data: they are processed to derive *style attributes only* and then
discarded — never stored (Phase 3). Behavioral telemetry is minimized and consented.
Account deletion cascades a hard delete across all derived state (Phase 8). KVKK + GDPR.

## THY brand-stand demo (`/venue` + `/dashboard`)

A self-contained brand-activation scene inside the ECHO world: a **concert venue** with a
**Turkish Airlines stand** where a salesperson stand-agent qualifies visitors like a real
airline rep (*nereye? ne zaman? bütçe?*), an **autonomous crowd** of visitor NPCs that walk
up, converse, and either book or defect through a portal "to another island," and a
**research dashboard** that captures who came, what was discussed, who booked, and **why
people didn't buy**.

**Runs with zero keys.** `npm run dev:web`, open <http://localhost:3000/venue> — visitors
spawn, queue at the stand, hold scripted Turkish conversations, and resolve; the dashboard
fills with synthetic-but-coherent data. Walk up (WASD / click) and press **E** to be
qualified yourself. A badge shows **mock / live** mode.

**Graceful degradation by capability (`lib/venue/capabilities.ts`).** Each subsystem has a
live + mock implementation behind one interface, selected from env — a missing key changes
behavior, never breaks the build:

| Subsystem | Key | Live | Mock (no key) |
|---|---|---|---|
| Dialogue (sales + visitor sim) | `ANTHROPIC_API_KEY` | Claude (`live-engine`) | scripted state machine (`mock-engine`) |
| Art (stand/stage/portal/plaza) | `HIGGSFIELD_API_KEY` / CLI | `npm run gen:assets` (Higgsfield) | committed PNGs → procedural |
| Voice | `TTS_API_KEY` | spoken salesperson | text only |
| Persistence | `DATABASE_URL` | (optional) | in-memory `Store` |

**Generated art.** The stand, stage, portal and plaza floor are produced with the
**Higgsfield CLI** (`npm run gen:assets` → `pipeline/generate-venue-assets.mjs`), chroma-keyed
and downscaled into `apps/web/public/assets/venue/`, and **committed** so the demo needs no
keys. Visitor/player characters reuse the world's procedural sprite system (every NPC must
match the 16×24 sprite spec). The "TURKISH AIRLINES" wordmark is a UI overlay, never baked
into the art (text fidelity + brand/IP). Salesperson figures are labeled *temsili*.

**Layout:** `lib/venue/{capabilities,store,types}`, `lib/venue/dialogue/*` (engine +
mock/live + orchestrator), `lib/venue/npc/*` (traveler profiles + weighted outcomes),
`lib/venue/research/aggregate`; `game/venue/*` (PixiJS scene + art); routes under
`app/api/venue/*`; pages `app/venue` and `app/dashboard`.
