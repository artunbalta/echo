/**
 * `POST /api/v1/audit`, without the route (DECISIONS C90): what a request must look like, its limits,
 * and the answer. Kept here because a Next route file may export only its handlers.
 *
 * STATELESS. A panel comes in, an audit goes out, and nothing of either is kept: no storage, no log of
 * a body, no account. The same `audit()` the browser runs (./audit.ts) does the work.
 *
 * A table may be sent as JSON (`{ ids, columns, values }`, null for a missing answer) or as the text of
 * the CSV it would be dropped as on `/audit`. That keeps a first call to one line of `jq` and `curl`.
 *
 * THE LIMITS are what one function can do in its time, said plainly when crossed: a body of 4 MB,
 * 5,000 people, 400 items, 20 twins.
 */
import { AuditError, audit, panelOf, type AuditOptions, type Item, type Items, type Table } from "./audit";
import { fromHere } from "@/lib/fromHere";
import { CsvError, itemsFromCsv, tableFromCsv } from "./csv";

export const AUDIT_LIMITS = { bytes: 4_000_000, people: 5000, items: 400, twins: 20, bootDraws: 5000 } as const;

export interface ApiReply {
  status: number;
  body: unknown;
}

/** A request this endpoint will not serve, and the status that says why. */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function tableOf(v: unknown, name: string): Table {
  if (typeof v === "string") return tableFromCsv(v, name);
  if (!isRecord(v) || !Array.isArray(v.ids) || !Array.isArray(v.columns) || !Array.isArray(v.values)) {
    throw new Refused(400, `${name} must be a table { ids, columns, values }, or the text of a CSV.`);
  }
  const ids = v.ids.map((id, i) => {
    if (typeof id !== "string" && typeof id !== "number") throw new Refused(400, `${name}.ids[${i}] must be a string or a number.`);
    return String(id);
  });
  const columns = v.columns.map((c, j) => {
    if (typeof c !== "string" || !c) throw new Refused(400, `${name}.columns[${j}] must be an item's name.`);
    return c;
  });
  if (v.values.length !== ids.length) throw new Refused(400, `${name} has ${ids.length} ids and ${v.values.length} rows of values.`);
  const values = v.values.map((row, i) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Refused(400, `${name}.values[${i}] (person "${ids[i]}") must be a row of ${columns.length} cells, one per column.`);
    }
    return row.map((cell, j) => {
      if (cell === null) return null;
      if (typeof cell !== "number" || !Number.isFinite(cell)) {
        throw new Refused(400, `${name}.values[${i}][${j}] (person "${ids[i]}", column "${columns[j]}") is ${JSON.stringify(cell)}. A cell is a number, or null for a missing answer.`);
      }
      return cell;
    });
  });
  return { ids, columns, values };
}

function itemsOf(v: unknown): Items {
  if (typeof v === "string") return itemsFromCsv(v, "items");
  if (!Array.isArray(v)) throw new Refused(400, "items must be a list of { item, group, lo, hi }, or the text of a CSV with those columns.");
  return v.map((it, i): Item => {
    if (!isRecord(it) || (typeof it.item !== "string" && typeof it.item !== "number") || it.item === "") throw new Refused(400, `items[${i}] needs an item name.`);
    if (typeof it.group !== "string" && typeof it.group !== "number") throw new Refused(400, `items[${i}] ("${it.item}") needs a group.`);
    if (typeof it.lo !== "number" || typeof it.hi !== "number" || !(it.hi > it.lo)) {
      throw new Refused(400, `items[${i}] ("${it.item}") needs numbers lo and hi, the ends of its scale, with hi above lo.`);
    }
    return { item: String(it.item), group: String(it.group), lo: it.lo, hi: it.hi };
  });
}

function over(what: string, got: number, limit: number): never {
  throw new Refused(413, `Too large for this endpoint: ${got.toLocaleString("en-US")} ${what}, and the limit is ${limit.toLocaleString("en-US")}. The audit at /audit runs in your browser and has no such limit.`);
}

