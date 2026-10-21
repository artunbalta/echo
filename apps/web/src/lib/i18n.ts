/**
 * The world's chrome in two languages (DECISIONS C69): English and Turkish.
 *
 * WHAT IS TRANSLATED. Everything the page itself says: the bar along the top, the menu, the consent
 * question, the controls, the meter's words, the prompts beside a thing, the pack, the report form,
 * and the verbs a thing offers. WHAT IS NOT: what the world's people say. Their news and their talk
 * come from the society module and the villager prompt, and the talk is asked for in the person's
 * language instead (see `lib/villager.ts`), so a Turkish stranger is answered in Turkish.
 *
 * WHICH LANGUAGE. The person's own choice, kept in this browser; before they have made one, the
 * browser's first language if it is Turkish, and English otherwise. The server always renders English
 * and the page switches on the client, so the first paint is never a guess the server made.
 */
import { useEffect, useSyncExternalStore } from "react";

export type Lang = "en" | "tr";
export const LANGS: readonly Lang[] = ["en", "tr"];
export const LANG_NAME: Record<Lang, string> = { en: "English", tr: "Türkçe" };

const KEY = "echo.lang";

/** The browser's first choice, read as a language we have. */
export function detectLang(languages: readonly string[]): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "tr") return "tr";
    if (base === "en") return "en";
  }
  return "en";
}

let current: Lang | null = null;
const listeners = new Set<() => void>();

function read(): Lang {
  if (current) return current;
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(KEY);
  } catch {
    // nothing kept
  }
  current = kept === "tr" || kept === "en" ? kept : detectLang(typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]);
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // kept for this page only
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const l of listeners) l();
}

/** The language, for a component. English on the server and during hydration. */
export function useLang(): Lang {
  const lang = useSyncExternalStore<Lang>(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    read,
    () => "en",
  );
  // The page says which language it is in, for a screen reader's voice and the browser's hyphenation.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return lang;
}

