/**
 * The CSVs a twin audit is brought in (DECISIONS C90), read with care and refused in plain words.
 *
 * The layout is `research/deeds/audit.py`'s: a wide table per file, a person id in the first column,
 * one column per item; and an items file with the columns item, group, lo, hi.
 *
 * WHY ITS OWN PARSER. The files are a stranger's export, read in their browser with no library. What a
 * spreadsheet really writes is handled: a byte-order mark, CRLF, quoted fields with commas, quotes
 * and line breaks inside, blank lines, and the semicolon files (with decimal commas) that Excel
 * writes in much of Europe. An empty cell, or NA, is a missing answer. Anything else that is not a
 * number stops the read, with the file, the row, the person and the column of the FIRST bad cell, so
 * the person who brought the file can find it.
 *
 * Pure.
 */
import type { Item, Items, Table } from "./audit";

/** A file that cannot be read as it stands; the message says where. */
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "#n/a", "<na>"]);

/** The separator the header line uses most, outside quotes: comma, semicolon or tab. */
function separatorOf(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  return counts[";"]! > counts[","]! && counts[";"]! >= counts["\t"]! ? ";" : counts["\t"]! > counts[","]! ? "\t" : ",";
}

/** The rows of a CSV, each a list of fields as written, and the line each began on. Empty rows are dropped. */
export function parseCsv(text: string, name = "The file"): { rows: string[][]; lines: number[]; separator: string } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const separator = separatorOf(src);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let line = 1;
  let began = 1;
  let openedAt = 0;
  const endField = () => {
    row.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
      lines.push(began);
    }
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === "") {
      quoted = true;
      wasQuoted = true;
      field = "";
      openedAt = line;
    } else if (ch === separator) endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      began = line;
    } else if (!wasQuoted || ch.trim() !== "") field += ch;
  }
  if (quoted) throw new CsvError(`${name}: a quoted field opened on line ${openedAt} is never closed.`);
  if (field !== "" || row.length || wasQuoted) endRow();
  return { rows, lines, separator };
}

function numberOf(cell: string, decimalComma: boolean): number | null | undefined {
  if (MISSING.has(cell.toLowerCase())) return null;
  const text = decimalComma && /^[-+]?\d*,\d+$/.test(cell) ? cell.replace(",", ".") : cell;
  // One way to read each character, so a long run of digits is read once: `\d+\.?\d*` let the two
  // runs trade digits and took 26 s on a 160 KB cell that then failed to match.
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return undefined;
  const v = Number(text);
  return Number.isFinite(v) ? v : undefined;
}

/** A wide table: the first column is the person's id, the rest are items. */
export function tableFromCsv(text: string, name = "The file"): Table {
  const { rows, lines, separator } = parseCsv(text, name);
  const header = rows[0];
  if (!header || header.length < 2) throw new CsvError(`${name}: it needs a header row with a person id column and at least one item column.`);
  const columns = header.slice(1);
  const blank = columns.findIndex((c) => c === "");
  if (blank >= 0) throw new CsvError(`${name}: column ${blank + 2} has no name in the header row.`);
  const seenColumn = new Set<string>();
  for (const c of columns) {
    if (seenColumn.has(c)) throw new CsvError(`${name}: the column "${c}" appears twice.`);
    seenColumn.add(c);
  }
  if (rows.length < 2) throw new CsvError(`${name}: there are no rows under the header.`);
  const ids: string[] = [];
  const values: (number | null)[][] = [];
  const seenId = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const at = lines[r]!;
    const id = cells[0]!;
    if (id === "") throw new CsvError(`${name}: row ${at} has no person id in its first column.`);
    if (cells.length !== header.length) {
      throw new CsvError(`${name}: row ${at} (person "${id}") has ${cells.length} cells where the header has ${header.length}.`);
    }
    if (seenId.has(id)) throw new CsvError(`${name}: the person "${id}" appears twice (the second time on row ${at}).`);
    seenId.add(id);
    const out: (number | null)[] = new Array(columns.length);
    for (let j = 0; j < columns.length; j++) {
      const v = numberOf(cells[j + 1]!, separator !== ",");
      if (v === undefined) {
        throw new CsvError(`${name}: row ${at} (person "${id}"), column "${columns[j]}": "${cells[j + 1]}" is not a number. Leave a cell empty for a missing answer.`);
      }
      out[j] = v;
    }
    ids.push(id);
    values.push(out);
  }
  return { ids, columns, values };
}

/** The items file: item, group, lo, hi (in any order; other columns are ignored). */
export function itemsFromCsv(text: string, name = "The items file"): Items {
  const { rows, lines, separator } = parseCsv(text, name);
  const header = (rows[0] ?? []).map((h) => h.toLowerCase());
  const at = { item: header.indexOf("item"), group: header.indexOf("group"), lo: header.indexOf("lo"), hi: header.indexOf("hi") };
  const absent = (Object.keys(at) as (keyof typeof at)[]).filter((k) => at[k] < 0);
  if (absent.length) {
    throw new CsvError(`${name}: it needs the columns item, group, lo and hi. Missing: ${absent.join(", ")}. Found: ${header.join(", ") || "nothing"}.`);
  }
  if (rows.length < 2) throw new CsvError(`${name}: there are no items under the header.`);
  const items: Item[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const row = lines[r]!;
    const item = cells[at.item] ?? "";
    if (item === "") throw new CsvError(`${name}: row ${row} has no item name.`);
    if (seen.has(item)) throw new CsvError(`${name}: the item "${item}" appears twice (the second time on row ${row}).`);
    seen.add(item);
    const group = cells[at.group] ?? "";
    if (group === "") throw new CsvError(`${name}: row ${row} (item "${item}") has no group. Give each item a group; an item on its own can be its own group.`);
    const lo = numberOf(cells[at.lo] ?? "", separator !== ",");
    const hi = numberOf(cells[at.hi] ?? "", separator !== ",");
    if (typeof lo !== "number" || typeof hi !== "number") {
      throw new CsvError(`${name}: row ${row} (item "${item}") needs numbers for lo and hi, the ends of its scale (it has "${cells[at.lo] ?? ""}" and "${cells[at.hi] ?? ""}").`);
    }
    if (!(hi > lo)) throw new CsvError(`${name}: row ${row} (item "${item}") has hi ${hi} not above lo ${lo}.`);
    items.push({ item, group, lo, hi });
  }
  return items;
}

function field(v: string): string {
  return /[",\n\r]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A wide table as CSV: what `tableFromCsv` reads back. */
export function tableToCsv(table: Table, idHeader = "id"): string {
  const lines = [[idHeader, ...table.columns].map(field).join(",")];
  table.ids.forEach((id, i) => lines.push([field(id), ...table.values[i]!.map((v) => (v === null ? "" : String(v)))].join(",")));
  return lines.join("\n") + "\n";
}

export function itemsToCsv(items: Items): string {
  return ["item,group,lo,hi", ...items.map((it) => [field(it.item), field(it.group), it.lo, it.hi].join(","))].join("\n") + "\n";
}
