/**
 * MockEngine (§8): a deterministic scripted state machine that produces the same shape as
 * the LLM engine, in Turkish, with slots filled from the traveler profile / gathered
 * qualification. Runs with zero API keys so the whole demo works offline. Pure logic.
 */
import type { ConversationContext, Outcome, SalesState, TravelerProfile } from "../types";
import { rngFromId } from "../npc/profiles";
import { resolveOutcome } from "../npc/outcome";
import type { DialogueEngine, SalesTurn, VisitorTurn } from "./engine";

const NEXT: Record<SalesState, SalesState> = {
  GREET: "QUALIFY",
  QUALIFY: "PITCH",
  PITCH: "OBJECTION",
  OBJECTION: "CLOSE",
  CLOSE: "CAPTURE",
  CAPTURE: "DONE",
  DONE: "DONE",
};

const sample = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

const OBJECTION_LINE: Record<TravelerProfile["primaryObjection"], string> = {
  price: "Açıkçası fiyat benim için belirleyici, bütçemi biraz aşıyor olabilir.",
  schedule: "Tarihler tam oturmuyor, o hafta işlerim yoğun.",
  route: "Aktarmasız bir seçenek yoksa biraz çekiniyorum doğrusu.",
  "loyalty-to-competitor": "Aslında genelde başka bir havayolunu kullanıyorum, millerim orada.",
  "just-browsing": "Şimdilik sadece bakıyorum, kesin bir planım yok.",
};

const OBJECTION_REPLY: Record<TravelerProfile["primaryObjection"], string> = {
  price: "Anlıyorum, fiyat önemli. Erken rezervasyon ve taksit seçeneklerimizle bütçenize yaklaşabiliriz — vereceğim rakam temsilidir.",
  schedule: "Tabii, esnek tarifelerimiz var; bir önceki ya da sonraki güne kaydırarak daha uygun bir saat bulabiliriz.",
  route: "İstanbul aktarmalı bağlantılarımız çok sık; toplam süreyi en aza indiren bir kombinasyon çıkarabilirim.",
  "loyalty-to-competitor": "Miles&Smiles'a geçişte statünüzü eşleştiren bir hoş geldin avantajımız var, biriken millerinizi de değerlendirebilirsiniz.",
  "just-browsing": "Tabii, acele yok. Dilerseniz size ufak bir fikir vermesi için örnek bir rota bırakayım.",
};

export class MockEngine implements DialogueEngine {
  readonly mode = "mock" as const;

  async salesTurn(ctx: ConversationContext): Promise<SalesTurn> {
    const r = rngFromId(ctx.conversationId + ctx.state);
    const p = ctx.profile;
    const dest = ctx.qualification.destination ?? p?.desiredDestination ?? "gitmek istediğiniz yer";
    const month = ctx.qualification.travelMonth ?? p?.travelMonth ?? "uygun bir tarih";
    const text = (() => {
      switch (ctx.state) {
        case "GREET":
          return sample([
            "Hoş geldiniz! Türk Hava Yolları standına bekliyorduk. Nereye uçmayı düşünüyorsunuz?",
            "Merhaba, hoş geldiniz! Bugün sizi hangi rotayla baş başa bırakalım — aklınızda bir yer var mı?",
          ], r());
        case "QUALIFY":
          return sample([
            `${dest} harika bir seçim. Yaklaşık ne zaman ve kaç kişi seyahat etmeyi planlıyorsunuz?`,
            `${dest} için heyecanlandım. Tarih ve bütçe konusunda esnek misiniz, kaç kişisiniz?`,
          ], r());
        case "PITCH":
          return `${dest} için ${month} ayında İstanbul aktarmalı uygun bir tarifemiz var. Miles&Smiles ile de ek avantaj sağlarsınız — paylaştığım rakamlar temsilidir.`;
        case "OBJECTION":
          return p ? OBJECTION_REPLY[p.primaryObjection] : "Aklınıza takılan bir nokta var mı? Fiyat, tarih ya da rota — hepsini birlikte çözebiliriz.";
        case "CLOSE":
          return sample([
            "Dilerseniz şimdi yerinizi ayırtalım, koltuğu üzerinize tutayım mı?",
            "İsterseniz rezervasyonu başlatalım — koltuğunuzu bugün sabitleyebiliriz.",
          ], r());
        case "CAPTURE": {
          const booked = this.decide(ctx).booked;
          if (booked) return "Harika, rezervasyonunuzu aldım — iyi yolculuklar dileriz, Miles&Smiles hesabınıza işlenecek! ✈️";
          return "Anlıyorum, bugün karar vermek zorunda değilsiniz. Geri bildiriminiz bizim için değerli — yine de standımıza bekleriz.";
        }
        default:
          return "Teşekkürler!";
      }
    })();
    return { text, nextState: NEXT[ctx.state], done: ctx.state === "CAPTURE" };
  }