const EN = {
  "hud.back": "Planet",
  "hud.backLong": "Back to the planet",
  "hud.map": "Map",
  "hud.menu": "Menu",
  "hud.yourLand": "Your corner of the world",
  "hud.openLand": "Open land",
  "hud.anotherShore": "Another shore",
  "menu.sound": "Sound",
  "menu.on": "on",
  "menu.off": "off",
  "menu.mirror": "How your echo sees you",
  "menu.inspector": "What is being measured",
  "menu.controls": "Controls",
  "menu.report": "Report something here",
  "menu.language": "Language",
  "controls.desk": "WASD walk · Shift run · Space jump · drag to look",
  "controls.desk2": "E use what is near · T talk · I pack · Y your echo · M sound",
  "controls.touch": "Left thumb walks · drag to look · pinch to zoom",
  "consent.title": "Your echo can learn from how you move here.",
  "consent.body": "It notices where you go and what you choose, never what you type. Stop it any time from the menu. Saying no changes nothing here.",
  "consent.yes": "Let it watch",
  "consent.no": "Not this time",
  "meter.label": "How well your echo knows you",
  "meter.mirror": "Look in the mirror",
  "meter.inspector": "What is being measured",
  "meter.sure": "sure",
  "meter.namesNone": "names nothing of you yet",
  "meter.names": "names {n} of {of}",
  "meter.window": "window",
  "meter.windows": "windows",
  "meter.offDeclined": "off · you said no, and nothing is read",
  "meter.offUnset": "off · nothing is read until you say yes",
  "meter.waiting": "listening",
  "meter.offline": "your echo cannot hear you just now",
  "meter.noVariance": "your echo heard you, but cannot say how sure it is",
  "meter.explain": "It is how sure your echo is of you, not how much of you it can put into words. Walking makes it surer within seconds; the words take longer.",
  "prompt.talk": "Talk to {name}",
  "prompt.in": "In {name}",
  "prompt.ashore": "Step ashore",
  "prompt.moveToGetUp": "move to get up",
  "pack.hand": "In your hand: {item}",
  "pack.putAway": "G to put it away",
  "pack.count": "{n}/{of} in your pack",
  "pack.open": "I to open it",
  "pack.launch": "R to launch your raft",
  "pack.title": "Your pack",
  "pack.close": "Close",
  "pack.empty": "Nothing yet. Pick things up as you go.",
  "report.title": "Something wrong here?",
  "report.ruining": "Someone is ruining this village",
  "report.offensive": "Something offensive is on this land",
  "report.other": "Something else",
  "report.note": "What did you see? (optional)",
  "report.sent": "Thank you. A moderator will look at what was here, and who left it.",
  "report.failed": "That did not go through. Try again in a while.",
  "report.cancel": "Cancel",
  "report.send": "Send",
  "report.sending": "Sending…",
  "echo.away": "Your echo went out while you were away.",
  "echo.awayWaiting": "While you were away, your echo went out. It is waiting in {village}.",
  "echo.awayWent": "While you were away, your echo went to {village}.",
  "echo.hearNow": "Hear it now",
  "echo.hear": "Hear what it did",
  "build.ground": "Building the ground",
  "build.failed": "The ground could not be built: {why}",
  "gathering.funeral": "You stand with the mourners. Nobody asks who you are.",
  "gathering.wedding": "You stand with the guests. Someone you have never met smiles at you.",
  "gathering.naming": "You wait with the callers. Inside, a baby is crying.",
  "news.now": "now",
  "news.earlier": "earlier today",
  "news.anyDay": "any day",
  "news.today": "today",
  "news.tomorrow": "tomorrow",
  "talk.child": "a child",
  "talk.voiceOn": "Voice on",
  "talk.voiceOff": "Voice off",
  "talk.forget": "Forget me",
  "talk.leave": "Leave",
  "talk.voiceAsk": "Hear villagers in voices of their own, and speak to them aloud? Their replies are sent to ElevenLabs to be spoken. What you say aloud, recorded only while you hold the microphone or Ctrl, is sent to ElevenLabs to be written down. Nothing of your voice is kept here, and nothing about how you sound is read into your echo.",
  "talk.voiceYes": "Yes, with ElevenLabs",
  "talk.voiceNo": "Only this browser's voice",
  "talk.looks": "{name} stops and looks at you.",
  "talk.thinks": "{name} thinks…",
  "talk.placeholder": "Say something to {name}…",
  "talk.hold": "Hold to speak",
  "talk.listening": "Listening…",
  "talk.say": "Say",
  "talk.private": "Not stored, and not read into your echo.",
  "talk.how": "How this works",
  "talk.detail": "What you say goes to Claude to be answered and is not stored. {name} keeps a short note of your talk in their own words, so they remember you; “Forget me” erases it. None of it is read into your echo. What {name} decides about their own life, everyone can see.",
  "talk.detailCloud": "Replies you hear spoken, and what you say aloud, also go to ElevenLabs, to be spoken and written down; nothing of your voice is kept here or measured.",
  "talk.detailMic": "Hold the microphone, or Ctrl, to speak.",
  "talk.stopCloud": "Stop using ElevenLabs",
  "talk.useCloud": "Use ElevenLabs voices",
  "menu.meet": "Let a friend's echo meet yours",
  "pair.title": "Two echoes meeting",
  "pair.intro": "While you and someone you know are both away, your two echoes can meet in a village one of you was in. You will each see what was said, in your own voice if you have one here. Neither of you sees what the other's echo held back, and nothing either of you said to a villager is shared. Either of you can stop it at any time.",
  "pair.needsConsent": "Your echo has to watch you first. Say yes to it, then come back here.",
  "pair.yourName": "Your name, as they know you",
  "pair.makeCode": "Make a code",
  "pair.codeIs": "Give them this code. It works once, for a day:",
  "pair.copy": "Copy",
  "pair.copied": "Copied",
  "pair.haveCode": "I have a code",
  "pair.code": "Their code",
  "pair.accept": "Let our echoes meet",
  "pair.paired": "Done. Your echo and {name}'s will meet when you are both away.",
  "pair.with": "Your echo may meet",
  "pair.since": "since {date}",
  "pair.stop": "Stop",
  "pair.none": "Nobody yet.",
  "pair.err.no_such_code": "No such code.",
  "pair.err.expired": "That code has expired. Ask for a new one.",
  "pair.err.own_code": "That is your own code.",
  "pair.err.already": "Your echoes can already meet.",
  "pair.err.bad_name": "Give a name, up to 40 letters.",
  "pair.err.bad_code": "A code is six letters and numbers.",
  "pair.err.too_many": "You have as many as you can have. Stop one first.",
  "pair.err.other": "That did not go through. Try again in a while.",
  "meet.toast": "While you were both away, your echo met {name}'s.",
  "meet.toastHere": "Your echo and {name}'s are on the green. Walk up to them.",
  "meet.watch": "See what they said",
  "meet.title": "Your echo met {name}'s",
  "meet.yours": "Your echo",
  "meet.theirs": "{name}'s echo",
  "meet.held": "held back; it would have said:",
  "meet.heldTheirs": "held something back",
  "meet.yes": "That's me",
  "meet.no": "Not me",
  "meet.yesHeld": "I'd have said that",
  "meet.noHeld": "No",
  "meet.noted": "Noted.",
  "meet.notedPromoted": "Noted. Your echo may now say this kind of thing for you aloud.",
  "meet.failed": "That did not go through.",
  "meet.play": "Hear it",
  "meet.done": "Done",
  "meet.seenBy": "{n} villagers saw them talking.",
  "meet.seenByOne": "One villager saw them talking.",
  "meet.footer": "Each echo spoke only where its own person has let it, and what it held back is shown only to that person. Your answers teach yours what it may say for you.",
  "meet.told": "While you were both away, I met {name}'s echo in {village}.",
  "meet.toldTopic": "Everyone there was talking about it: {topic}.",
  "meet.toldNone": "Neither of us said anything aloud: we are not sure yet what you would say. Here is what I would have said; what {name}'s echo would have said is theirs to see.",
  "meet.toldSome": "Some of it we said aloud.",
} as const;

