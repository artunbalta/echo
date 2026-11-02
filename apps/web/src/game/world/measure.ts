/**
 * The measurement chain (plan W5-1): a player action goes out as a BehavioralEvent, through
 * /api/observe/behavioral into the persona posterior, and comes back as a number the inspector can
 * show. This is the point of the whole project, so the whole path lives in one file the world layer
 * can hold in one hand.
 *
 *   identity   resolveUserId(): the ONE bare id every write and every read use (lib/identity.ts),
 *              so the posterior that comes back is the one the events were written under.
 *   consent    the landing's own gate. It reads the key /play shares, localStorage "echo.consent",
 *              but here UNSET MEANS OFF: until accept() has written `telemetry:true`, nothing is
 *              emitted, buffered, sampled, logged, or even fetched, the seed GET included. /play
 *              reads the same key the other way round (missing means on, lib/funnel.ts) and depends
 *              on that; neither reading may change. Both writers set the field explicitly, so the
 *              two gates agree the moment either has been answered.
 *   transport  a TelemetryCollector whose sender POSTs to /api/telemetry, so passive_locomotion
 *              reaches ML /telemetry with no room. That is known-gaps ⚑12 option 2 exactly: the
 *              same LocomotionSampler, the same scalars, the same window and caps, a different
 *              transport and nothing else; services/ml is untouched. The sampler is fed TILE
 *              positions from the mover every frame through feedPosition().
 *   actions    emitAction() builds the envelope with all eight mandatory context fields and
 *              session_mode "landing", POSTs it, and RETURNS the parsed result, so the caller can
 *              read persona.mu, delta_mu, mocked and durable off the same object.
 *   posterior  read from GET /api/agent/persona when the chain arms, re-read after every
 *              locomotion window that lands (walking moves it), and updated from each
 *              /observe/behavioral response. No polling: the posterior moves when an event moves
 *              it, and the inspector shows the same move the world reacts to.
 *   log        the last LOG_SIZE events, each with what was routed and what came back.
 *
 * Nothing here invents a number. A mocked response is carried as mocked with its reason, and the
 * posterior is flagged rather than filled in; the inspector shows OFFLINE, not zeros.
 */

import {
  buildFlow1Event,
  CUE_FOR_TYPE,
  FLOW1_CONTEXT,
  PERSONA_AXIS_KEYS,
  type ActionPolarity,
  type BehavioralEvent,
  type CueChannel,
  type CueId,
  type EventContext,
  type RawSignals,
  type SessionMode,
  type TargetKind,
  type TelemetryEvent,
  type TelemetryType,
} from "@echo/shared";

import { ensureIdentity, identityHeaders, peekUserId, resolveUserId } from "../../lib/identity";
import { LocomotionSampler, TelemetryCollector } from "../telemetry";
import { ACTION_AXIS_MAP, type ActionRow } from "./actionMap";

export const LANDING_MODE: SessionMode = "landing";
/** The consent key /play, /onboard and /account share. Only the reading of "unset" differs here. */
export const CONSENT_KEY = "echo.consent";
export const LOG_SIZE = 25;

/**
 * The landing context. The demo's actions are Flow-1 cues (own ground, no audience, no
 * counterpart), so the Flow-1 envelope is the honest one, and every one of ingest.REQUIRED_CONTEXT's
 * eight fields is present. A caller narrows it per action through contextOverride (the cave raises
 * stakes), never by dropping a field.
 */
export const LANDING_CONTEXT: EventContext = { ...FLOW1_CONTEXT };

// ── consent ─────────────────────────────────────────────────────────────────────

export type ConsentState = "unset" | "accepted" | "declined";

function readConsentRecord(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The landing's reading of the shared key: only an explicit `telemetry:true` is "accepted". */
export function landingConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  const v = readConsentRecord().telemetry;
  return v === true ? "accepted" : v === false ? "declined" : "unset";
}

