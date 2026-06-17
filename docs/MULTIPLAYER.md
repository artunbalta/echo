# Live multiplayer — two real players, one world

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