export type Key = keyof typeof EN;

const TR: Record<Key, string> = {
  "hud.back": "Gezegen",
  "hud.backLong": "Gezegene dön",
  "hud.map": "Harita",
  "hud.menu": "Menü",
  "hud.yourLand": "Dünyadaki köşen",
  "hud.openLand": "Boş arazi",
  "hud.anotherShore": "Başka bir kıyı",
  "menu.sound": "Ses",
  "menu.on": "açık",
  "menu.off": "kapalı",
  "menu.mirror": "Yankın seni nasıl görüyor",
  "menu.inspector": "Neyin ölçüldüğü",
  "menu.controls": "Kontroller",
  "menu.report": "Burada bir sorun bildir",
  "menu.language": "Dil",
  "controls.desk": "WASD yürü · Shift koş · Boşluk zıpla · sürükleyip bak",
  "controls.desk2": "E yakındakini kullan · T konuş · I çanta · Y yankın · M ses",
  "controls.touch": "Sol başparmak yürütür · sürükleyip bak · iki parmakla yakınlaş",
  "consent.title": "Yankın burada nasıl hareket ettiğinden öğrenebilir.",
  "consent.body": "Nereye gittiğini ve neyi seçtiğini fark eder; yazdıklarını asla okumaz. İstediğin an menüden durdurabilirsin. Hayır demek burada hiçbir şeyi değiştirmez.",
  "consent.yes": "İzlesin",
  "consent.no": "Bu sefer değil",
  "meter.label": "Yankın seni ne kadar tanıyor",
  "meter.mirror": "Aynaya bak",
  "meter.inspector": "Neyin ölçüldüğü",
  "meter.sure": "emin",
  "meter.namesNone": "henüz sana dair bir şey söyleyemiyor",
  "meter.names": "{of} yönünden {n} tanesini söyleyebiliyor",
  "meter.window": "ölçüm",
  "meter.windows": "ölçüm",
  "meter.offDeclined": "kapalı · hayır dedin, hiçbir şey okunmuyor",
  "meter.offUnset": "kapalı · evet diyene kadar hiçbir şey okunmuyor",
  "meter.waiting": "dinliyor",
  "meter.offline": "yankın şu an seni duyamıyor",
  "meter.noVariance": "yankın seni duydu ama ne kadar emin olduğunu söyleyemiyor",
  "meter.explain": "Bu, yankının senden ne kadar emin olduğu; seni ne kadar kelimeye dökebildiği değil. Yürüdükçe saniyeler içinde emin olur; kelimeler daha geç gelir.",
  "prompt.talk": "{name} ile konuş",
  "prompt.in": "{name} içinde",
  "prompt.ashore": "Karaya çık",
  "prompt.moveToGetUp": "kalkmak için hareket et",
  "pack.hand": "Elinde: {item}",
  "pack.putAway": "kaldırmak için G",
  "pack.count": "Çantanda {n}/{of}",
  "pack.open": "açmak için I",
  "pack.launch": "salını denize indirmek için R",
  "pack.title": "Çantan",
  "pack.close": "Kapat",
  "pack.empty": "Henüz bir şey yok. Yolda gördüklerini topla.",
  "report.title": "Burada bir sorun mu var?",
  "report.ruining": "Biri bu köyü mahvediyor",
  "report.offensive": "Bu arazide rahatsız edici bir şey var",
  "report.other": "Başka bir şey",
  "report.note": "Ne gördün? (isteğe bağlı)",
  "report.sent": "Teşekkürler. Bir moderatör burada ne olduğuna ve kimin bıraktığına bakacak.",
  "report.failed": "Gönderilemedi. Biraz sonra yeniden dene.",
  "report.cancel": "Vazgeç",
  "report.send": "Gönder",
  "report.sending": "Gönderiliyor…",
  "echo.away": "Sen yokken yankın dışarı çıktı.",
  "echo.awayWaiting": "Sen yokken yankın dışarı çıktı. Seni {village} köyünde bekliyor.",
  "echo.awayWent": "Sen yokken yankın {village} köyüne gitti.",
  "echo.hearNow": "Şimdi dinle",
  "echo.hear": "Ne yaptığını dinle",
  "build.ground": "Zemin kuruluyor",
  "build.failed": "Zemin kurulamadı: {why}",
  "gathering.funeral": "Yas tutanların yanında duruyorsun. Kimse kim olduğunu sormuyor.",
  "gathering.wedding": "Konukların yanında duruyorsun. Hiç tanımadığın biri sana gülümsüyor.",
  "gathering.naming": "Ziyaretçilerle bekliyorsun. İçeride bir bebek ağlıyor.",
  "news.now": "şimdi",
  "news.earlier": "bugün erken saatte",
  "news.anyDay": "her an",
  "news.today": "bugün",
  "news.tomorrow": "yarın",
  "talk.child": "bir çocuk",
  "talk.voiceOn": "Ses açık",
  "talk.voiceOff": "Ses kapalı",
  "talk.forget": "Beni unut",
  "talk.leave": "Ayrıl",
  "talk.voiceAsk": "Köylüleri kendi sesleriyle duymak ve onlarla sesli konuşmak ister misin? Yanıtları seslendirilmek üzere ElevenLabs'e gönderilir. Yüksek sesle söylediklerin, yalnızca mikrofonu ya da Ctrl'yi basılı tuttuğun sürece kaydedilir ve yazıya dökülmek üzere ElevenLabs'e gönderilir. Sesinden hiçbir şey burada saklanmaz; nasıl konuştuğun da yankına okunmaz.",
  "talk.voiceYes": "Evet, ElevenLabs ile",
  "talk.voiceNo": "Yalnızca tarayıcının sesi",
  "talk.looks": "{name} durup sana bakıyor.",
  "talk.thinks": "{name} düşünüyor…",
  "talk.placeholder": "Bir şey söyle…",
  "talk.hold": "Konuşmak için basılı tut",
  "talk.listening": "Dinliyor…",
  "talk.say": "Söyle",
  "talk.private": "Saklanmaz, yankına da okunmaz.",
  "talk.how": "Nasıl çalışır",
  "talk.detail": "Söylediklerin yanıtlanmak üzere Claude'a gider ve saklanmaz. {name} seni hatırlamak için konuşmanızdan kendi sözleriyle kısa bir not tutar; “Beni unut” bunu siler. Hiçbiri yankına okunmaz. {name} kendi hayatı hakkında ne karar verirse herkes görebilir.",
  "talk.detailCloud": "Sesli duyduğun yanıtlar ve yüksek sesle söylediklerin de seslendirilmek ve yazıya dökülmek üzere ElevenLabs'e gider; sesinden hiçbir şey burada saklanmaz ya da ölçülmez.",
  "talk.detailMic": "Konuşmak için mikrofonu ya da Ctrl'yi basılı tut.",
  "talk.stopCloud": "ElevenLabs kullanmayı bırak",
  "talk.useCloud": "ElevenLabs seslerini kullan",
  "menu.meet": "Bir arkadaşının yankısıyla buluştur",
  "pair.title": "İki yankının buluşması",
  "pair.intro": "Sen ve tanıdığın biri ikiniz de uzaktayken, yankılarınız ikinizden birinin bulunduğu bir köyde buluşabilir. Söylenenleri ikiniz de görürsünüz; burada sesiniz varsa kendi sesinizle. Hiçbiriniz diğerinin yankısının söylemeden tuttuklarını görmez; köylülere söylediklerinizin hiçbiri paylaşılmaz. İkinizden biri istediği an durdurabilir.",
  "pair.needsConsent": "Önce yankının seni izlemesi gerekiyor. Ona evet de, sonra buraya dön.",
  "pair.yourName": "Seni tanıdıkları ad",
  "pair.makeCode": "Kod oluştur",
  "pair.codeIs": "Bu kodu onlara ver. Bir kez ve bir gün boyunca geçerli:",
  "pair.copy": "Kopyala",
  "pair.copied": "Kopyalandı",
  "pair.haveCode": "Bende bir kod var",
  "pair.code": "Onların kodu",
  "pair.accept": "Yankılarımız buluşsun",
  "pair.paired": "Tamam. İkiniz de uzaktayken yankın {name} ile buluşacak.",
  "pair.with": "Yankının buluşabildiği kişiler",
  "pair.since": "{date} tarihinden beri",
  "pair.stop": "Durdur",
  "pair.none": "Henüz kimse yok.",
  "pair.err.no_such_code": "Böyle bir kod yok.",
  "pair.err.expired": "Bu kodun süresi dolmuş. Yenisini iste.",
  "pair.err.own_code": "Bu senin kendi kodun.",
  "pair.err.already": "Yankılarınız zaten buluşabiliyor.",
  "pair.err.bad_name": "En fazla 40 harflik bir ad yaz.",
  "pair.err.bad_code": "Kod altı harf ve rakamdan oluşur.",
  "pair.err.too_many": "Olabilecek en çok kişiye ulaştın. Önce birini durdur.",
  "pair.err.other": "Olmadı. Biraz sonra yeniden dene.",
  "meet.toast": "İkiniz de uzaktayken yankın {name} ile buluştu.",
  "meet.toastHere": "Yankın {name} ile meydanda. Yanlarına yürü.",
  "meet.watch": "Ne konuştuklarını gör",
  "meet.title": "Yankın {name} ile buluştu",
  "meet.yours": "Yankın",
  "meet.theirs": "{name} · yankı",
  "meet.held": "söylemedi; şunu diyecekti:",
  "meet.heldTheirs": "bir şey söylemedi",
  "meet.yes": "Bu benim",
  "meet.no": "Bu ben değilim",
  "meet.yesHeld": "Bunu söylerdim",
  "meet.noHeld": "Hayır",
  "meet.noted": "Not edildi.",
  "meet.notedPromoted": "Not edildi. Yankın artık bu tür şeyleri senin adına yüksek sesle söyleyebilir.",
  "meet.failed": "Olmadı.",
  "meet.play": "Dinle",
  "meet.done": "Tamam",
  "meet.seenBy": "{n} köylü onları konuşurken gördü.",
  "meet.seenByOne": "Bir köylü onları konuşurken gördü.",
  "meet.footer": "Her yankı yalnızca kendi sahibinin izin verdiği yerde konuştu; söylemeden tuttuğunu yalnızca sahibi görür. Senin cevapların, yankına senin adına ne söyleyebileceğini öğretir.",
  "meet.told": "İkiniz de uzaktayken {village} köyünde {name} ile karşılaştım.",
  "meet.toldTopic": "Orada herkes şunu konuşuyordu: {topic}.",
  "meet.toldNone": "İkimiz de yüksek sesle bir şey söylemedik; senin ne diyeceğinden henüz emin değiliz. İşte benim söyleyeceklerim; {name} tarafının söyleyecekleri onun görmesi için.",
  "meet.toldSome": "Bir kısmını yüksek sesle söyledik.",
};

