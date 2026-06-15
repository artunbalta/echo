import { NextResponse } from "next/server";
import { getStore } from "@/lib/venue/store";
import { aggregate } from "@/lib/venue/research/aggregate";

export const dynamic = "force-dynamic";

/** Dashboard data: aggregates + recent conversations (for the live feed + drill-down). */
export async function GET() {
  const store = getStore();
  const recent = store.listConversations(40).map((c) => ({
    id: c.id,
    isHuman: c.isHuman,
    startedAt: c.startedAt,
    outcome: c.outcome,
    preview: c.messages[0]?.text ?? "",
  }));
  return NextResponse.json({
    aggregates: aggregate(store.listOutcomes()),
    counts: store.counts(),
    recent,
  });
}
