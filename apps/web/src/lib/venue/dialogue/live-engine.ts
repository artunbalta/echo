/**
 * LiveLLMEngine (§8): real salesperson + visitor role-play via Claude, called from the
 * server only. Every turn degrades to the MockEngine on any API failure, so enabling a
 * key can never break the flow — it only upgrades it. Salesperson dialogue is Turkish.
 */
import "server-only";
import type { ConversationContext, Outcome, SalesState, TravelerProfile } from "../types";
import { resolveOutcome } from "../npc/outcome";
import type { DialogueEngine, SalesTurn, VisitorTurn } from "./engine";
import { MockEngine } from "./mock-engine";

const KEY = process.env.ANTHROPIC_API_KEY!;
const MODEL_STRONG = process.env.LLM_MODEL_STRONG ?? "claude-sonnet-4-6";
const MODEL_CHEAP = process.env.LLM_MODEL_CHEAP ?? "claude-haiku-4-5-20251001";

const NEXT: Record<SalesState, SalesState> = {
  GREET: "QUALIFY", QUALIFY: "PITCH", PITCH: "OBJECTION",
  OBJECTION: "CLOSE", CLOSE: "CAPTURE", CAPTURE: "DONE", DONE: "DONE",
};

const SALES_SYSTEM = `Sen Türk Hava Yolları'nın sanal fuar standındaki deneyimli bir satış temsilcisisin.
Sıcak, profesyonel ve yardımcı ol. Müşteriyi acele ettirmeden, açık uçlu sorularla nitele:
nereye gitmek istiyor, ne zaman, kaç kişi, bütçesi, seyahatin amacı. Sonra profile uygun bir
THY rotası/tarifesi öner, uygunsa İstanbul aktarmalı bağlantıları ve Miles&Smiles avantajlarını
anlat. İtiraz gelirse (fiyat, tarife, rota, başka havayoluna sadakat) gerçekçi ve dürüst şekilde
karşıla. Abartma, uydurma kesin fiyat verme; verdiğin rakamların "örnek/temsili" olduğunu belirt.
Konuşma sonunda satış oldu mu, olmadıysa neden olmadığını öğren. Kısa, doğal cümleler kur. Tek
seferde tek soru. SADECE temsilcinin söyleyeceği repliği yaz, sahne yönergesi ekleme.`;

const STATE_HINT: Record<SalesState, string> = {
  GREET: "Müşteriyi sıcak karşıla ve nereye gitmek istediğini sor.",
  QUALIFY: "Tarih, kişi sayısı, bütçe ve seyahat amacını öğrenmeye çalış (tek soru).",
  PITCH: "Profile uygun bir THY rotası/tarifesi öner; İstanbul aktarması ve Miles&Smiles avantajına değin. Rakamların temsili olduğunu söyle.",
  OBJECTION: "Müşterinin son itirazını dürüstçe karşıla ve güven ver.",
  CLOSE: "Nazikçe rezervasyonu/kapanışı dene.",
  CAPTURE: "Eğer kabul ettiyse teşekkür et ve onayla; etmediyse nedenini öğren ve nazikçe uğurla.",
  DONE: "Kısaca veda et.",
};

async function callClaude(system: string, messages: { role: "user" | "assistant"; content: string }[], model: string, maxTokens = 200): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    return data.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

export class LiveLLMEngine implements DialogueEngine {
  readonly mode = "live" as const;
  private mock = new MockEngine();

  async salesTurn(ctx: ConversationContext): Promise<SalesTurn> {
    const msgs = ctx.history.map((m) => ({ role: (m.who === "sales" ? "assistant" : "user") as "user" | "assistant", content: m.text }));
    if (msgs.length === 0 || msgs[0].role !== "user") msgs.unshift({ role: "user", content: "(ziyaretçi standa yaklaşır)" });
    const system = `${SALES_SYSTEM}\n\nŞu anki adım: ${ctx.state}. ${STATE_HINT[ctx.state]}` +
      (ctx.profile ? `\n\nKarşındaki ziyaretçinin gizli profili (ipucu olarak kullan, doğrudan okuma): ${JSON.stringify(ctx.profile)}` : "");
    const text = await callClaude(system, msgs, MODEL_STRONG, 220);
    if (!text) return this.mock.salesTurn(ctx);
    return { text, nextState: NEXT[ctx.state], done: ctx.state === "CAPTURE" };
  }

  async visitorTurn(ctx: ConversationContext, profile: TravelerProfile): Promise<VisitorTurn> {
    const system = `Sen bir fuar ziyaretçisisin ve bir Türk Hava Yolları satış temsilcisiyle konuşuyorsun.
Profilin: ${JSON.stringify(profile)}. Bu profile sadık kalarak, doğal ve kısa cümlelerle Türkçe yanıt ver.
Hedefini (gitmek istediğin yer, bütçe, asıl çekincen) konuşma ilerledikçe doğal biçimde açığa çıkar.
İtirazın: "${profile.primaryObjection}". Karar anında profiline göre ya rezervasyonu kabul et ya da
kibarca ayrıl. SADECE ziyaretçinin repliğini yaz.`;
    const msgs = ctx.history.map((m) => ({ role: (m.who === "visitor" ? "assistant" : "user") as "user" | "assistant", content: m.text }));
    if (msgs.length === 0 || msgs[0].role !== "user") msgs.unshift({ role: "user", content: "Hoş geldiniz, nereye uçmak istersiniz?" });
    const text = await callClaude(system, msgs, MODEL_CHEAP, 160);
    if (!text) return this.mock.visitorTurn(ctx, profile);
    return { text };
  }

  async finalize(ctx: ConversationContext): Promise<Outcome> {
    const transcript = ctx.history.map((m) => `${m.who === "sales" ? "Temsilci" : "Ziyaretçi"}: ${m.text}`).join("\n");
    const system = `Aşağıdaki THY standı konuşmasını analiz et ve SADECE şu JSON şemasında yanıt ver, başka metin yazma:
{"booked": boolean, "noPurchaseReason": "price"|"schedule"|"route"|"competitor"|"browsing"|"other"|null,
"defectedTo": string|null, "sentiment": "positive"|"neutral"|"negative", "budgetBand": "low"|"mid"|"high"}`;
    const raw = await callClaude(system, [{ role: "user", content: transcript }], MODEL_CHEAP, 200);
    const base = ctx.profile
      ? resolveOutcome(ctx.profile, { isHuman: ctx.isHuman, transcriptId: ctx.conversationId })
      : await this.mock.finalize(ctx);
    if (!raw) return base;
    try {
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      return {
        ...base,
        booked: typeof j.booked === "boolean" ? j.booked : base.booked,
        noPurchaseReason: j.booked ? undefined : (j.noPurchaseReason ?? base.noPurchaseReason),
        defectedTo: j.defectedTo ?? base.defectedTo,
        sentiment: j.sentiment ?? base.sentiment,
        budgetBand: j.budgetBand ?? base.budgetBand,
      };
    } catch {
      return base;
    }
  }
}