function writeConsent(telemetry: boolean): void {
  if (typeof window === "undefined") return;
  try {
    // Explicit, and merged: the other fields of the record (voice, …) belong to /onboard.
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...readConsentRecord(), telemetry }));
  } catch {
    /* private mode / quota: the chain then reads "unset" and stays off, which is the safe side */
  }
}

export function acceptConsent(): void {
  writeConsent(true);
}

export function declineConsent(): void {
  writeConsent(false);
}

// ── what comes back ─────────────────────────────────────────────────────────────

export interface Posterior {
  /** Posterior mean over PERSONA_AXIS_KEYS. Zeros when mocked; the inspector never shows them then. */
  mu: number[];
  /** Per-axis variance, diag(Sigma). Null when the response carried no covariance. */
  var: number[] | null;
  version: number | null;
  /** True when no real update stands behind these numbers; `reason` says why. */
  mocked: boolean;
  reason?: string;
  source: "seed" | "event";
  at: number;
}

export interface MeasureLogEntry {
  /** `${sessionId}#${n}`; also written into the envelope's payload as event_id so the stored row carries it. */
  id: string;
  action: string;
  route: "behavioral" | "telemetry";
  /** The telemetry features ingest.py (or the /telemetry branch) sets for this action, from ACTION_AXIS_MAP. */
  features: readonly string[];
  /** ‖Δμ‖ reported by ML. Null on the telemetry route, which returns no posterior, and when mocked. */
  delta_mu: number | null;
  mu: number[] | null;
  version: number | null;
  mocked: boolean;
  durable: boolean;
  reason?: string;
  at: number;
}

export interface EmitActionOptions {
  /** Default: the action's row in ACTION_AXIS_MAP. */
  cue?: CueId;
  channel?: CueChannel;
  polarity?: ActionPolarity;
  raw?: RawSignals;
  target?: { id: string; kind: TargetKind };
  contextOverride?: Partial<EventContext>;
}

export interface ActionResult {
  ok: boolean;
  eventId: string;
  /** The envelope as sent; null when nothing was sent. */
  event: BehavioralEvent | null;
  mocked: boolean;
  durable: boolean;
  reason?: string;
  persona: { mu: number[]; Sigma?: number[][]; version?: number } | null;
  delta_mu: number | null;
  /** The route's whole answer, for what the fields above do not carry (cond_persona, telemetry_used). */
  response: BehavioralRouteResponse | null;
}

/** What /api/observe/behavioral answers (apps/web/src/app/api/observe/behavioral/route.ts). */
export interface BehavioralRouteResponse {
  ok?: boolean;
  forwarded?: number;
  mocked?: boolean;
  reason?: string;
  durable?: boolean;
  durable_reason?: string;
  results?: {
    ok?: boolean;
    mocked?: boolean;
    reason?: string;
    persona?: { mu: number[]; Sigma?: number[][]; version?: number };
    delta_mu?: number;
    cond_key?: string;
    cond_persona?: { mu: number[] };
    telemetry_used?: Record<string, unknown>;
  }[];
}

/** What /api/telemetry answers. It carries no posterior: ML /telemetry returns only uncertainty. */
export interface TelemetryRouteResponse {
  ok?: boolean;
  forwarded?: number;
  mocked?: boolean;
  reason?: string;
  durable?: boolean;
  durable_reason?: string;
}

/** The part of GET /api/agent/persona the seed reads (lib/ml.ts PersonaSnapshot, widened). */
export interface PersonaRouteResponse {
  mocked?: boolean;
  reason?: string;
  persona?: { mu: number[]; Sigma?: number[][]; version?: number };
  var?: number[];
}

// ── the chain ───────────────────────────────────────────────────────────────────

export interface MeasureChainOptions {
  /** Default resolveUserId(). */
  userId?: string;
  sessionId?: string;
  /** Default globalThis.fetch, resolved at call time so a test can stub it. */
  fetchImpl?: typeof fetch;
  /** The collector's flush cadence. */
  flushMs?: number;
  /** The clock the sampler and the log use. */
  now?: () => number;
}