  async visitorTurn(ctx: ConversationContext, profile: TravelerProfile): Promise<VisitorTurn> {
    const r = rngFromId(ctx.conversationId + "v" + ctx.state);
    switch (ctx.state) {
      case "GREET":
        return {
          text: `Merhaba! ${profile.desiredDestination}'${turkSuffix(profile.desiredDestination)} düşünüyordum aslında.`,
          intent: { destination: profile.desiredDestination, purpose: profile.segment },
        };
      case "QUALIFY":
        return {
          text: `${profile.travelMonth} gibi, ${profile.partySize} kişiyiz. ${profile.budgetSensitivity === "high" ? "Bütçeyi biraz korumak isterim." : profile.flexibleDestination ? "Tarih ve yer konusunda esneğim." : "Net bir planım var."}`,
          intent: { travelMonth: profile.travelMonth, partySize: profile.partySize },
        };
      case "PITCH":
        return { text: OBJECTION_LINE[profile.primaryObjection] };
      case "OBJECTION": {
        const decided = this.decide(ctx);
        return {
          text: decided.booked
            ? "Tamam, bu açıklama içimi rahatlattı. Olabilir."
            : sample(["Hmm, yine de emin değilim.", "Düşünmem lazım galiba.", "Sanırım bu sefer geçeceğim."], r()),
        };
      }
      case "CLOSE": {
        const decided = this.decide(ctx);
        if (decided.booked) return { text: "Olur, hadi yapalım! Yerimi ayırtın lütfen." };
        return {
          text: decided.defectedTo
            ? `Kusura bakmayın, ben ${decided.defectedTo} tarafına bir bakacağım.`
            : "Teşekkürler ama şimdilik kalsın.",
          intent: { leaving: true },
        };
      }
      default:
        return { text: "..." };
    }
  }

  async finalize(ctx: ConversationContext): Promise<Outcome> {
    return this.decide(ctx);
  }

  /** Single source of truth for this conversation's verdict (deterministic). */
  private decide(ctx: ConversationContext): Outcome {
    if (ctx.profile) {
      return resolveOutcome(ctx.profile, { isHuman: false, transcriptId: ctx.conversationId });
    }
    // Human conversation: infer from the gathered qualification + their last words.
    return humanOutcome(ctx);
  }
}

/** Vowel-harmony-ish locative suffix for nicer Turkish ("Tokyo'ya", "Berlin'e"). */
function turkSuffix(place: string): string {
  const last = place.toLowerCase().replace(/[^a-zçğıöşü]/g, "").slice(-1);
  return "aıou".includes(last) ? "ya" : "ye";
}

/** Heuristic outcome for a human visitor (no hidden profile). */
function humanOutcome(ctx: ConversationContext): Outcome {
  const said = ctx.history
    .filter((m) => m.who === "visitor")
    .map((m) => m.text.toLowerCase())
    .join(" ");
  const booked = /\b(evet|tamam|olur|al[ıi]yorum|ayırt|rezerv|book|yapal[ıi]m)\b/.test(said);
  const reason = /pahal[ıi]|fiyat|bütçe/.test(said)
    ? "price"
    : /tarih|saat|program/.test(said)
      ? "schedule"
      : /aktarma|rota|direkt/.test(said)
        ? "route"
        : /başka havayolu|miles|rakip/.test(said)
          ? "competitor"
          : "browsing";
  return {
    visitorId: ctx.conversationId,
    isHuman: true,
    segment: ctx.qualification.purpose ?? "leisure",
    destinationRequested: ctx.qualification.destination ?? "—",
    budgetBand: ctx.qualification.budgetBand ?? "mid",
    partySize: ctx.qualification.partySize ?? 1,
    booked,
    noPurchaseReason: booked ? undefined : (reason as Outcome["noPurchaseReason"]),
    sentiment: booked ? "positive" : "neutral",
    dwellSeconds: 0,
    transcriptId: ctx.conversationId,
  };
}
