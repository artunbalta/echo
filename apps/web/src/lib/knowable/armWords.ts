/**
 * What differed about a moment the time it was met (DECISIONS C89), in a few words: the arm of its
 * experiment (C87), for someone reading about it afterwards. "A purse lying in the grass" is not the
 * same question with two coins in it as with nine, and a friend guessing what you did there is owed
 * which it was.
 *
 * Keyed by kind and arm id (`moments.ts`). An arm with no line here adds nothing to the moment's name.
 */
import type { MomentKind } from "@echo/planet";

import type { Lang } from "@/lib/i18n";

const ARMS: Partial<Record<`${MomentKind}:${string}`, Record<Lang, string>>> = {
  "stray-ball:apology": { en: "the child says sorry", tr: "çocuk özür diliyor" },
  "stray-ball:no-apology": { en: "the child says nothing", tr: "çocuk hiçbir şey demiyor" },
  "fallen-elder:alone": { en: "nobody else is about", tr: "etrafta başka kimse yok" },
  "fallen-elder:onlookers": { en: "two others stand by, watching", tr: "iki kişi durmuş, bakıyor" },
  "asch-boats:unanimous": { en: "all three of them agree", tr: "üçü de aynı fikirde" },
  "asch-boats:dissenter": { en: "one of them is not so sure", tr: "içlerinden biri pek emin değil" },
  "looking-up:one": { en: "one person, looking up", tr: "tek kişi yukarı bakıyor" },
  "looking-up:five": { en: "five people, looking up", tr: "beş kişi yukarı bakıyor" },
  "imece-wall:alone": { en: "one old man at it alone", tr: "yaşlı bir adam tek başına uğraşıyor" },
  "imece-wall:crew": { en: "four already at it", tr: "dört kişi zaten çalışıyor" },
  "net-haul:alone": { en: "one fisher at the rope alone", tr: "halatta tek bir balıkçı var" },
  "net-haul:crew": { en: "three already hauling", tr: "üç kişi zaten çekiyor" },
  "bread-errand:hurry": { en: "she says her mother has been waiting", tr: "annesinin beklediğini söylüyor" },
  "bread-errand:no-hurry": { en: "she says there is no hurry", tr: "acelesi olmadığını söylüyor" },
  "drunk-or-ill:ill": { en: "a cane lies beside him", tr: "yanında bir baston duruyor" },
  "drunk-or-ill:drunk": { en: "a bottle lies beside him", tr: "yanında bir şişe duruyor" },
  "crying-alone:on-the-way": { en: "right on the way", tr: "tam yolun üstünde" },
  "crying-alone:aside": { en: "off to one side", tr: "yolun kenarında, uzakta" },
  "bench-sit:elder": { en: "an elder", tr: "yaşlı biri" },
  "bench-sit:peer": { en: "someone of your own age", tr: "senin yaşında biri" },
  "unfinished-tale:short-pause": { en: "he stops a short while before the end", tr: "sona gelmeden kısa bir süre duruyor" },
  "unfinished-tale:long-pause": { en: "he stops a long while before the end", tr: "sona gelmeden uzun süre duruyor" },
  "knucklebones:unseen": { en: "the throw is under the cup; only you saw it", tr: "atış kabın altında; yalnızca sen gördün" },
  "knucklebones:seen": { en: "the children saw the throw too", tr: "atışı çocuklar da gördü" },
  "greeting:high": { en: "the headman", tr: "muhtar" },
  "greeting:low": { en: "a water-carrier", tr: "bir sucu" },
  "greeting:peer": { en: "a villager", tr: "köyden biri" },
  "narrow-way:elder": { en: "an elder with a staff", tr: "bastonlu yaşlı biri" },
  "narrow-way:porter": { en: "a girl with two full jugs", tr: "iki dolu testi taşıyan bir kız" },
  "lost-purse:few": { en: "two coins in it", tr: "içinde iki sikke" },
  "lost-purse:many": { en: "nine coins in it", tr: "içinde dokuz sikke" },
  "litter:clean": { en: "the place is otherwise clean", tr: "etraf bunun dışında temiz" },
  "litter:littered": { en: "the place is already littered", tr: "etraf zaten çöp içinde" },
  "honey-stall:eye": { en: "a nazar charm hangs over it", tr: "üstünde bir nazar boncuğu asılı" },
  "honey-stall:no-eye": { en: "nothing hangs over it", tr: "üstünde hiçbir şey asılı değil" },
};

/** The arm's few words, or null where it has none. */
export function armWords(lang: Lang, kind: MomentKind, arm: string | null): string | null {
  return arm ? (ARMS[`${kind}:${arm}`]?.[lang] ?? null) : null;
}

/** For the test that every arm of every moment has its words in both languages. */
export const ARM_WORDS_FOR_TEST: Readonly<Record<string, Record<Lang, string>>> = ARMS as Record<string, Record<Lang, string>>;
