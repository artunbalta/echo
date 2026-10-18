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

import type { Deed, LifeChange, Pack, WorldEffect } from "@echo/planet";

import { adminClient } from "@/lib/supabaseAdmin";

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
  /** The marks on a cell that have not healed by `day` (C45). Null: unreadable. */
  effectsFor(cell: string, day: number): Promise<WorldEffect[] | null>;
  addEffect(cell: string, effect: Omit<WorldEffect, "id">, subject: string): Promise<WorldEffect | null>;
  /** One stranger's deeds in one cell (C45). Null: unreadable. */
  deedsFor(subject: string, cell: string): Promise<Deed[] | null>;
  addDeed(subject: string, cell: string, deed: Omit<Deed, "id">): Promise<Deed | null>;
  /** What a stranger carries (C47). Null: unreadable. An empty pack for someone who has never carried anything. */
  packOf(subject: string): Promise<Pack | null>;
  setPack(subject: string, pack: Pack): Promise<boolean>;
}

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
        .select("id, person, kind, made_day, day, occupation, goal, target, goal_id")
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
          subject,
        })
        .select("id, person, kind, made_day, day, occupation, goal, target, goal_id")
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
        .select("id, verb, kind, thing, thing_name, reading, weight, day, hour, witnesses, owners, item, met")
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
        })
        .select("id, verb, kind, thing, thing_name, reading, weight, day, hour, witnesses, owners, item, met")
        .single();
      if (error) return warn("addDeed", error.message), null;
      return deedFromRow(data as DeedRow);
    },
    async packOf(subject) {
      const { data, error } = await admin.from("player_items").select("pack").eq("subject", subject).maybeSingle();
      if (error) return warn("packOf", error.message), null;
      return (data?.pack as Pack | undefined) ?? {};
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
  memory.next = 1;
}
