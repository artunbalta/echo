/**
 * Where a village's changes and its villagers' memories are kept (DECISIONS C44, migration 0019).
 *
 * TWO BACKENDS, ONE SHAPE. Supabase, through the service role, wherever it is configured; and an
 * in-process store when `VILLAGE_STORE=memory`, for the tests and for a machine whose database is
 * behind — it forgets everything on restart and says so in the log. Neither is chosen silently: with
 * no Supabase and no flag there is no store, and the world is the seed's.
 *
 * FAILURE IS NAMED, NOT SWALLOWED. Every read answers `null` when the store could not be asked (a
 * missing table, a timeout), which callers keep apart from "asked, and there is nothing": a route
 * that cannot read a village's changes must not WRITE one, because it would be deciding against a
 * world it did not see.
 */
import "server-only";

import type { Deed, Home, Landing, LifeChange, Look, Pack, Staging, WorldEffect } from "@echo/planet";

import { adminClient } from "@/lib/supabaseAdmin";
import type { Outing } from "@/lib/echoTypes";

export interface VillagerMemory {
  /** In the villager's words. */
  note: string;
  /** Conversations begun, this one included once it has begun. */
  meetings: number;
  firstDay: number;
  lastDay: number;
}

export interface VillageStore {
  readonly kind: "supabase" | "memory";
  /** Every change for a cell, in the order made. Null: the store could not be read. */
  changesFor(cell: string): Promise<LifeChange[] | null>;
  /** Record a change. Null: it was not recorded. */
  addChange(cell: string, change: Omit<LifeChange, "id">, subject: string): Promise<LifeChange | null>;
  /** What this villager remembers of this stranger: a memory, nothing (never met), or null (unreadable). */
  memoryOf(subject: string, cell: string, person: string): Promise<VillagerMemory | "none" | null>;
  remember(subject: string, cell: string, person: string, memory: VillagerMemory): Promise<boolean>;
  forget(subject: string, cell: string, person: string): Promise<boolean>;
  /** Everyone, in every village, this stranger has talked to (C53): newest first, at most `limit`. Null: unreadable. */
  metBy(subject: string, limit: number): Promise<{ cell: string; person: string; meetings: number; lastDay: number }[] | null>;
  /** The marks on a cell that have not healed by `day` (C45). Null: unreadable. */
  effectsFor(cell: string, day: number): Promise<WorldEffect[] | null>;
  addEffect(cell: string, effect: Omit<WorldEffect, "id">, subject: string): Promise<WorldEffect | null>;
  /** One stranger's deeds in one cell (C45). Null: unreadable. */
  deedsFor(subject: string, cell: string): Promise<Deed[] | null>;
  addDeed(subject: string, cell: string, deed: Omit<Deed, "id">): Promise<Deed | null>;
  /** What a stranger carries (C47). Null: unreadable. An empty pack for someone who has never carried anything. */
  packOf(subject: string): Promise<Pack | null>;
  setPack(subject: string, pack: Pack): Promise<boolean>;
  /** Where one stranger has come ashore from the sea in one cell (C57), oldest first. Null: unreadable. */
  landingsIn(subject: string, cell: string): Promise<Landing[] | null>;
  addLanding(subject: string, cell: string, landing: Omit<Landing, "id">): Promise<Landing | null>;
  /** A stranger's own house (C59): theirs, wherever it is; null for none, undefined when unreadable. */
  homeOf(subject: string): Promise<Home | null | undefined>;
  /** The house on a parcel, whoever's it is (a parcel has one owner). Never says whose. */
  homeIn(cell: string): Promise<Home | null | undefined>;
  saveHome(subject: string, home: Home): Promise<boolean>;
  /** A stranger's own look (C59): {} for none yet, null when unreadable. */
  lookOf(subject: string): Promise<Look | null>;
  setLook(subject: string, look: Look): Promise<boolean>;
  /** What the director has set out for a stranger (C63), newest first, the last 50. Null: unreadable. */
  stagingsOf(subject: string): Promise<Staging[] | null>;
  /** Write one, new or answered. */
  saveStaging(s: Staging): Promise<boolean>;
  /** When and where a stranger was last in the world (C64): null for never, undefined when unreadable. */
  seenOf(subject: string): Promise<{ at: string; cell: string } | null | undefined>;
  markSeen(subject: string, cell: string, at: string): Promise<boolean>;
  /** The echo's outings for a stranger (C64), newest first, the last 10. Null: unreadable. */
  outingsOf(subject: string): Promise<Outing[] | null>;
  saveOuting(o: Outing): Promise<boolean>;
}

