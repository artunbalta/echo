"use client";

/**
 * Phase 0 validation dashboard (BUILD-PLAN §0.F). The live go/no-go number: across real readings,
 * is mean accuracy ≥ 4.0, "this is me" on specific (axis-bound) lines ≥ 70%, and does specific
 * beat the Barnum controls? Reads the server aggregate (Supabase) and, when that's empty, falls
 * back to this browser's localStorage so a local run still shows a number. This screen is the
 * whole point of Phase 0 — the evidence that unlocks (or stops) everything after it.
 */
import { useEffect, useState } from "react";
import { aggregate, rowFromLocalRecord, type MetricsSummary } from "@/lib/island-metrics";

export default function IslandMetricsPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [source, setSource] = useState<string>("…");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/island/metrics");
        const data = (await res.json()) as MetricsSummary & { source: string };
        if (!alive) return;
        if (data.source === "supabase" && data.n > 0) {
          setSummary(data);
          setSource("supabase");
          return;
        }
        // Fallback: aggregate this browser's local records (dev / no-Supabase).
        const local = JSON.parse(localStorage.getItem("echo.island.validation") ?? "[]");
        if (Array.isArray(local) && local.length) {
          setSummary(aggregate(local.map(rowFromLocalRecord)));
          setSource("local browser");
        } else {
          setSummary(data);
          setSource(data.source === "none" ? "no store configured" : data.source);
        }
      } catch {
        const local = JSON.parse(localStorage.getItem("echo.island.validation") ?? "[]");
        setSummary(aggregate((Array.isArray(local) ? local : []).map(rowFromLocalRecord)));
        setSource("local browser");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-dvh bg-ink p-8 font-mono text-parchment">
      <div className="mx-auto max-w-xl">
        <h1 className="text-lg text-echo">proof of magic — the number</h1>
        <p className="mb-6 mt-1 text-xs text-parchment/50">
          one irreversible day, then the echo reads you back. does it land? · source: {source}
        </p>

        {!summary ? (
          <p className="text-parchment/50">loading…</p>
        ) : (
          <>
            <div
              className={
                "mb-6 rounded-xl border p-4 " +
                (summary.passes ? "border-green-400/40 bg-green-400/5" : "border-parchment/15 bg-parchment/5")
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">verdict</span>
                <span className={"text-lg font-bold " + (summary.passes ? "text-green-300" : "text-parchment/60")}>
                  {summary.n < summary.thresholds.minN
                    ? `need ${summary.thresholds.minN - summary.n} more (n=${summary.n})`
                    : summary.passes
                      ? "✓ thesis holds — proceed"
                      : "✗ not yet — iterate"}
                </span>
              </div>
            </div>

            <Stat label="readings (real)" value={String(summary.n)} note={summary.mockedExcluded ? `${summary.mockedExcluded} mocked excluded` : ""} ok={summary.n >= summary.thresholds.minN} />
            <Stat label="mean accuracy (1–5)" value={summary.meanOverall.toFixed(2)} note={`need ≥ ${summary.thresholds.meanOverall.toFixed(1)}`} ok={summary.meanOverall >= summary.thresholds.meanOverall} />
            <Stat label={`"this is me" — specific`} value={`${Math.round(summary.specificMeRate * 100)}%`} note={`need ≥ ${Math.round(summary.thresholds.specificMeRate * 100)}%`} ok={summary.specificMeRate >= summary.thresholds.specificMeRate} />
            <Stat label={`"this is me" — control (Barnum)`} value={`${Math.round(summary.controlMeRate * 100)}%`} note={`specific must beat this`} ok={summary.specificMeRate > summary.controlMeRate} />
            <Stat label="Barnum margin (specific − control)" value={`${summary.barnumMargin >= 0 ? "+" : ""}${Math.round(summary.barnumMargin * 100)}%`} note="guards against horoscope effect" ok={summary.barnumMargin > 0} />
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, note, ok }: { label: string; value: string; note: string; ok: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-lg border border-parchment/10 px-3 py-2">
      <div>
        <div className="text-sm">{label}</div>
        {note && <div className="text-[10px] text-parchment/40">{note}</div>}
      </div>
      <div className={"text-base tabular-nums " + (ok ? "text-green-300" : "text-parchment/70")}>{value}</div>
    </div>
  );
}