export interface MeasureChain {
  readonly userId: string;
  readonly sessionId: string;
  consent(): ConsentState;
  /** Writes `telemetry:true` to the shared key and arms the chain: collector, sampler, seed GET. */
  accept(): void;
  /** Writes `telemetry:false`; the chain stays (or goes) dark and the buffer is dropped, not sent. */
  decline(): void;
  /** A later withdrawal: decline, and forget the local log too. */
  revoke(): void;
  /** True while consent is accepted and the collector is up. */
  armed(): boolean;
  /** Feed the mover's TILE position every frame. Before accept this is a no-op: not even sampled. */
  feedPosition(x: number, y: number, now?: number): void;
  /** The positions fed from now on are in another frame (C57): end the path here. */
  breakPath(): void;
  emitAction(action: string, opts?: EmitActionOptions): Promise<ActionResult>;
  /** The last LOG_SIZE events, oldest first. A copy. */
  log(): MeasureLogEntry[];
  posterior(): Posterior | null;
  /** Called after any change to the log, the posterior, or consent. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Send whatever the collector holds now (consent permitting). */
  flush(): void;
  dispose(): void;
}

export function createMeasureChain(opts: MeasureChainOptions = {}): MeasureChain {
  // The id is READ here and MINTED only on accept. resolveUserId writes a durable localStorage
  // key the first time it is called, and the chain is constructed during the same render that
  // draws the consent card, so calling it here stamped a cross-session identifier before the
  // question was asked, under a card promising that a no leaves the world exactly as it was.
  // Neither decline() nor revoke() removed it. peekUserId reads without writing; arm() mints.
  let userId = opts.userId ?? peekUserId();
  const sessionId = opts.sessionId ?? newSessionId();
  const doFetch: typeof fetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));

  // The signature that says which subject these writes belong to (SOC-2.E) now comes from
  // `lib/identity.ts`, because this closure was the only place in the tree that knew how to send it
  // — so `/play` and `/flow4` wrote under no signature at all and were refused the moment their
  // routes were gated (L5). Two behaviours came with the move: a `?u=` override deliberately sends
  // NO token, and the body still carries `userId` / `actor_id` exactly as `chain.test.mts` pins it.
  const clock = opts.now ?? Date.now;

  let collector: TelemetryCollector | null = null;
  let sampler: LocomotionSampler | null = null;
  let posterior: Posterior | null = null;
  let inFlight = false;
  let seeded = false;
  let disposed = false;
  let seq = 0;
  const log: MeasureLogEntry[] = [];
  const listeners = new Set<() => void>();

  const consentOn = () => landingConsent() === "accepted";
  const nextId = () => `${sessionId}#${++seq}`;
  const notify = () => {
    for (const fn of listeners) fn();
  };
  const pushLog = (entry: MeasureLogEntry) => {
    log.push(entry);
    if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE);
    notify();
  };

  /**
   * The collector's sender. Consent is re-read at send time, so a batch buffered before revoke()
   * is dropped by the flush stop() performs, never sent. Fire-and-forget on the client side: the
   * player is never blocked on telemetry; the log records what came back when it comes back.
   */
  const send = (events: TelemetryEvent[]) => {
    if (disposed || !consentOn()) return;
    const stamped = events.map((e) => ({ ...e, session_mode: LANDING_MODE }));
    const ids = stamped.map(() => nextId());
    void postTelemetry(stamped, ids);
  };

  async function postTelemetry(events: TelemetryEvent[], ids: string[]): Promise<void> {
    let res: TelemetryRouteResponse = { mocked: true, durable: false };
    let reason: string | undefined;
    await identitySettled; // never write under an id that is about to be replaced
    try {
      const r = await doFetch("/api/telemetry", {
        method: "POST",
        headers: identityHeaders(),
        body: JSON.stringify({ userId, sessionId, events }),
      });
      res = (await r.json()) as TelemetryRouteResponse;
      if (!r.ok) reason = res.reason ?? `http_${r.status}`;
    } catch (err) {
      reason = `network_failed: ${(err as Error).message}`;
    }
    const mocked = reason !== undefined || res.mocked !== false;
    // A locomotion window that reached the service has already moved the stored posterior, and the
    // response says only how uncertain it now is. Read it back, or the panel keeps showing a mean
    // the world has left behind and grows staler with every step.
    if (!mocked && events.some((e) => e.type === "passive_locomotion")) void seed(true);
    events.forEach((ev, i) =>
      pushLog({
        id: ids[i],
        action: ev.type,
        route: "telemetry",
        features: rowFor(ev.type)?.features ?? [],
        delta_mu: null,
        mu: null,
        version: null,
        mocked,
        durable: res.durable === true,
        reason: reason ?? res.reason ?? res.durable_reason,
        at: ev.ts,
      }),
    );
  }

  /**
   * Read the posterior. Never before consent.
   *
   * This used to be a single seed read for the life of the page, on the reasoning that only a
   * bounded act moves the posterior and only the slice has one. That reasoning was wrong, and the
   * inspector printed a falsehood on top of it. `passive_locomotion` is not merely recorded: the
   * ML route lifts `novel_tile_ratio` and `path_tortuosity` into the telemetry features and runs a
   * Kalman update (services/ml/echo_ml/app.py:262-281), and both are identified directions in W,
   * the two largest loadings in the action map at openness 0.47 and affect 0.34. So walking a bare
   * parcel moves the stored posterior about once every 1.5 seconds, on the least fakeable channel
   * there is, and a single seed read could never see it.
   *
   * The route answers a locomotion window with `uncertainty` and no mean, so the movement cannot
   * be reported from the response. Re-reading is the only honest way to show it, and `force` is
   * how the locomotion path asks for one.
   */
  async function seed(force = false): Promise<void> {
    if (seeded && !force) return;
    if (inFlight) return;
    seeded = true;
    inFlight = true;
    const at = clock();
    let next: Posterior;
    try {
      // The read is signed like the sends are, so it waits for the same settled subject; read under a
      // provisional id it was refused (403) on every first arm, and only the next re-read got through.
      await identitySettled.catch(() => undefined);
      const r = await doFetch(`/api/agent/persona?uid=${encodeURIComponent(userId)}`, { headers: identityHeaders() });
      next = posteriorFromSnapshot((await r.json()) as PersonaRouteResponse, at);
    } catch (err) {
      next = { mu: zeros(), var: null, version: null, mocked: true, reason: `network_failed: ${(err as Error).message}`, source: "seed", at };
    }
    inFlight = false;
    if (disposed) return;
    // An event may have answered while the read was in flight, and then whichever is NEWER wins, by the
    // engine's own version. This was `posterior?.source === "event"`, which held for the rest of the
    // session once any act had answered, so after the first act the walking re-reads were thrown away
    // and the meter stopped moving with the body. C45 makes acts frequent, which made that permanent.
    const current = posterior;
    if (current?.source === "event") {
      if (next.mocked && !current.mocked) return; // a failed read never replaces a real answer
      if (!current.mocked && (next.version === null || current.version === null || next.version <= current.version)) return;
    }
    posterior = next;
    notify();
  }

  /**
   * Resolves once `arm()` knows which subject this chain writes under.
   *
   * WITHOUT THIS THERE IS A WINDOW, and it drops exactly the events a first visit is made of. `arm()`
   * takes a provisional id from `resolveUserId()` so that `armed()` can stay synchronous — two tests
   * assert it the statement after `accept()` — and then asks the server for a SIGNED one. In between,
   * an action would be stamped with the provisional id and sent with no token, which production
   * refuses (`identity_required`). Fail-closed, and silently lossy: the first thing someone does is
   * the thing that vanishes. Both senders await this, so a batch flushes under the settled subject.
   */
  let identitySettled: Promise<unknown> = Promise.resolve();

  function arm(): void {
    if (collector || disposed) return;
    // Consent has been given, so the id may now be written down. Before this line the chain has
    // only ever READ it, which is what lets a decline leave nothing behind.
    if (!userId) userId = resolveUserId();
    // AND ask the server to mint a SIGNED id, off the critical path on purpose (SOC-2.E). `arm()`
    // stays synchronous because every caller is a click handler; the collector's first flush is
    // `flushMs` away, so in practice the signature arrives first. If it does not, production REFUSES
    // those writes rather than attributing them to an id nobody verified — which is the whole point,
    // and is why this is not awaited and not guarded.
    identitySettled = ensureIdentity(doFetch).then((id) => {
      if (id && !disposed) userId = id;
    });
    collector = new TelemetryCollector(sessionId, send, opts.flushMs ?? 2000, true);
    collector.start();
    // The same sampler /play uses, unmodified; its scalars ride the ordinary collector so the
    // window, the change threshold and the daily cap apply unchanged (⚑12's bar).
    const c = collector;
    sampler = new LocomotionSampler((scalars) => c.emit("passive_locomotion", { ...scalars }));
    void seed();
  }

  function disarm(): void {
    sampler = null;
    const c = collector;
    collector = null;
    c?.stop(); // flushes; the sender drops the batch because consent is already off
  }

  if (consentOn()) arm();

  return {
    get userId() { return userId; },
    sessionId,
    consent: landingConsent,

    accept() {
      acceptConsent();
      arm();
      notify();
    },

    decline() {
      declineConsent();
      disarm();
      notify();
    },

    revoke() {
      declineConsent();
      disarm();
      log.length = 0;
      notify();
    },

    armed: () => collector !== null,

    feedPosition(x, y, now = clock()) {
      sampler?.feed(x, y, now);
    },
    breakPath() {
      sampler?.breakPath();
    },

    async emitAction(action, o = {}) {
      const eventId = nextId();
      const refuse = (reason: string): ActionResult => ({
        ok: false, eventId, event: null, mocked: true, durable: false, reason, persona: null, delta_mu: null, response: null,
      });
      if (!consentOn()) return refuse("consent_off");
      if (!collector) return refuse("not_armed");

      // Before the envelope is built, because `actorId` is read out of `userId` below and a
      // provisional id would be stamped into an event that outlives it.
      await identitySettled;

      const row = rowFor(action);
      const cue = o.cue ?? row?.cue;
      const channel = o.channel ?? row?.channel;
      if (!cue || !channel) {
        // Not in the map and no cue given: sending it would invent a route. Refuse, and say so in
        // the log so the missing row is visible in the inspector rather than in a silent 0.
        pushLog({ id: eventId, action, route: "behavioral", features: [], delta_mu: null, mu: null, version: null, mocked: true, durable: false, reason: "unmapped_action", at: clock() });
        return refuse("unmapped_action");
      }

      const event: BehavioralEvent = {
        ...buildFlow1Event({
          actorId: userId,
          sessionId,
          channel,
          cue,
          action,
          polarity: o.polarity,
          targetId: o.target?.id,
          targetKind: o.target?.kind,
          raw: o.raw,
          contextOverride: { ...LANDING_CONTEXT, ...(o.contextOverride ?? {}) },
        }),
        type: legacyTypeFor(cue),
        session_mode: LANDING_MODE,
      };
      event.payload = { ...event.payload, event_id: eventId };

      let response: BehavioralRouteResponse | null = null;
      let reason: string | undefined;
      try {
        const r = await doFetch("/api/observe/behavioral", {
          method: "POST",
          headers: identityHeaders(),
          body: JSON.stringify({ event }),
        });
        response = (await r.json()) as BehavioralRouteResponse;
        if (!r.ok) reason = response.reason ?? `http_${r.status}`;
      } catch (err) {
        reason = `network_failed: ${(err as Error).message}`;
      }

      const first = response?.results?.[0];
      const mu = first?.persona?.mu;
      const real = reason === undefined && response?.mocked === false && first?.mocked !== true && Array.isArray(mu) && mu.length === PERSONA_AXIS_KEYS.length;
      const mocked = !real;
      reason = reason ?? response?.reason ?? first?.reason ?? (mocked ? "no_persona_in_response" : undefined);
      const durable = response?.durable === true;
      const persona = real && first?.persona ? first.persona : null;
      const delta = real && typeof first?.delta_mu === "number" ? first.delta_mu : null;
      const at = clock();

      if (persona) {
        posterior = { mu: [...persona.mu], var: diagOf(persona.Sigma), version: persona.version ?? null, mocked: false, source: "event", at };
      } else {
        // The service did not answer for real. Keep the last mean privately but flag the state, so
        // the inspector shows OFFLINE with the reason rather than a number nothing stands behind.
        posterior = { mu: posterior?.mu ?? zeros(), var: posterior?.var ?? null, version: posterior?.version ?? null, mocked: true, reason, source: "event", at };
      }
      pushLog({
        id: eventId,
        action,
        route: row?.route ?? "behavioral",
        features: row?.features ?? [],
        delta_mu: delta,
        mu: persona ? [...persona.mu] : null,
        version: persona?.version ?? null,
        mocked,
        durable,
        reason: reason ?? response?.durable_reason,
        at,
      });

      return { ok: response?.ok === true && reason === undefined, eventId, event, mocked, durable, reason, persona, delta_mu: delta, response };
    },

    log: () => log.slice(),
    posterior: () => posterior,

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    flush() {
      collector?.flush();
    },

    dispose() {
      if (disposed) return;
      const c = collector;
      collector = null;
      sampler = null;
      c?.stop(); // the final flush, sent if consent is on, as /play does on unmount
      disposed = true;
      listeners.clear();
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────────

const zeros = (): number[] => PERSONA_AXIS_KEYS.map(() => 0);

function rowFor(action: string): ActionRow | undefined {
  return ACTION_AXIS_MAP.find((r) => r.action === action);
}

/**
 * The coarse legacy TelemetryType for a cue, for the envelope's routing field and the stored row's
 * `type` column: the first type CUE_FOR_TYPE maps to that cue (F3 → resource_bet, A4 → dwell),
 * else buildFlow1Event's own default. ingest.py routes on the action label, never on this.
 */
function legacyTypeFor(cue: CueId): TelemetryType {
  for (const [type, m] of Object.entries(CUE_FOR_TYPE) as [TelemetryType, { cue: CueId }][]) {
    if (m.cue === cue) return type;
  }
  return "structure_progress";
}

function diagOf(Sigma: number[][] | undefined): number[] | null {
  if (!Array.isArray(Sigma) || Sigma.length !== PERSONA_AXIS_KEYS.length) return null;
  const d = Sigma.map((row, i) => (Array.isArray(row) && typeof row[i] === "number" ? row[i] : NaN));
  return d.every(Number.isFinite) ? d : null;
}

function posteriorFromSnapshot(snap: PersonaRouteResponse, at: number): Posterior {
  const mu = snap.persona?.mu;
  if (snap.mocked || !Array.isArray(mu) || mu.length !== PERSONA_AXIS_KEYS.length) {
    return { mu: zeros(), var: null, version: null, mocked: true, reason: snap.reason ?? "no_persona_in_response", source: "seed", at };
  }
  const v = Array.isArray(snap.var) && snap.var.length === PERSONA_AXIS_KEYS.length ? [...snap.var] : diagOf(snap.persona?.Sigma);
  return { mu: [...mu], var: v, version: snap.persona?.version ?? null, mocked: false, source: "seed", at };
}

function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `landing-${crypto.randomUUID()}`;
  } catch {
    /* insecure context */
  }
  return `landing-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