const STRINGS: Record<Lang, Record<Key, string>> = { en: EN, tr: TR };

/** A string of the chrome, with `{name}` filled from `vars`. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number | undefined> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * The verbs a thing offers, by their English label: the same id names different acts on different
 * things (`play` is a snowball, a pebble and a dog), and the label is what the person reads.
 */
const VERBS_TR: Record<string, string> = {
  Sit: "Otur",
  "Rest in the shade": "Gölgede dinlen",
  Climb: "Tırman",
  "Look closely": "Yakından bak",
  "Push through": "Aradan geç",
  "Touch it": "Dokun",
  "Eat the berries": "Meyveleri ye",
  "Pick berries to keep": "Saklamak için meyve topla",
  "Make a snowball": "Kartopu yap",
  "Draw in the sand": "Kuma çiz",
  "Pick up the driftwood": "Odun parçasını al",
  "Fetch the healer for them": "Onlar için şifacıyı çağır",
  "Leave herbs for them": "Onlara şifalı ot bırak",
  Knock: "Kapıyı çal",
  "Look in at the window": "Pencereden içeri bak",
  "Force the door": "Kapıyı zorla",
  "Leave what you carry at the door": "Taşıdığını kapıya bırak",
  "Search the ruin": "Yıkıntıyı ara",
  "Help weed the field": "Tarlada ot ayıklamaya yardım et",
  "Trample the crop": "Ekini çiğne",
  "Take a handful": "Bir avuç al",
  "Lie down for a while": "Biraz uzan",
  "Draw water and drink": "Su çek ve iç",
  "Drop a pebble in": "İçine bir çakıl at",
  "Sit at the end of the dock": "İskelenin ucuna otur",
  "Fish from the dock": "İskeleden balık tut",
  "Take the boat out": "Tekneyi denize çıkar",
  "Bail it out for them": "Onlar için suyunu boşalt",
  "Bring the boat back": "Tekneyi geri getir",
  "Pay your respects": "Saygını göster",
  "Tidy the grave": "Mezarı temizle",
  "Walk over the grave": "Mezarın üstünden yürü",
  "Work a shift": "Bir vardiya çalış",
  "Take a lump of ore": "Bir parça cevher al",
  "Go a little way inside": "Biraz içeri gir",
  "Ask them to stay ashore": "Karada kalmalarını iste",
  Talk: "Konuş",
  "Give what you carry": "Taşıdığını ver",
  "Offer it in trade": "Takas için öner",
  "Ask for something for your help": "Yardımın için bir şey iste",
  "Stroke the dog": "Köpeği okşa",
  "Give it something to eat": "Yiyecek bir şey ver",
  "Play with it": "Onunla oyna",
  "Shoo it away": "Uzaklaştır",
  "Scratch its head": "Başını kaşı",
  "Chase the goats": "Keçileri kovala",
  "Scatter grain for them": "Onlara tane serp",
  "Chase the hens": "Tavukları kovala",
  "Mark out a house here": "Buraya bir ev yeri işaretle",
  "Work on the house": "Ev üzerinde çalış",
  "Paint the door": "Kapıyı boya",
  "Paint the walls": "Duvarları boya",
  "Dye your shirt": "Gömleğini boya",
  "Set it down square": "Düzgünce yerleştir",
  "Set it down as it is": "Olduğu gibi bırak",
  "Free the gull": "Martıyı kurtar",
  "Leave it closed, for its owner": "Sahibi için kapalı bırak",
  "Take a little from it": "İçinden biraz al",
  "Take what is in it": "İçindekini al",
  "Look closer": "Daha yakından bak",
  "Go in": "İçeri gir",
  "Leave it be": "Dokunma, bırak",
  "Pick it up": "Yerden al",
  "Turn it": "Çevir",
  "Wade in": "Suya gir",
  "Skip a stone": "Taş sektir",
  "Lay the foundation stones": "Temel taşlarını döşe",
  "Raise the walls": "Duvarları ör",
  "Thatch the roof": "Çatıyı sazla ört",
  "Hang the door": "Kapıyı tak",
  "Weave a basket": "Sepet ör",
  "String a shell necklace": "Deniz kabuğundan kolye diz",
  "Make a hook and line": "Olta yap",
  "Lash a stone hammer": "Taş çekiç bağla",
  "Bind a torch": "Meşale bağla",
  "Make a stool": "Tabure yap",
  "Make a table": "Masa yap",
  "Make a bed": "Yatak yap",
  "Make a shelf": "Raf yap",
  "Lash a raft together": "Bir sal bağla",
  "Break off a dry branch": "Kuru bir dal kopar",
  "Gather dry twigs": "Kuru çırpı topla",
  "Cut a reed": "Bir saz kes",
  "Pick up a stone": "Bir taş al",
  "Pick up the shell": "Deniz kabuğunu al",
};

/** A verb's label in the person's language; one with no translation keeps its English. */
export function verbLabel(lang: Lang, label: string): string {
  return lang === "tr" ? (VERBS_TR[label] ?? label) : label;
}

/** For the test that every verb the world offers has a Turkish label. */
export const VERBS_TR_FOR_TEST: Readonly<Record<string, string>> = VERBS_TR;
