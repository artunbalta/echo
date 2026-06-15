"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Aggregates } from "@/lib/venue/research/aggregate";
import type { DialogueMessage, Outcome } from "@/lib/venue/types";

interface RecentItem {
  id: string;
  isHuman: boolean;
  startedAt: number;
  outcome?: Outcome;
  preview: string;
}
interface ResearchData {
  aggregates: Aggregates;
  counts: { visitors: number; conversations: number; outcomes: number };
  recent: RecentItem[];
}

const REASON_LABEL: Record<string, string> = {
  price: "Fiyat", schedule: "Tarih/Program", route: "Rota/Aktarma",
  competitor: "Rakibe sadakat", browsing: "Sadece bakıyor", other: "Diğer",
};

export default function Dashboard() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/venue/research")
        .then((r) => r.json())
        .then((d) => alive && setData(d))
        .catch(() => {});
    tick();
    const iv = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const a = data?.aggregates;
  return (
    <main className="min-h-screen w-screen overflow-auto bg-ink p-4 font-mono text-parchment">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="glow-echo text-2xl font-bold text-echo">THY Stand · Araştırma Paneli</h1>
            <p className="text-xs text-parchment/50">Kim geldi, ne konuşuldu, kim rezervasyon yaptı — ve neden yapmadı.</p>
          </div>
          <Link href="/venue" className="panel rounded px-3 py-2 text-sm hover:text-echo">← sahneye dön</Link>
        </header>

        {!a || a.total === 0 ? (
          <div className="panel rounded-lg p-8 text-center text-parchment/60">
            Henüz veri yok. <Link href="/venue" className="text-echo underline">Sahneyi aç</Link> — ziyaretçiler otomatik gelip standla konuşmaya başlayacak.
          </div>
        ) : (
          <>
            {/* stat cards */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Ziyaretçi" value={a.total} sub={`${a.humans} insan`} />
              <Stat label="Dönüşüm" value={`%${Math.round(a.conversionRate * 100)}`} sub={`${a.booked} rezervasyon`} accent />
              <Stat label="Kaçış (başka ada)" value={a.defections.total} sub="portaldan ayrılan" warn />
              <Stat label="Ort. süre" value={`${a.avgDwellSeconds}s`} sub="stand başında" />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card title="En çok istenen destinasyonlar">
                <Bars items={a.byDestination} color="#a06cd5" />
              </Card>
              <Card title="Satın almama nedenleri (çekirdek içgörü)">
                <Bars items={a.noPurchaseReasons.map((x) => ({ key: REASON_LABEL[x.key] ?? x.key, count: x.count }))} color="#d0a93a" />
              </Card>
              <Card title="Bütçe dağılımı">
                <Bars
                  items={[
                    { key: "Düşük", count: a.byBudget.low },
                    { key: "Orta", count: a.byBudget.mid },
                    { key: "Yüksek", count: a.byBudget.high },
                  ]}
                  color="#5aa6d0"
                />
              </Card>
              <Card title="Kaçışlar — nereye gittiler?">
                {a.defections.total === 0 ? (
                  <Empty>Kimse başka adaya kaçmadı.</Empty>
                ) : (
                  <Bars items={a.defections.byTarget} color="#e06c75" />
                )}
              </Card>
              <Card title="Segmentler">
                <Bars items={a.bySegment} color="#3aa06c" />
              </Card>
              <Card title="Duygu durumu">
                <Bars
                  items={[
                    { key: "Olumlu", count: a.sentiment.positive },
                    { key: "Nötr", count: a.sentiment.neutral },
                    { key: "Olumsuz", count: a.sentiment.negative },
                  ]}
                  color="#6fcf7f"
                />
              </Card>
            </div>

            {/* recent feed */}
            <Card title="Son konuşmalar" className="mt-3">
              <div className="space-y-1 text-xs">
                {data!.recent.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="flex w-full items-center justify-between rounded border border-echo/15 px-2 py-1 text-left hover:border-echo/40"
                  >
                    <span className="truncate">
                      <span className={c.isHuman ? "text-echo" : "text-parchment/50"}>{c.isHuman ? "insan" : "npc"}</span>{" "}
                      {c.outcome?.destinationRequested ?? "—"} · {c.preview}
                    </span>
                    <span className={c.outcome?.booked ? "text-green-400" : c.outcome?.defectedTo ? "text-red-400" : "text-yellow-400"}>
                      {c.outcome?.booked ? "✓" : c.outcome?.defectedTo ? "→kaçtı" : "✕"}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>

      {openId && <TranscriptModal id={openId} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function Stat({ label, value, sub, accent, warn }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="panel rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-parchment/50">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-echo" : warn ? "text-red-400" : "text-parchment"}`}>{value}</div>
      {sub && <div className="text-[10px] text-parchment/40">{sub}</div>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`panel rounded-lg p-3 ${className}`}>
      <div className="mb-2 text-xs font-bold text-parchment/70">{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-4 text-center text-xs text-parchment/40">{children}</div>;
}

function Bars({ items, color }: { items: { key: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <Empty>—</Empty>;
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-parchment/70">{it.key}</span>
          <div className="h-3 flex-1 rounded bg-black/30">
            <div className="h-3 rounded" style={{ width: `${(it.count / max) * 100}%`, background: color }} />
          </div>
          <span className="w-6 shrink-0 text-right text-parchment/60">{it.count}</span>
        </div>
      ))}
    </div>
  );
}

function TranscriptModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<DialogueMessage[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    fetch(`/api/venue/transcript?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        setMsgs(d.messages ?? []);
        setOutcome(d.outcome ?? null);
      })
      .catch(() => setMsgs([]));
  }, [id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel max-h-[80vh] w-[min(560px,94vw)] overflow-auto rounded-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-bold text-echo">Transkript</span>
          <button onClick={onClose} className="text-xs text-parchment/50 hover:text-parchment">kapat ✕</button>
        </div>
        {!msgs ? (
          <div className="text-parchment/40">yükleniyor…</div>
        ) : (
          <div className="space-y-1 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={m.who === "sales" ? "text-echo" : "text-parchment"}>
                <span className="opacity-50">{m.who === "sales" ? "temsilci" : "ziyaretçi"}:</span> {m.text}
              </div>
            ))}
            {outcome && (
              <div className="mt-2 rounded border border-echo/30 p-2 text-xs text-parchment/70">
                sonuç: {outcome.booked ? "rezervasyon ✓" : `yok (${outcome.noPurchaseReason ?? "—"})`}
                {outcome.defectedTo && ` · kaçtı → ${outcome.defectedTo}`} · {outcome.destinationRequested} · {outcome.budgetBand}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
