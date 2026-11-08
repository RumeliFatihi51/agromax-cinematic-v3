# AgroMax başlangıç denetimi

## İncelenen sürümler

- [AgroMax `eac227e`](https://github.com/erdoganenestr/Agromax/tree/eac227e0d322cd4e96e1f935e9f5533bf3d2c0b1). Ürün geliştirme dalı `codex/agromax-platform-upgrade`.
- [tarim2 `99dad08`](https://github.com/RumeliFatihi51/tarim2/tree/99dad08144b19ef326a2ddd4678659347c04d45c). İnceleme alanı editoryal düzen, medya, navigasyon ve azaltılmış hareket davranışı.

## Bulgular

| Alan | Koddan görülen durum | Kabulde sınanacak konu |
| --- | --- | --- |
| Çalışma yolları | `vercel.json` ve `scripts/production-build.mjs` eski Node girişini derler. `AGROMAX_WORKSPACE_ENABLED` mevcut oturumu ticari servislere bağlar. Vite/Nitro ticari derlemesi ayrı. | İki derlemenin API ve eski bağlantı regresyonları. |
| Hesap ve kuruluş | Better Auth, veritabanı hız sınırı ve üyelik kontrolü ticari uygulamada mevcut. Çalışma alanı köprüsü kişisel işletmeye bağlı. Ticari giriş noktası işlem e-postası adaptörü geçmiyor. | İki ayrı kuruluş, rol değişimi, oturum iptali, çapraz kaynak istekleri ve e-posta sağlayıcı durumu. |
| İş dayanıklılığı | Kuyruğa alma iş ve planı aynı işlemde yazar. Başlatma başarısızlığında satır bekler. İç gönderici eski, ticari planı olmayan işleri de seçebiliyor. | Gönderim kesintisi, tekrar başlatma, kuyruk sırası, iptal ve atomik sonuç yayını. |
| Uydu | `server/satellite.js` Sentinel-2 katalog, istatistik, RGB ve indeks işliyor. SCL, CLD ve sağlayıcıya özgü maskeler var. Sentinel-1 ve Landsat katalogdaki hazırlık durumları. | 23 formül, fiziksel birim ve kalite sınırları. Boş veya tümü maskeli sahne. |
| Bilim ve karar | Dijital ikiz parsel bağlamı, senaryolar kayıt ve maliyet hesabı. Kanıt ekranı dönem farkı gösteriyor. Reçete ve cihaz çıktıları inceleme taslağı. | Modelle gözlem ayrımı, bağımsız saha kalibrasyonu, revizyon ve uzman onayı. |
| Veri geçişi | Eski kayıtlar ve ticari projeksiyon ayrı kaynaklar. Eski içe aktarıcı boş hedef bekliyor ve aktif işleri reddediyor. | Köprüde üretilmiş kayıtlar dahil kimlik, geometri, rapor, Blob ve sonuç mutabakatı. |
| Arayüz | Canopy ve Fieldwork katmanları birlikte yükleniyor. AppShell odak yönetimi ve hareket azaltma içeriyor. Referans, geniş editoryal sıralar, özgün medya ve statik alternatifler kullanıyor. | Üç referans ekran, eski bağlantılar ve yedi genişlikte mobil/masaüstü kullanım. |

## Başlangıç doğrulaması

[AgroMax CI](https://github.com/erdoganenestr/Agromax/actions/runs/42397075774) tip kontrolü, sunucu ve ticari testler, iki derleme ve Playwright adımlarını geçti. [tarim2 CI](https://github.com/RumeliFatihi51/tarim2/actions/runs/41502791225) statik derlemeyi geçti. AgroMax başlangıç sürümü bu ortamda 60 sunucu, 18 ticari ve 6 Playwright testiyle tekrarlandı. Canlı adresler inceleme ortamından zaman aşımına uğradı. Sağlayıcı, saha ve cihaz kabulü yerel fixture sonuçlarından ayrı tutulur.
