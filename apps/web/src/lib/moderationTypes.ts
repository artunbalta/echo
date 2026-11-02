/**
 * Moderation (DECISIONS C67): what is kept, shared by the server and the moderators' page.
 */
import type { LifeChange, WorldEffect } from "@echo/planet";

export type ReportReason = "ruining" | "offensive" | "other";

/** Who left what in a cell, recently: the snapshot a report is filed with, by subject. */
export interface CellTraces {
  subject: string;
  changes: LifeChange[];
  marks: WorldEffect[];
  /** Deeds there, and how many of them were wrongs. */
  deeds: number;
  wrongs: number;
}

export interface Report {
  id: string;
  /** Who filed it, by signed identity; null when they had none (a stranger who said no to watching). */
  reporter: string | null;
  cell: string;
  reason: ReportReason;
  note: string | null;
  /** The world day it was filed. */
  day: number;
  madeAt: string;
  /** Who had left what in the cell then, the reporter excluded. */
  snapshot: CellTraces[];
  resolvedAt: string | null;
  resolvedBy: string | null;
  outcome: string | null;
}

/** Everything one stranger has left in the shared world, across cells. */
export interface Traces {
  changes: { cell: string; change: LifeChange }[];
  marks: { cell: string; mark: WorldEffect }[];
  deeds: { cell: string; count: number; wrongs: number }[];
  home: { cell: string } | null;
}

export interface Bar {
  subject: string;
  until: string;
  reason: string;
  by: string;
  at: string;
}

export interface ModerationEntry {
  id: string;
  moderator: string;
  subject: string | null;
  action: "undo" | "bar" | "lift" | "dismiss";
  report: string | null;
  detail: Record<string, unknown>;
  at: string;
}
