# AgroMax özellik ve doğrulama matrisi

`Kısmi`, mevcut kodun yeteneğin bir bölümünü sunduğunu belirtir. `Implemented` ve `Tested` tamamlanan dilim için kullanılır. `Provider Verified`, `Scientifically Validated` ve `Production Ready` ayrı kanıt gerektirir. Boş kabul, ilgili kabulün yapılmadığını gösterir.

| Ana yetenek | Bu dalda yerel durum | Açık kapsam ve dış kabul |
| --- | --- | --- |
| 1. Çok kaynaklı uydu | Implemented · Tested. Derlenmiş Sentinel-2 Workflow, Sentinel-1 VV/VH istatistiği ve Landsat kalite/ölçek dönüşümleri. | Provider Verified yalnızca gerçek USGS STAC keşfi. CDSE SAR, AWS COG, raster katmanları ve lisanslı ticari kaynak kabulü açık. |
| 2. Dijital ikiz | Implemented · Tested. Parsel revizyonuna bağlı FAO-56 kök bölgesi pilotu. | Blocked. Trakya kışlık buğdayı için bağımsız toprak, sulama ve sezon verisi gerekiyor. |
| 3. Senaryo simülasyonu | Implemented · Tested. İki sulama takvimi, fiziksel çıktı, su ve maliyet kısıtı. | Gübre tepkisi, kapsamlı işçilik/enerji senaryoları ve bağımsız kalibrasyon açık. |
| 4. Tarla zekâsı | Implemented · Tested. Geçerli parsel gözlemlerinde medyan/MAD ve kaynaklı açıklama. | Saha etiketleri, bölge/piksel düzeyi ve bağımsız model değerlendirmesi açık. |
| 5. Arazi hafızası | Implemented · Tested. Geçmiş, kalite eşiği ve günlük gözlem grafiği. | Sezon, fenoloji, sensör hizalaması ve paralel harita karşılaştırması açık. |
| 6. Reçete haritaları | Mevcut inceleme taslağı Tested. | Yönetim bölgeleri, doz ve uzman onay zinciri açık. |
| 7. Drone birlikte çalışabilirliği | Mevcut inceleme paketi Tested. | Blocked. Cihaz biçimi, simülatör, firmware ve fiziksel içe aktarım kanıtı gerekiyor. |
| 8. Kanıt ve doğrulama | Implemented · Tested. Kalıcı dönem iddiası, kaynak, kalite ve sürüm referansı. | Kontrol parseli, saha ölçümü ve müdahale doğrulaması açık. |
| 9. Çelişki motoru | Implemented · Tested. Tarih kapsamı, gözlem desteği ve geometri uyarıları. | Sensör ve saha kaynakları arası semantik çözümleme açık. |
| 10. Saha incelemesi | Implemented · Tested. İddiaya bağlı, tekrar isteğinde tekil taslak ve öncelik. | Atama, saha ölçümü ve kapanış açık. |
| 11. Ekonomik analiz | Implemented · Tested. Mevcut maliyet aritmetiği ve sulama senaryosu bütçesi. | Fiyat kaynağı, gerçekleşmiş gelir ve doğrulanmış verimle kârlılık açık. |
| 12. MRV | Implemented · Tested. Sürümlü JSON paketi, model ve müdahale referansları, PDF dosya özetleri. | Bağımsız MRV metodolojisi ve sertifikasyon açık. |
| 13. Parsel ve kuruluş | Implemented · Tested. Mevcut roller, revizyon kontrolleri, izole taşıma ve yedek geri yükleme. | Üretim mutabakatı, gerçek özel dosya kurtarma ve geçiş açık. |
| 14. Web, mobil ve çevrimdışı | Implemented · Tested. Seçili parsel ve isteğe bağlı görev özeti, not taslağı, sürüm çakışması ve çıkış temizliği. | Tam WCAG elle inceleme, saha performansı ve cihaz matrisi açık. |

| İleri sistem | Başlangıç | Uygulama ve kabul boşluğu |
| --- | --- | --- |
| 1. Konumsal-zamansal anomali | Implemented · Tested parsel zaman serisinde | Piksel/bölge, sezon normalleri ve saha ölçümü açık. |
| 2. Gelişim ve verim | Implemented · Tested su dengesi ve sıcaklık toplamı | FAO Ky uygulaması ve bağımsız kalibrasyon açık. Verim çıktısı kapalı. |
| 3. Optimizasyon | Implemented · Tested | Girilen takvimler stres günü, su ve maliyetle sıralanır. Takvim üretimi ve reçete bağlantısı açık. |
| 4. Erken uyarı | Kısmi | Hava verisi mevcut. Sürümlü risk kuralları ve kaynak zamanı. |
| 5. Filiz Copilot | Implemented · Tested kaynaklı iddia rehberi | Gerçek model sağlayıcı kabulü ve daha geniş araç seti açık. |
| 6. Uzman orkestrasyonu | Hazırlık | Uzman çıktı sözleşmeleri ve çelişki kaydı. |
| 7. Karşı olgusal analiz | Hazırlık | Kontrol, ön eğilim ve yöntem kabulü. |
| 8. Federe öğrenme | Hazırlık | İzole eğitim turu. Gerçek veri için katılımcı izni ve gizlilik kabulü. |
| 9. Belirsizlik | Implemented · Tested ET₀ duyarlılığı | Model ve ürün bazında bağımsız hata ve aralık kalibrasyonu açık. |
| 10. Otonom izleme | Hazırlık | Olay anahtarı, zamanlanmış tarama ve bildirim tekrarı kontrolü. |
| Claim Engine | Implemented · Tested | Yeni tamamlanan Sentinel-2 işlemlerinde kaynaklı iddia oluşur. Eski kayıtlar kendi sürümleriyle korunur. |

Bu dal için `Scientifically Validated` veya `Production Ready` kabulü kaydedilmedi.
