# Pilot köyü: başlatma kiti

*2026-11-06. Bu kit, `research/paper/preregistration.md` dosyasındaki ön kayıtlı pilotun nasıl başlatılacağını anlatır. Pilot, YC planındaki ilk çekiş adımıdır: insanlar geri geliyor mu, ve yankı üçüncü ziyarette onları ne kadar tanıyor?*

## İlk ziyaretten önce

1. **Yayın.** PR #3'ün ön koşullarını tamamla ve birleştir: Vercel, Supabase göçleri ve gizli değerler. Sıralı liste raporda ve PR açıklamasında var.
2. **Pilotun ayarları.** Pilotun yanında sonuç ekranı için de karar ver:
   - `ECHO_PILOT=1`
   - `ECHO_PILOT_CODE` (en az 4 karakter): arkadaşlarına vereceğin kod.
   - `ECHO_PILOT_ADMIN` (en az 12 karakter): yalnızca dışa aktarım için, kimseye verme.
   - `ECHO_PILOT_VISITS=3`
   - `ECHO_PILOT_REVEAL=1` ya da hiç: ön kayda ne yazarsan o.
3. **Ön kayıt.** `research/paper/preregistration.md`'deki iki kutuyu işaretle: ziyaret sayısı ve sonuç ekranı. Sonra OSF'ye dosyala. Analiz kodunun commit'ini ön kayda yaz.
4. **Duman testi.** Kendin katıl, ilk ziyaretin ilk 2 dakikasını oyna. Ardından dışa aktarımı al: `curl -H "x-pilot-admin: …" https://<site>/api/pilot?op=export > export.json`. Analizin tek kişide bile çalıştığını gör:
   `services/ml/.venv/bin/python research/pilot/analyze.py export.json`

## Davet metni

Kişiye göre düzenle ve tek tek gönder. Grup mesajı daha az dönüş getirir.

> Selam! Küçük bir çalışma yapıyorum ve sana ihtiyacım var. Tarayıcıda açılan bir köyde 25 dakika dolaşıyorsun, birer gün arayla üç kez. Doğru cevap yok, puan yok; sadece nasıl davranıyorsan öyle davran. Başlamadan önce kendini birkaç soruyla anlatıyorsun. Her ziyaretten sonra da tanıdığın arkadaşların hakkında birkaç tahminde bulunuyorsun.
>
> Sonunda, istersen, seni en iyi kimin tanıdığını görüyorsun: kendi sözlerin mi, arkadaşların mı, yoksa köyün senden öğrendiği "yankı" mı.
>
> Link: <site>/pilot · Kod: <kod>
>
> İsim istemiyor, takma ad yeterli. Ne zaman istersen her şeyini silebiliyorsun.

## Takvim

| Gün | Ne |
|---|---|
| G0 | Davetler gider. İlk katılanlar katılıp ilk ziyaretini yapar. |
| G1 | Her kişiye ilk ziyaretinden yaklaşık 20 saat sonra kısa bir hatırlatma: "İkinci ziyaretin açıldı." |
| G2 | Üçüncü ziyaret için aynı hatırlatma. |
| G3–G7 | Gecikenlere bir hatırlatma daha; hepsi bu. |
| 4. hafta | Durma kuralı: 20 kişi ya da ilk ziyaretten 4 hafta sonra, hangisi önce gelirse. |

**Ölçülecekler:**
- kaç kişi 2. ve 3. ziyarete döndü (bu, ürünün asıl ölçütü);
- yankının 3. ziyaretteki becerisi;
- arkadaş tahminlerinin dolma oranı.

## Pilot bitince

1. **Dışa aktar ve analiz et.** Dışa aktarımı al, sonra şunu çalıştır:
   `services/ml/.venv/bin/python research/pilot/analyze.py export.json`
   Rapor `research/pilot/out/` altına düşer.
2. **Makaleyi güncelle.** Çalışma 3'ün simüle sonuçlarının yanına gerçekleri koy. Ön kayıttan her sapmayı raporla.
3. **Çevreleri aç.** Sonraki adım `docs/company/circles.md`. Senin onayın ve 0037 göçü gerekiyor.