interface OutingRow {
  id: string;
  subject: string;
  cell: string | null;
  village: string | null;
  away_from: string;
  away_to: string;
  made_at: string;
  read_at: string | null;
  encounters: Outing["encounters"] | null;
  waits: Outing["waits"];
  reason: string | null;
}

const outingFromRow = (r: OutingRow): Outing => ({
  id: r.id,
  subject: r.subject,
  cell: r.cell,
  village: r.village,
  awayFrom: new Date(r.away_from).toISOString(),
  awayTo: new Date(r.away_to).toISOString(),
  madeAt: new Date(r.made_at).toISOString(),
  readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
  encounters: r.encounters ?? [],
  waits: r.waits ?? null,
  reason: r.reason,
});

const STAGING_COLUMNS = "id, subject, cell, situation, x, y, facing, owner, owner_name, info_gain, created_at, resolved, resolved_at";

interface StagingRow {
  id: string;
  subject: string;
  cell: string;
  situation: Staging["situation"];
  x: number;
  y: number;
  facing: number;
  owner: string | null;
  owner_name: string | null;
  info_gain: number | null;
  created_at: string;
  resolved: string | null;
  resolved_at: string | null;
}

const stagingFromRow = (r: StagingRow): Staging => ({
  id: r.id,
  subject: r.subject,
  cell: r.cell,
  situation: r.situation,
  x: r.x,
  y: r.y,
  facing: r.facing,
  owner: r.owner,
  ownerName: r.owner_name,
  infoGain: r.info_gain,
  createdAt: new Date(r.created_at).toISOString(),
  resolved: r.resolved,
  resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
});

interface HomeRow {
  cell: string;
  x: number;
  y: number;
  facing: number;
  stage: number;
  colours: Home["colours"] | null;
  items: Home["items"] | null;
  made_day: number;
}
const homeFromRow = (r: HomeRow): Home => ({ cell: r.cell, x: r.x, y: r.y, facing: r.facing, stage: r.stage, colours: r.colours ?? {}, items: r.items ?? [], madeDay: r.made_day });
const HOME_COLUMNS = "cell, x, y, facing, stage, colours, items, made_day";

interface LandingRow {
  id: number;
  from_cell: string;
  from_name: string | null;
  side: Landing["side"];
  rings: number;
  day: number;
  hour: number;
  witnesses: string[];
}
const landingFromRow = (r: LandingRow): Landing => ({ id: `l${r.id}`, fromCell: r.from_cell, fromName: r.from_name, side: r.side, rings: r.rings, day: r.day, hour: r.hour, witnesses: r.witnesses ?? [] });

interface EffectRow {
  id: number;
  thing: string;
  kind: WorldEffect["kind"];
  day: number;
  until_day: number;
}
const effectFromRow = (r: EffectRow): WorldEffect => ({ id: `e${r.id}`, thing: r.thing, kind: r.kind, day: r.day, untilDay: r.until_day });

interface DeedRow {
  id: number;
  verb: string;
  kind: string;
  thing: string;
  thing_name: string;
  reading: Deed["reading"];
  weight: Deed["weight"];
  day: number;
  hour: number;
  witnesses: string[];
  owners: string[];
  item?: string | null;
  met?: string[] | null;
  got?: string | null;
}
const deedFromRow = (r: DeedRow): Deed => ({
  id: `d${r.id}`,
  verb: r.verb,
  kind: r.kind,
  thing: r.thing,
  thingName: r.thing_name,
  reading: r.reading,
  weight: r.weight,
  day: r.day,
  hour: r.hour,
  witnesses: r.witnesses ?? [],
  owners: r.owners ?? [],
  ...(r.item ? { item: r.item } : {}),
  ...(r.met && r.met.length > 0 ? { met: r.met } : {}),
  ...(r.got ? { got: r.got } : {}),
});

/** Ids are compared as strings in `byMade`, so they are padded to sort the way they were made. */
const changeId = (n: number | string) => `c${String(n).padStart(12, "0")}`;