/** The audit for a parsed request body. Every refusal is a status and one plain sentence. */
export function auditReply(body: unknown): ApiReply {
  try {
    if (!isRecord(body)) throw new Refused(400, "The body must be a JSON object { items, truth, earlier, twins }.");
    for (const k of ["items", "truth", "earlier", "twins"]) if (body[k] === undefined) throw new Refused(400, `The body has no "${k}". It needs items, truth, earlier and twins.`);
    if (!isRecord(body.twins)) throw new Refused(400, "twins must be an object: each twin's name, and its table of predictions.");
    const names = Object.keys(body.twins);
    if (!names.length) throw new Refused(400, "twins is empty. Send at least one twin's predictions.");
    if (names.length > AUDIT_LIMITS.twins) over("twins", names.length, AUDIT_LIMITS.twins);
    const items = itemsOf(body.items);
    if (items.length > AUDIT_LIMITS.items) over("items", items.length, AUDIT_LIMITS.items);
    const truth = tableOf(body.truth, "truth");
    const earlier = tableOf(body.earlier, "earlier");
    for (const [name, t] of [["truth", truth], ["earlier", earlier]] as const) {
      if (t.ids.length > AUDIT_LIMITS.people) over(`people in ${name}`, t.ids.length, AUDIT_LIMITS.people);
      if (t.columns.length > AUDIT_LIMITS.items) over(`columns in ${name}`, t.columns.length, AUDIT_LIMITS.items);
    }
    const twins: Record<string, Table> = Object.fromEntries(
      names.map((name) => {
        const t = tableOf((body.twins as Record<string, unknown>)[name], `twins["${name}"]`);
        if (t.ids.length > AUDIT_LIMITS.people) over(`people in twins["${name}"]`, t.ids.length, AUDIT_LIMITS.people);
        if (t.columns.length > 2 * AUDIT_LIMITS.items) over(`columns in twins["${name}"]`, t.columns.length, 2 * AUDIT_LIMITS.items);
        return [name, t];
      }),
    );
    const opts: AuditOptions = {};
    if (body.seed !== undefined) {
      if (typeof body.seed !== "number" || !Number.isInteger(body.seed)) throw new Refused(400, "seed must be a whole number.");
      opts.seed = body.seed;
    }
    if (body.bootDraws !== undefined) {
      if (typeof body.bootDraws !== "number" || !Number.isInteger(body.bootDraws) || body.bootDraws < 100 || body.bootDraws > AUDIT_LIMITS.bootDraws) {
        throw new Refused(400, `bootDraws must be a whole number from 100 to ${AUDIT_LIMITS.bootDraws}.`);
      }
      opts.bootDraws = body.bootDraws;
    }
    if (body.folds !== undefined) {
      if (!Array.isArray(body.folds) || body.folds.some((f) => typeof f !== "number" || !Number.isInteger(f))) throw new Refused(400, "folds must be a list of whole numbers, one per person in the panel.");
      opts.folds = body.folds as number[];
    }
    const result = audit(panelOf(truth, earlier, items), twins, opts);
    // JSON has no NaN: a value that cannot be said (a share of the knowable when nothing is knowable) is null
    return { status: 200, body: JSON.parse(JSON.stringify(result)) };
  } catch (err) {
    if (err instanceof Refused) return { status: err.status, body: { error: err.message } };
    if (err instanceof AuditError || err instanceof CsvError) return { status: 400, body: { error: err.message } };
    return { status: 500, body: { error: "The audit failed on this input. Nothing was kept." } };
  }
}

/** The request's text, or null once it passes the limit: a body is never read past it. */
export async function textWithin(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** `POST /api/v1/audit`, from the raw request. */
export async function auditPost(req: Request): Promise<ApiReply> {
  // Declared as JSON, and not sent from another site's page (`lib/fromHere.ts`): an audit is real work
  // for the server, and a form on someone else's site must not be able to make its visitors ask for it.
  if (!fromHere(req)) return { status: 415, body: { error: "Send the body as JSON, with content-type application/json." } };
  const text = await textWithin(req, AUDIT_LIMITS.bytes);
  if (text === null) return { status: 413, body: { error: `Too large for this endpoint: the body is over ${AUDIT_LIMITS.bytes / 1_000_000} MB. The audit at /audit runs in your browser and has no such limit.` } };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: "The body is not JSON. Send { items, truth, earlier, twins } with content-type application/json." } };
  }
  return auditReply(body);
}

/** `GET /api/v1/audit`: what to send. */
export function auditDescription() {
  return {
    name: "Twin audit",
    what: "What a digital twin knows about individuals: its accuracy against the crowd's median answer, and its share of what is knowable about a person, between the crowd (0) and the ceiling set by each item's test-retest reliability (1).",
    method: "POST",
    contentType: "application/json",
    request: {
      items: "[{ item, group, lo, hi }]: each item's name, the group it is averaged in, and the ends of its scale. Or the text of a CSV with those columns.",
      truth: "{ ids, columns, values }: the answers to predict (the later wave). One row per person, one column per item, null for a missing answer. Or the text of a CSV with the person's id in the first column.",
      earlier: "The same people's earlier answers to the same items, in the same layout.",
      twins: "{ name: table }: each twin's predictions, in the same layout. Cells a twin did not answer are null and are not scored.",
      seed: "Optional whole number: the folds and the bootstrap.",
      bootDraws: `Optional, 100 to ${AUDIT_LIMITS.bootDraws}; default 2000.`,
    },
    response: "{ people, items, groups, ceiling: { overall, by_group }, twins: { name: { people, accuracy, crowd, retest, with_one_look, vs_crowd, vs_crowd_ci95, one_look_gain, one_look_gain_ci95, r, r_retest, r_with_one_look, knows, knows_with_one_look, knows_retest } } }",
    limits: { bodyBytes: AUDIT_LIMITS.bytes, people: AUDIT_LIMITS.people, items: AUDIT_LIMITS.items, twins: AUDIT_LIMITS.twins },
    kept: "Nothing. The request is not stored and its body is not logged.",
    inTheBrowser: "/audit runs the same audit in your browser, where nothing is sent at all.",
    code: "research/deeds/audit.py in github.com/artunbalta/echo",
  };
}
