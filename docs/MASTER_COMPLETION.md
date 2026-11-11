# AgroMax üretim kabul kaydı

11 Kasım 2026 · Başlangıç `f160a787643897804988f208e847155c7c9d7f3f`

Belgenin 2–19. bölümleri 18 modül tanımlıyor. Bölüm 20’deki modüller arası akış, istenen 19. kabul satırı olarak izleniyor. Canlı hesap köprüsü ve ticari Better Auth/Workflow derlemesi ayrı hedeflerdir. Bu tabloda **Kısmi**, çalışan parçaları bulunan ve PDF’nin tüm kabul ölçütlerini henüz karşılamayan modülü belirtir. **Dış doğrulama gerekli**, cihaz, veri veya hizmet erişimi gerektiren bir kabul adımıdır.

| # | Özellik ve bu değişiklikteki iş | Kod ve API | Yerel/gerçek veri kanıtı | Eksik önkoşul ve durum |
| --- | --- | --- | --- | --- |
| 1 | Parsel yönetimi. Ekim tarihi, iyimser sürüm kontrolü, güvenli geri alma ve geometri sürüm listesi. | `server/fields.js`, `commercial/compat.ts`, `FieldEditor.jsx`, `FieldAnalysis.jsx`. `/api/records/:id[/restore\|/revisions]`. | SQLite API’de yanlış sürüm 409, silme ve geri alma, dört sürüm. PostgreSQL köprü testi. Harita ve GeoJSON tarayıcı kapsamı. | Yeni sürümle üretimde oturumlu kabul ve mobil çizimin gerçek dokunmatik saha testi. **Kısmi** |
| 2 | Sentinel‑2. OAuth sağlayıcı ve Earth Search COG yolu, maskeler, kalıcı analiz ve raster. Bu turda sağlayıcı metadatası raporlamaya bağlandı. | `server/satellite.js`, `open-sentinel.js`, `parcel-satellite.js`. `/api/records/:id/analysis`, `/api/analyses/:id`, `/api/records/:id/image`. | Önceki üretim kaydı. Bu turda izole kuyruk, iptal, kalite ve raster testleri. | Bağımsız piksel/istatistik karşılaştırması ve yük testi. **Kısmi** |
| 3 | Çok kaynaklı uydu. HLS L30/S30 eklendi. Ortak Landsat ve radar okuyucuda paylaşılan SAS, tarih filtresi, yöntem ve kota durumu. | `server/public-observations.js`, `server/analysis-report.js`, `AnalysisReport.jsx`. `/api/analyses/:id`, `/api/platform/bootstrap`. | Planetary Computer üzerinden gerçek L30, S30, Landsat 9 ve Sentinel‑1 RTC COG örnekleri. | HLS/SAR/Landsat için bağımsız katman seçimi ve harita rasterı, doğrudan HLS Earthdata işlem rotası, RGB/multispektral drone adaptörü ve lisans. **Kısmi** |
| 4 | Spektral indeksler. Mevcut formüller korunuyor. Ek kaynaklarda bant mevcutsa NDVI, NDMI, NDWI, MNDWI, NBR, EVI, WDRVI ve S30 NDRE. | `shared/metrics.js`, `server/public-observations.js`. Analiz ve görsel API’leri. | HLS maskesi, ölçek, gerçek sıfır ve eksik piksel testi. Sentinel‑2 kalite/formül testleri. | Üretim hesabı favori ve ayar paritesi ile bağımsız sayısal referans seti. **Kısmi** |
| 5 | Zaman serileri ve geçmiş. Eski sınır kayıtları korunuyor. Tutarlılıkta yöntem/dönem farkları ve raporda CSV. | `TemporalStudio.jsx`, `server/field-consistency.js`, `commercial/reports/csv.ts`. `/api/analyses`, `/api/v1/observations/search`. | İzole tarayıcıda farklı tarih/raster ve eski sınır testi. | Mevsim/fenoloji hizalama ve bütün sensörlerde piksel düzeyinde değişim. **Kısmi** |
| 6 | Meteoroloji. MET Norway tahmini Dijital İkiz’e ve sorulduğunda Filiz’in kaynaklarına bağlandı. | `server/weather.js`, `TwinInputs.jsx`, `assistant/service.ts`. `/api/weather`, `/api/v1/weather/history`. | Birim, eksik veri, 304, sağlayıcı hatası ve kota testleri. NASA POWER geçmiş akışı mevcut. | Türkiye için resmi uyarı erişimi ve istasyon karşılaştırması. **Kısmi** |
| 7 | Filiz. Ürün/ekim, yetkili senaryo, reçete, saha kaydı ve gözlemsel iddia kaynakları. Aynı isteğin tekrarında kaynak eşleşmesi yeniden kontrol edilir. | `commercial/assistant/service.ts`, `commercial/records/workspace-files.ts`. `/api/v1/assistant/{ask,facts,help}`. | PostgreSQL’de sahipli kaynak ve önceki üretim Gemini akışı. | Yeni Gemini akışının canlı tarayıcı tekrarı, daha geniş kaynak/yöntem kabulü. **Kısmi** |
| 8 | Dijital İkiz. Güncel geometriyle eşleşen model girdileri, toprak/sensör kayıtları, meteoroloji ve yönetim dosyaları. | `TwinInputs.jsx`, `PlatformWorkspace.jsx`, `commercial/simulation`. `/api/platform/fields/:id`, `/api/v1/fields/:id/water-balance`. | Tarayıcıda girdiler ve PostgreSQL’de mevcut hesapla FAO‑56 pilotu. | Kalibre bitki/toprak modeli, bağımsız parsel/sezon ve tahmin-gözlem doğrulaması. **Kısmi** |
| 9 | Senaryo. Kopyalama, strateji, enerji ve ekipman, maliyet ve gelir girdileri. Mevcut hesapta kayıtlı parsel için FAO‑56 pilotu. | `shared/platform-contracts.js`, `PlatformWorkspace.jsx`, `commercial/simulation/api.ts`. `/api/platform/records`, `/api/v1/fields/:id/water-balance`. | Ondalık yuvarlama ve sürümlü kayıt, tarayıcı kopyalama ve ekonomik görünüm. İki hesapla su dengesi yetki testi. | Ürün ve iklime göre doğrulanmış senaryolar ve saha kalibrasyonu. **Kısmi** |
| 10 | Reçete. Doğrulanmış yönetim bölgeleri için alan ve toplam miktar hesabı. | `server/management-zones.js`, `server/platform.js`. `/api/platform/records/:id/export`. | Geometri, örtüşme, dış sınır, birim ve tarayıcı testleri. | Uzman kimliği, belirli sürüm onayı, agronomik veri ve saha kabulü. **Kısmi** |
| 11 | Drone. Sürümlü cihaz profilleri ve inceleme dosyaları mevcut. | `shared/platform.js`, `PlatformWorkspace.jsx`. `/api/platform/records/:id/export`. | Tarayıcı kayıt ve makine çalıştırma alanı kapalı JSON. | Marka/model, görev biçimi, üretici SDK/lisansı, görüntü örneği ve cihaz/simülatör testi. **Dış doğrulama gerekli** |
| 12 | Kanıt. Mevcut hesap köprüsünde gerçek geçmişten idempotent gözlemsel iddia, geometri ve yöntem sürümü. | `commercial/intelligence/{claims,api}.ts`. `/api/v1/fields/:id/claims`. | İki ayrı hesabın izolasyonu, tekrar aynı iddia/inceleme, kaynak analize bağ. | Bağımsız kanıt, saha/karşılaştırma grubu ve nedensel model. **Kısmi** |
| 13 | Tutarlılık. Tarih/sensör/bant/yöntem, geometri, eski dosya ve reçete işaretleri. | `server/field-consistency.js`, `PlatformWorkspace.jsx`. `/api/platform/fields/:id`. | Sahiplik, değişen geometri, gerçek kayıt boşluğu ve gözlemsel karşılaştırma testleri. | Eşzamanlı meteoroloji/sensör uyuşmazlığı ve daha geniş kalite kontrol seti. **Kısmi** |
| 14 | Saha incelemesi. Tarih, parsel içi konum, ölçüm, kaynak analiz ve kapanış sonucu. | `shared/platform-contracts.js`, `server/platform.js`, `PlatformWorkspace.jsx`. `/api/platform/records`, `/api/v1/fields/:id/claims/:claimId/investigation`. | Yabancı/eksik analiz, parsel dışı koordinat, sıfır ölçüm ve kapanış doğrulaması. | Yetkili fotoğraf ekleri, kişi atama ve tek inceleme kaydında Claim ile saha kapanışı. **Kısmi** |
| 15 | Ekonomi. Hektar başına maliyet, varsayımsal net gelir, kaynak ve hassasiyet. | `shared/platform-contracts.js`, `PlatformWorkspace.jsx`. Senaryo kayıt API’si. | Tam ondalık yuvarlama, farklı para birimi, gerçek sıfır ve tavan kontrolleri. | Doğrulanmış piyasa fiyatı/verim erişimi ve gerçekleşen etki karşılaştırması. **Kısmi** |
| 16 | MRV. Hesap köprüsüne v2 paket, iddialar, ölçümler, PDF özeti ve SHA‑256. | `commercial/intelligence/mrv.ts`, `production/workspace.ts`. `/api/v1/fields/:id/evidence-bundle`. | İki hesap, gerçek rapor dosya özeti ve paket doğrulaması izole PostgreSQL’de. | Seçilen MRV standardı, bağımsız uzman onayı ve sertifikasyon. **Kısmi** |
| 17 | Raporlar. Sabit rapor anlık kaydına uydu ek kaynakları, senaryo/saha/reçete, Filiz özeti ve yetkili CSV/JSON. | `commercial/reports/{service,pdf,csv,api}.ts`, `ReportsWorkspace.tsx`. `/api/v1/reports/:id/export?format=csv\|json`. | Özel PDF, CSV, JSON, sürüm ve yabancı hesap reddi. | Modüle göre bağımsız rapor türleri ve yeniden yayımlanmış üretim kabulü. **Kısmi** |
| 18 | Hesap ve işletme. İki çalışma yolunda mevcut oturum/rol korunuyor. Filiz kaynak tekrarı ve rapor dışa aktarımı tekrar yetkilendiriliyor. | `commercial/{auth,organizations,production}`, `server/application.js`. `/api/login`, `/api/auth`, `/api/v1/organizations`. | İzole çoklu tenant, eski hesap, oturum iptali ve rapor erişim testleri. | Üretim işlem e-postası, parola sıfırlama/e-posta doğrulama, çok kullanıcılı işletme cutover’ı ve kapsamlı güvenlik kabulü. **Kısmi** |
| 19 | Modüller arası akış. Parsel → uydu → geçmiş → Filiz → senaryo → inceleme → rapor ve kanıt bağlantıları. | Playwright `e2e/{platform,workspace,upgrade}.spec.ts`, PostgreSQL köprü testi. | Gerçek sağlayıcı çağrısı ve izole API/tarayıcı kanıtları ayrı tutulur. | Tek canlı senaryoda bütün zincir, gerçek cihaz ve saha verisiyle üretim kabulü. **Kısmi** |

