# Removing sign-in from the landing: what actually breaks

Written because I previously claimed AuthModal "owns the only writes to the `echo.userId` /
`echo.email` keys the rest of the app reads", and used that to justify keeping it. **That claim was
overstated, and this is the correction.** Nothing crashes. Here is the real accounting.

## What AuthModal wrote

| key | written at | value |
|---|---|---|
| `echo.userId` | `AuthModal.tsx:53` | the Supabase `public.users` id, via `POST /api/auth/sync` |
| `echo.email` | `AuthModal.tsx:58` | the address typed into the form |

It then did `router.push("/onboard")`.

## Every reader, and what each does without it

| reader | behaviour when `echo.userId` is absent |
|---|---|
| `lib/identity.ts` `resolveUserId()` | **generates a `crypto.randomUUID()` and persists it.** This is the canonical resolver, used by `/onboard`, `WorldClient` and the landing's own roster. |
| `components/Flow0Client.tsx:114` | generates `"u_" + random` and persists it |
| `components/IslandClient.tsx:171` | generates `"u_" + random` and persists it |
| `components/TownClient.tsx:111` | generates `"u_" + random` and persists it |
| `app/account/page.tsx:24` | reads it; works with whatever id is there, anonymous or not |

**`echo.email` has no reader at all.** Grepped the whole of `apps/web/src`: `AuthModal` writes it and
nothing ever consumes it. Removing that write costs precisely nothing.

## So: nothing breaks

- **The demo door / `/play` / `/onboard` / `/world` / `/town` / `/island`** all keep working. Every
  one of them either calls `resolveUserId()` or has its own inline fallback, and all of those mint an
  anonymous id on first use. This was always the anonymous-visitor path; it is not a new code path,
  it is the one most visitors were already on.
- **`/account`** keeps working against the anonymous id.
- **Anyone who has already signed in** has `echo.userId` in localStorage already and is completely
  unaffected. Their echo, island and persona continue under the same id.

## What is genuinely lost

**Account continuity across browsers and devices.** This is the whole cost, and it is real:

- There is no longer any way to sign IN. A returning player on a new browser, a new device, or after
  clearing site data gets a **fresh anonymous id**, which means a fresh echo. Their previous persona,
  island claim and behavioural history still exist in the database under the old id, but nothing on
  the site can reunite them with it.
- New players never get a `public.users` row from the landing, so their behavioural events accumulate
  under an anonymous UUID rather than an auth-linked id.
- `POST /api/auth/signup` and `POST /api/auth/sync` still exist and still work. They are simply
  unreachable from the UI. Nothing was deleted server-side, so restoring sign-in is re-mounting a
  component, not rebuilding a feature.

## Restoring it later

`components/AuthModal.tsx` is untouched and still exports the same interface. Re-mounting it and
re-adding one button restores sign-in exactly as it was. If it is ever restored, the one thing worth
fixing first: `echo.email` is written and never read, so either use it or drop the write.