interface ChangeRow {
  id: number;
  person: string;
  kind: LifeChange["kind"];
  made_day: number;
  day: number;
  occupation: string | null;
  goal: string | null;
  target: string | null;
  goal_id: string | null;
  to_cell?: string | null;
  from_cell?: string | null;
  spec?: LifeChange["spec"] | null;
  by?: LifeChange["by"] | null;
}

function fromRow(r: ChangeRow): LifeChange {
  return {
    id: changeId(r.id),
    person: r.person,
    kind: r.kind,
    madeDay: r.made_day,
    day: r.day,
    ...(r.occupation ? { occupation: r.occupation as LifeChange["occupation"] } : {}),
    ...(r.goal ? { goal: r.goal as LifeChange["goal"] } : {}),
    ...(r.target ? { target: r.target } : {}),
    ...(r.goal_id ? { goalId: r.goal_id } : {}),
    ...(r.to_cell ? { toCell: r.to_cell } : {}),
    ...(r.from_cell ? { fromCell: r.from_cell } : {}),
    ...(r.spec ? { spec: r.spec } : {}),
    ...(r.by ? { by: r.by } : {}),
  };
}

function supabaseStore(): VillageStore | null {
  const admin = adminClient();
  if (!admin) return null;
  const warn = (what: string, message: string) => console.warn(`[village-store] ${what} failed: ${message}`);
  return {
    kind: "supabase",
    async changesFor(cell) {
      const { data, error } = await admin
        .from("village_changes")
        .select("id, person, kind, made_day, day, occupation, goal, target, goal_id, to_cell, from_cell, spec, by")
        .eq("cell", cell)
        .order("id", { ascending: true })
        .limit(5000);
      if (error) return warn("changesFor", error.message), null;
      return (data as ChangeRow[]).map(fromRow);
    },
    async addChange(cell, c, subject) {
      const { data, error } = await admin
        .from("village_changes")
        .insert({
          cell,
          person: c.person,
          kind: c.kind,
          made_day: c.madeDay,
          day: c.day,
          occupation: c.occupation ?? null,
          goal: c.goal ?? null,
          target: c.target ?? null,
          goal_id: c.goalId ?? null,
          to_cell: c.toCell ?? null,
          from_cell: c.fromCell ?? null,
          spec: c.spec ?? null,
          ...(c.by ? { by: c.by } : {}),
          subject,
        })
        .select("id, person, kind, made_day, day, occupation, goal, target, goal_id, to_cell, from_cell, spec, by")
        .single();
      if (error) return warn("addChange", error.message), null;
      return fromRow(data as ChangeRow);
    },
    async memoryOf(subject, cell, person) {
      const { data, error } = await admin
        .from("villager_memories")
        .select("note, meetings, first_day, last_day")
        .eq("subject", subject)
        .eq("cell", cell)
        .eq("person", person)
        .maybeSingle();
      if (error) return warn("memoryOf", error.message), null;
      if (!data) return "none";
      return { note: data.note, meetings: data.meetings, firstDay: data.first_day, lastDay: data.last_day };
    },
    async remember(subject, cell, person, m) {
      const { error } = await admin.from("villager_memories").upsert(
        { subject, cell, person, note: m.note, meetings: m.meetings, first_day: m.firstDay, last_day: m.lastDay, updated_at: new Date().toISOString() },
        { onConflict: "subject,cell,person" },
      );
      if (error) return warn("remember", error.message), false;
      return true;
    },
    async forget(subject, cell, person) {
      const { error } = await admin.from("villager_memories").delete().eq("subject", subject).eq("cell", cell).eq("person", person);
      if (error) return warn("forget", error.message), false;
      return true;
    },
    async metBy(subject, limit) {
      const { data, error } = await admin
        .from("villager_memories")
        .select("cell, person, meetings, last_day")
        .eq("subject", subject)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) return warn("metBy", error.message), null;
      return (data as { cell: string; person: string; meetings: number; last_day: number }[]).map((r) => ({ cell: r.cell, person: r.person, meetings: r.meetings, lastDay: r.last_day }));
    },
    async effectsFor(cell, day) {
      const { data, error } = await admin
        .from("world_effects")
        .select("id, thing, kind, day, until_day")
        .eq("cell", cell)
        .gt("until_day", day)
        .order("id", { ascending: true })
        .limit(5000);
      if (error) return warn("effectsFor", error.message), null;
      return (data as EffectRow[]).map(effectFromRow);
    },
    async addEffect(cell, e, subject) {
      const { data, error } = await admin
        .from("world_effects")
        .insert({ cell, thing: e.thing, kind: e.kind, day: e.day, until_day: e.untilDay, subject })
        .select("id, thing, kind, day, until_day")
        .single();
      if (error) return warn("addEffect", error.message), null;
      return effectFromRow(data as EffectRow);
    },
    async deedsFor(subject, cell) {
      const { data, error } = await admin
        .from("village_deeds")
        .select("id, verb, kind, thing, thing_name, reading, weight, day, hour, witnesses, owners, item, met, got")
        .eq("subject", subject)
        .eq("cell", cell)
        .order("id", { ascending: true })
        .limit(2000);
      if (error) return warn("deedsFor", error.message), null;
      return (data as DeedRow[]).map(deedFromRow);
    },
    async addDeed(subject, cell, d) {
      const { data, error } = await admin
        .from("village_deeds")
        .insert({
          subject,
          cell,
          verb: d.verb,
          kind: d.kind,
          thing: d.thing,
          thing_name: d.thingName,
          reading: d.reading,
          weight: d.weight,
          day: d.day,
          hour: d.hour,
          witnesses: d.witnesses,
          owners: d.owners,
          item: d.item ?? null,
          met: d.met && d.met.length > 0 ? d.met : null,
          got: d.got ?? null,
        })
        .select("id, verb, kind, thing, thing_name, reading, weight, day, hour, witnesses, owners, item, met, got")
        .single();
      if (error) return warn("addDeed", error.message), null;
      return deedFromRow(data as DeedRow);
    },
    async packOf(subject) {
      const { data, error } = await admin.from("player_items").select("pack").eq("subject", subject).maybeSingle();
      if (error) return warn("packOf", error.message), null;
      return (data?.pack as Pack | undefined) ?? {};
    },
    async landingsIn(subject, cell) {
      const { data, error } = await admin
        .from("player_landings")
        .select("id, from_cell, from_name, side, rings, day, hour, witnesses")
        .eq("subject", subject)
        .eq("cell", cell)
        .order("id", { ascending: true })
        .limit(200);
      if (error) return warn("landingsIn", error.message), null;
      return (data as LandingRow[]).map(landingFromRow);
    },
    async homeOf(subject) {
      const { data, error } = await admin.from("player_homes").select(HOME_COLUMNS).eq("subject", subject).maybeSingle();
      if (error) return warn("homeOf", error.message), undefined;
      return data ? homeFromRow(data as HomeRow) : null;
    },
    async homeIn(cell) {
      const { data, error } = await admin.from("player_homes").select(HOME_COLUMNS).eq("cell", cell).limit(1).maybeSingle();
      if (error) return warn("homeIn", error.message), undefined;
      return data ? homeFromRow(data as HomeRow) : null;
    },
    async saveHome(subject, h) {
      const { error } = await admin
        .from("player_homes")
        .upsert({ subject, cell: h.cell, x: h.x, y: h.y, facing: h.facing, stage: h.stage, colours: h.colours, items: h.items, made_day: h.madeDay, updated_at: new Date().toISOString() }, { onConflict: "subject" });
      if (error) return warn("saveHome", error.message), false;
      return true;
    },
    async lookOf(subject) {
      const { data, error } = await admin.from("player_looks").select("look").eq("subject", subject).maybeSingle();
      if (error) return warn("lookOf", error.message), null;
      return (data?.look as Look | undefined) ?? {};
    },
    async setLook(subject, look) {
      const { error } = await admin.from("player_looks").upsert({ subject, look, updated_at: new Date().toISOString() }, { onConflict: "subject" });
      if (error) return warn("setLook", error.message), false;
      return true;
    },
    async seenOf(subject) {
      const { data, error } = await admin.from("player_presence").select("last_seen_at, last_cell").eq("subject", subject).maybeSingle();
      if (error) return warn("seenOf", error.message), undefined;
      return data ? { at: new Date(data.last_seen_at as string).toISOString(), cell: data.last_cell as string } : null;
    },
    async markSeen(subject, cell, at) {
      const { error } = await admin.from("player_presence").upsert({ subject, last_cell: cell, last_seen_at: at }, { onConflict: "subject" });
      if (error) return warn("markSeen", error.message), false;
      return true;
    },
    async outingsOf(subject) {
      const { data, error } = await admin.from("echo_outings").select("id, subject, cell, village, away_from, away_to, made_at, read_at, encounters, waits, reason").eq("subject", subject).order("made_at", { ascending: false }).limit(10);
      if (error) return warn("outingsOf", error.message), null;
      return (data as OutingRow[]).map(outingFromRow);
    },
    async saveOuting(o) {
      const { error } = await admin.from("echo_outings").upsert(
        { id: o.id, subject: o.subject, cell: o.cell, village: o.village, away_from: o.awayFrom, away_to: o.awayTo, made_at: o.madeAt, read_at: o.readAt, encounters: o.encounters, waits: o.waits, reason: o.reason },
        { onConflict: "id" },
      );
      if (error) return warn("saveOuting", error.message), false;
      return true;
    },
    async stagingsOf(subject) {
      const { data, error } = await admin.from("player_stagings").select(STAGING_COLUMNS).eq("subject", subject).order("created_at", { ascending: false }).limit(50);
      if (error) return warn("stagingsOf", error.message), null;
      return (data as StagingRow[]).map(stagingFromRow);
    },
    async saveStaging(st) {
      const { error } = await admin.from("player_stagings").upsert(
        {
          id: st.id,
          subject: st.subject,
          cell: st.cell,
          situation: st.situation,
          x: st.x,
          y: st.y,
          facing: st.facing,
          owner: st.owner,
          owner_name: st.ownerName,
          info_gain: st.infoGain,
          created_at: st.createdAt,
          resolved: st.resolved,
          resolved_at: st.resolvedAt,
        },
        { onConflict: "id" },
      );
      if (error) return warn("saveStaging", error.message), false;
      return true;
    },
    async addLanding(subject, cell, l) {
      const { data, error } = await admin
        .from("player_landings")
        .insert({ subject, cell, from_cell: l.fromCell, from_name: l.fromName, side: l.side, rings: l.rings, day: l.day, hour: l.hour, witnesses: l.witnesses })
        .select("id, from_cell, from_name, side, rings, day, hour, witnesses")
        .single();
      if (error) return warn("addLanding", error.message), null;
      return landingFromRow(data as LandingRow);
    },
    async setPack(subject, pack) {
      const { error } = await admin.from("player_items").upsert({ subject, pack, updated_at: new Date().toISOString() }, { onConflict: "subject" });
      if (error) return warn("setPack", error.message), false;
      return true;
    },
  };
}

