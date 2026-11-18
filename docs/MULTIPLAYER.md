# Live multiplayer — two real players, one world

> **Village rooms (DECISIONS C101).** The 3D village has its own kind of room: a copy of the reference
> village (Drurnscree) that a group enters by a five-character code. Locally: `npm run dev` (realtime
> :2567 + web :3000), open <http://localhost:3000/parcel/84dcee5ffffffff>, Menu → **Play with friends** →
> **Start a new room**, and open the link it gives in a second browser (or a private window). Friends are
> drawn as villagers; Enter to speak. Room: `apps/realtime/src/VillageRoom.ts`; page:
> `apps/web/src/lib/villageRoom.ts`, `game/world/othersLayer.ts`, `components/world/RoomPanel.tsx`; rules:
> `packages/shared/src/village.ts`; test: `npm run test:village -w @echo/realtime`.
>
> **Your echo keeps your body (C104).** With **When you leave → Let my echo take my place** on, leaving the
> room leaves your body there: the room walks it along your own way (`apps/realtime/src/echoBody.ts`) and it
> acts only where its standing is `act` (C103), by a brief the web app signs (`/api/echo/standin`,
> `@echo/shared/standin`). Coming back gives you the same body and a card of what it did. The realtime
> server now imports `@echo/planet` (build it before the realtime service); `ECHO_STANDIN_MAX_S` shortens
> the keeping for a test. Test: `npm run test:standin -w @echo/realtime`.
>
> **Watching it (C105).** Once you have left with your echo standing in, the door offers **Watch it**:
> `/watch/<cell>?room=<code>` follows the body from outside with what it meets, and "Not me" beside each.
> The room sends what the echo did to the web app when the keeping ends: set `ECHO_WEB_URL` on the realtime
> service (locally, the web app's address). Test: `npm run test:watch -w @echo/realtime`.
>
> **Hosting it (C106).** `apps/realtime/Dockerfile` builds shared, planet and the server (Node 22); Render's
> `echo-realtime` in `render.yaml` runs it (Starter, one instance: not Free, which sleeps). It needs
> `ECHO_IDENTITY_SECRET` (the same as Vercel's) and `ECHO_WEB_URL`; Vercel needs `NEXT_PUBLIC_REALTIME_URL`
> = `wss://<service>.onrender.com` and a redeploy. A deploy stops the server with SIGTERM: keepings end and
> are reported first, and pages come back into their rooms by themselves. A friend is sent
> `/in/<pass>?room=<ROOM>` (a pass from `ECHO_PASS`). Test: `npm run test:shutdown -w @echo/realtime`.
>
> **Who is who (C107).** No name crosses the wire: a body is a handle, a look (`roomLookOf(subject, code)`, per copy)
> and a pose, and each page names it from the look in the village's tongue (`visitorName`) with a visitor's plate.
> `talk {to, text}` reaches one body's person alone (`told`); to a body an echo keeps it reaches only its watcher
> (`heard`), and nobody answers. The page talks to anyone nearest through the villagers' own panel.
>
> **Learning how you talk (C108).** With a yes of its own under "When you leave", a person's lines (to villagers, to someone in a room, aloud in one) are kept by the web app, never by the room; the room still stores no line. A line to a person carries nothing that person said. Before each answer to a villager, the echo's guess is sealed and later judged, earning the "talk" threshold; (C109) past that threshold a body its echo keeps answers `talk` with a line the web app writes (`/api/echo/speak`, signed by the room), after a typing pause; close to it, the line goes to the watching person as `would` and is said only on their `sayIt`.
>
> What follows describes the old 2D world's `WorldRoom`.

Two (or more) people on different devices share the same map: they **see** each other
(live players carry a glowing marker and show up in a "live now" roster) and can **play**
together — walk up, press **E**, and chat in real time. Once your echo has earned autonomy,
a conversation between two live players can even run **echo-to-echo**.

It is all carried by the authoritative Colyseus `WorldRoom`: every connected player and NPC
lives in one shared room, so positions, presence, and chat are already synchronized. The
only thing that makes "two browser tabs on my laptop" become "two people across the
internet" is **where the realtime server runs and which URL the web client dials**.

## How it works (the moving parts)

| Piece | File | Role |
|------|------|------|
| Shared room | `apps/realtime/src/WorldRoom.ts` | Holds all players + NPCs; relays player↔player chat (`relayPeerChat`), opens a conversation on **both** sides, spawns newcomers near an existing live player |
| Wire protocol | `packages/shared/src/protocol.ts` | `INTERACT_TURN` now carries `peer` / `peer_echo` turns; `ChatMessage.viaEcho` marks an echo-drafted line |
| Renderer | `apps/web/src/game/PixiWorld.ts` | Live players are proximity-interactable + get a glow ring; `pingEntity()` powers "locate" |
| World UI | `apps/web/src/components/WorldClient.tsx` + `LiveRoster.tsx` | "live now" roster, "came online" beats, peer chat, "let our echoes talk" (gated on the autonomy threshold) |

## Local (two tabs) — works out of the box

```bash
npm run dev   # realtime :2567 + web :3000
```

Open <http://localhost:3000> in two tabs (or two browsers). Each is a separate player —
they spawn near each other, see each other's glow + roster entry, and can walk up and talk.
No deploy, no env changes. The default `NEXT_PUBLIC_REALTIME_URL=ws://localhost:2567`
already points both tabs at the same local server.

## Real remote (two devices over the internet)

You need the realtime server reachable on a public `wss://` URL, and the deployed web app
pointed at it. The repo already ships `apps/realtime/Dockerfile` + `render.yaml`.

### 1. Deploy the realtime server (Render)

1. Push to GitHub (the canonical remote): `git push echo main`
2. Render dashboard → **New → Blueprint** → pick this repo. It reads `render.yaml` and
   builds `apps/realtime/Dockerfile` from the repo root.
3. (Optional) In the service's **Environment**, set `ANTHROPIC_API_KEY` (real NPC dialogue)
   and `SUPABASE_SERVICE_ROLE_KEY` (curated NPC roster + persistence). Player↔player chat
   needs **neither** — it is a pure relay.
4. When it goes live, copy the URL: `https://echo-realtime-xxxx.onrender.com`.
   Health check: visiting `…/health` should return `{"ok":true,"service":"echo-realtime"}`.

### 2. Point the web app at it (Vercel)

In the web project's env vars set (note `wss://`, the **secure** WebSocket scheme — a page
served over `https://` cannot open an insecure `ws://` socket):

```
NEXT_PUBLIC_REALTIME_URL = wss://echo-realtime-xxxx.onrender.com
```

Redeploy the web app. `NEXT_PUBLIC_*` is inlined at **build** time, so a redeploy is
required for the new URL to take effect. Now two people on two devices open the deployed
site and share one world.

### ⚠️ Keep the realtime server a single instance (for now)

`joinOrCreate("world")` reuses an existing room only **within one process**. If Render (or
any host) runs **multiple instances**, two players can land on different instances → two
separate "world" rooms → they won't see each other. So:

- Keep the realtime service at **1 instance** (don't enable autoscaling / multiple replicas).
- To scale past one instance later, add Colyseus's Redis presence + driver
  (`@colyseus/redis-presence`, `@colyseus/redis-driver`) so matchmaking is shared across
  instances. That's the documented next step, not wired here.

The free Render plan cold-starts after idle (~30–60s on the first hit). The `starter` plan
in `render.yaml` avoids that.

## Quick verification

- **Local:** two tabs → each shows `live (1)` in the toolbar; "locate" pans to the other;
  walk together and chat both ways.
- **Remote:** two devices on the deployed URL → same, and the `…/health` endpoint is green.
- **Echo-to-echo:** only offered with another *live player* and only once your echo has a
  context at `auto` (the same threshold that unlocks the handover). Below that, players just
  chat human-to-human.