## Gerçek sağlayıcı kanıtı

11 Kasım 2026’da izole yerel süreç, İzmir civarında bir test geometrisini kullanarak aşağıdaki arşiv COG pencerelerini okudu. Bu işlem canlı kullanıcı kaydı oluşturmadı.

| Kaynak | Sahne | Örnek çıktı | Süre |
| --- | --- | --- | --- |
| HLS L30 | `HLS.L30.T35SNC.2026279T084613.v2.0` | NDVI 0,576247 | 2,99 sn |
| HLS S30 | `HLS.S30.T35SNC.2026296T090021.v2.0` | NDVI 0,611104 ve NDRE 0,398991 | 2,85 sn |
| Landsat 9 L2 | `LC09_L2SP_181033_20261005_02_T1` | Yüzey sıcaklığı 23,682927 °C | 3,47 sn |
| Sentinel‑1 RTC | `S1C_IW_GRDH_1SDV_20261105T160624_20261105T160649_010204_0145F9_rtc` | VV −8,741036 dB | 3,52 sn |
| Sentinel‑2 L2A | Earth Search, aynı parselde iki dönem | 3 sahne, 36 katman, güncel NDVI 0,636959 | 19,39 sn |

İlk paralel denemede HTTP 429 alındı. Koleksiyonun depolama kapsayıcısı için tek paylaşılan, süreli SAS erişimi sonrası dört örnek başarılı oldu. Süreler tek örneğe aittir. Üretim kapasitesi, bağımsız hesap doğruluğu ve piksel düzeyinde bilimsel kabul ayrı ölçümlerdir. [NASA HLS ürünleri](https://hls.gsfc.nasa.gov/data-products/) · [Planetary Computer SAS](https://planetarycomputer.microsoft.com/docs/concepts/sas/)

MET Norway Locationforecast, aynı bölge için HTTP 200 ve 89 zaman noktası döndürdü. Dönen kayıt türü model tahminidir. [MET Norway Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation)

## Veri geçişi ve geri dönüş

Mevcut hesap yoluna `field_revisions` tablosu başlangıçta idempotent ve eklemeli olarak eklenir. İlk düzenlemede önceki sürümün özeti de saklanır. Ticari yol mevcut `audit_log` tablosunu okur. `analysis_claims` ve rapor tabloları için mevcut Drizzle migration’ları gerekir. Önceki kayıtların kimlikleri ve analiz snapshot’ları korunur. Geri dönüşte uygulama sürümünü geri alın, yeni tabloları ve satırları koruyun.

## Çalıştırma

`npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:commercial`, `npm.cmd run build`, `npm.cmd run build:commercial` ve `npm.cmd run test:browser`. Tarayıcı koşumu için `npx.cmd playwright install chromium`. İzole Playwright hesapları ve veritabanı `data/browser-fixtures-*` altında oluşturulur.

## Doğrulama sonuçları

| Kontrol | Sonuç |
| --- | --- |
| Tip kontrolü ve iki üretim derlemesi | Geçti |
| Node / SQLite testleri | 73 geçti |
| Ticari / izole PostgreSQL testleri | 23 geçti |
| Playwright normal paket | 17 geçti, 1 seçici hatası, 8 atlama. Seçici düzeltilip ilgili senaryo tekrar çalıştırıldığında geçti. |
| Gerçek Earth Search rasterı | İsteğe bağlı canlı COG testi masaüstü ve mobilde geçti. |
| Güvenlik | Hesap ve işletme izolasyonu, yabancı rapor ve iddia erişimi, eski sürüm, güvenli oturum ve iptal doğrulandı. `npm audit --omit=dev` sorgusunda 0 bildirim. |
| Paket büyüklüğü | Vite giriş JS dosyası yaklaşık 288 KB. Tembel yüklenen harita parçası yaklaşık 1,07 MB, 3D parçası 0,95 MB. Önceki sürümle karşılaştırmalı saha performansı ve Web Vitals henüz ölçülmedi. |

Geriye kalan bilinen sınırlar matriste ilgili modüllerde yer alır. Canlı sürüm, sağlayıcı kanıtı ve yerel Playwright sonuçları farklı kabul adımlarıdır.