/**
 * The in-process store. On `globalThis`, not module-level: Next compiles each route on its own in
 * development, so a module-level map would be one store per route — the talk route would record a
 * change the changes route had never heard of. It lives as long as the server process and no longer.
 */
interface MemoryState {
  changes: Map<string, LifeChange[]>;
  memories: Map<string, VillagerMemory>;
  effects?: Map<string, WorldEffect[]>;
  deeds?: Map<string, Deed[]>;
  packs?: Map<string, Pack>;
  landings?: Map<string, Landing[]>;
  homes?: Map<string, Home>;
  looks?: Map<string, Look>;
  stagings?: Map<string, Staging[]>;
  presence?: Map<string, { at: string; cell: string }>;
  outings?: Map<string, Outing[]>;
  next: number;
}
const shared = globalThis as typeof globalThis & { __echoVillageStore?: MemoryState };
const memory: MemoryState = (shared.__echoVillageStore ??= { changes: new Map(), memories: new Map(), next: 1 });

function memoryStore(): VillageStore {
  const key = (subject: string, cell: string, person: string) => `${subject}|${cell}|${person}`;
  return {
    kind: "memory",
    async changesFor(cell) {
      return [...(memory.changes.get(cell) ?? [])];
    },
    async addChange(cell, c) {
      const change: LifeChange = { ...c, id: changeId(memory.next++) };
      memory.changes.set(cell, [...(memory.changes.get(cell) ?? []), change]);
      return change;
    },
    async memoryOf(subject, cell, person) {
      return memory.memories.get(key(subject, cell, person)) ?? "none";
    },
    async remember(subject, cell, person, m) {
      memory.memories.set(key(subject, cell, person), { ...m });
      return true;
    },
    async forget(subject, cell, person) {
      memory.memories.delete(key(subject, cell, person));
      return true;
    },
    async metBy(subject, limit) {
      const out: { cell: string; person: string; meetings: number; lastDay: number }[] = [];
      for (const [k, m] of memory.memories) {
        const [sub, cell, person] = k.split("|");
        if (sub === subject) out.push({ cell, person, meetings: m.meetings, lastDay: m.lastDay });
      }
      return out.sort((a, b) => b.lastDay - a.lastDay).slice(0, limit);
    },
    async effectsFor(cell, day) {
      return (memory.effects?.get(cell) ?? []).filter((e) => e.untilDay > day);
    },
    async addEffect(cell, e) {
      const effect: WorldEffect = { ...e, id: `e${memory.next++}` };
      memory.effects ??= new Map();
      memory.effects.set(cell, [...(memory.effects.get(cell) ?? []), effect]);
      return effect;
    },
    async deedsFor(subject, cell) {
      return [...(memory.deeds?.get(`${subject}|${cell}`) ?? [])];
    },
    async addDeed(subject, cell, d) {
      const deed: Deed = { ...d, id: `d${memory.next++}` };
      memory.deeds ??= new Map();
      memory.deeds.set(`${subject}|${cell}`, [...(memory.deeds.get(`${subject}|${cell}`) ?? []), deed]);
      return deed;
    },
    async packOf(subject) {
      return { ...(memory.packs?.get(subject) ?? {}) };
    },
    async setPack(subject, pack) {
      memory.packs ??= new Map();
      memory.packs.set(subject, { ...pack });
      return true;
    },
    async landingsIn(subject, cell) {
      return [...(memory.landings?.get(`${subject}|${cell}`) ?? [])];
    },
    async homeOf(subject) {
      const h = memory.homes?.get(subject);
      return h ? structuredClone(h) : null;
    },
    async homeIn(cell) {
      for (const h of memory.homes?.values() ?? []) if (h.cell === cell) return structuredClone(h);
      return null;
    },
    async saveHome(subject, h) {
      memory.homes ??= new Map();
      memory.homes.set(subject, structuredClone(h));
      return true;
    },
    async seenOf(subject) {
      const p = memory.presence?.get(subject);
      return p ? { ...p } : null;
    },
    async markSeen(subject, cell, at) {
      memory.presence ??= new Map();
      memory.presence.set(subject, { at, cell });
      return true;
    },
    async outingsOf(subject) {
      return (memory.outings?.get(subject) ?? []).map((x) => structuredClone(x)).sort((a, b) => b.madeAt.localeCompare(a.madeAt)).slice(0, 10);
    },
    async saveOuting(o) {
      memory.outings ??= new Map();
      const list = (memory.outings.get(o.subject) ?? []).filter((x) => x.id !== o.id);
      memory.outings.set(o.subject, [...list, structuredClone(o)]);
      return true;
    },
    async stagingsOf(subject) {
      return (memory.stagings?.get(subject) ?? []).map((x) => structuredClone(x)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    },
    async saveStaging(st) {
      memory.stagings ??= new Map();
      const list = (memory.stagings.get(st.subject) ?? []).filter((x) => x.id !== st.id);
      memory.stagings.set(st.subject, [...list, structuredClone(st)]);
      return true;
    },
    async lookOf(subject) {
      return { ...(memory.looks?.get(subject) ?? {}) };
    },
    async setLook(subject, look) {
      memory.looks ??= new Map();
      memory.looks.set(subject, { ...look });
      return true;
    },
    async addLanding(subject, cell, l) {
      const landing: Landing = { ...l, id: `l${memory.next++}` };
      memory.landings ??= new Map();
      memory.landings.set(`${subject}|${cell}`, [...(memory.landings.get(`${subject}|${cell}`) ?? []), landing]);
      return landing;
    },
  };
}

let announced = false;

/** The store for this process, or null when there is none to use. */
export function villageStore(): VillageStore | null {
  if (process.env.VILLAGE_STORE === "memory") {
    if (!announced) {
      announced = true;
      console.warn("[village-store] VILLAGE_STORE=memory: changes and memories live in this process and are lost on restart");
    }
    return memoryStore();
  }
  return supabaseStore();
}

/** For tests: empty the in-process store. */
export function resetMemoryStore(): void {
  memory.changes.clear();
  memory.memories.clear();
  memory.effects?.clear();
  memory.deeds?.clear();
  memory.packs?.clear();
  memory.landings?.clear();
  memory.homes?.clear();
  memory.stagings?.clear();
  memory.presence?.clear();
  memory.outings?.clear();
  memory.looks?.clear();
  memory.next = 1;
}
