# AgroMax Cinematic V3

## Yerleşim ve uygulama sırası

Referans 1672 × 941 px. Sol menü x 0–261, çalışma alanı x 280–1311, Filiz x 1327–1664. Hero y 0–255, KPI y 235–344, harita ve parsel y 362–735, modüller y 753–918. Harita yaklaşık %64, parsel paneli %36. Renk ailesi koyu orman, sıcak ivory ve botanik yeşil. Başlık serif, kontroller Instrument Sans.

1. Mevcut Dashboard kompozisyonunu yeniden kur. AppShell menü, arama, bildirim, oturum ve kuruluş davranışlarını taşısın. Parsel çizimi mevcut ParcelMap ve FieldEditor üzerinden yürüsün.
2. Dashboard kendi grid ve yüzey kurallarına sahip olsun. Kullanılmayan eski Dashboard kuralları kaldırılırken diğer modüllerin kullandığı ortak sınıflar korunur.
3. Hero posterinden başla. tarim2 SceneRefinement’teki maskeyi, sınırlı ölçek değişimini ve yaşam döngüsü temizliğini GSAP ile uygula. Basit etkileşimleri CSS ile çalıştır. Görsel ve metin CSS başlangıcında görünür kalır. Ağ ve veri durumu animasyondan bağımsızdır.
4. Parsel, analiz geçmişi, hava, uydu katmanı ve Filiz gerçek uçlardan gelir. Uygun analiz ve erişim yoksa arayüz ilgili boş veya hata durumunu gösterir.
5. Tablet ve telefonda Filiz ayrı çalışma alanına, parsel özeti mobil alt panele geçer. Sekiz viewport, hareket tercihi, canlı etkileşim ve mevcut regresyonlar tarayıcıda sınanır.

## Gözlem ve model çalışma alanları

| Ekran | Ana çalışma yüzeyi | Kaynak ve sürüm |
| --- | --- | --- |
| Parsel Analizi | Uydu haritası, katman ve çekim seçimi. Tarih, alttaki nokta grafiğinde işaretlenir. | Sağdaki kaynak dosyası yöntem, dönem, maske ve analiz kaydını gösterir. Katman hatasında son yüklenen görüntü kendi etiketiyle kalır. |
| Arazi Hafızası | Yatay işlem çizelgesi, çekim haritası ve seçilen göstergenin grafiği. | Kayıtlı analiz, kayıtlı parsel sınırı ve bu analizin katalog tarihleri birlikte kullanılır. Tamamlanmamış işlemler kendi durumunu gösterir. |
| Dijital İkiz | Kayıtlı sınır çizimi, parsel özellikleri ve model durumu. | Sınır kimliği, son uydu kaynağı ve varsa FAO-56 pilotu görünür. Kontur deseni görsel kimlik öğesidir. |
| Senaryo Laboratuvarı | Sulama girdileri, günlük su açığı grafiği ve maliyet tablosu. | Grafik kayıtlı model çıktısını, fiziksel kapasite ölçeğini ve stres eşiğini kullanır. Kullanıcı maliyet taslakları ayrı bölümde kalır. |

Parsel Analizi ve Arazi Hafızası aynı uydu sahnesi bileşenini kullanır. Parsel Analizi başlığı, kaynak kutusu ve harita kontrollerinin eski CSS katmanlarındaki kuralları kaldırıldı. Parsel önizlemesi MultiPolygon parçalarını ve iç halkaları gösterir.

## Tarayıcıda ölçülen kompozisyon

1672 × 941 px Chromium çıktısı. Değerler en yakın tam piksele yuvarlandı.

| Ölçü | Referans | Uygulama |
| --- | ---: | ---: |
| Sol menü genişliği | 261 | 261 |
| Hero yüksekliği | 255 | 254 |
| KPI üst sınırı | 235 | 235 |
| Harita ve parsel paneli üst sınırı | 362 | 362 |
| Harita genişliği | 659 | 659 |
| Filiz sol sınırı ve genişliği | 1327 / 337 | 1327 / 337 |
| Alt modül kartları üst sınırı | 753 | 754 |

Playwright görüntüleri izole uydu ve PostgreSQL verileri kullanır. Tarihsel raster testi, parsel güncellendikten sonra eski analiz kimliğiyle yapılan isteğin özgün sınırı döndürdüğünü doğrular. Arazi Hafızası, 390 px genişlikte haritanın ilk görünümde başlamasını ve yatay taşma olmamasını kontrol eder.

## Sekme kapsamı ve modern tipografi

Web arayüzünde Manrope tek font ailesi. `Manrope-UI-Variable.woff2`, depodaki `Manrope-Variable.ttf` dosyasından ağırlık ekseni ve hizalı rakam özelliği korunarak üretildi. Türkçe büyük ve küçük harfler ile lira simgesi fontun karakter haritasında doğrulandı. Masaüstünde Genel Bakış referans ölçümleri için ayrı toleranslar uygulanır.

| Alan | Ana rotalar | Alt görünümler |
| --- | --- | --- |
| Genel Bakış | `overview` | Mobil parsel analizi alt paneli |
| Gözlem | `platform`, `fields`, `satellite`, `temporal`, `history`, `weather` | Atlas, harita, liste, parsel detayı, arşiv analizi, geçmiş hava |
| Zekâ | `intelligence`, `evidence`, `contradictions`, `investigation` | İddia ve kaynak seçimi, inceleme taslağı |
| Kararlar | `twin`, `scenarios`, `economics`, `finance` | Su dengesi girdileri ve sonuçları, para birimi grupları, maliyet satırı |
| Saha | `tasks`, `operations`, `prescriptions`, `drones` | Sezon, sulama, besleme, koruma, toprak, değerlendirme |
| Rapor ve platform | `reports`, `mrv`, `access`, `assistant`, `notifications`, `integrations`, `settings` | Rapor önizlemesi, Filiz kaynakları, profil, tercihler, güvenlik, oturumlar, işletme ve abonelik |

Başlık çizimleri ve hareket seçimi `SceneSurface` bileşeninde tanımlı. Çizimler dekoratif ve erişilebilirlik ağacından çıkarılmış durumda. Raster, grafik, cihaz durumu, kayıt sayıları ve Filiz kaynakları uygulamanın kendi veri bileşenlerinden geliyor. Yerleşim ve görüntü kanıtları Playwright ile alınır. Filiz yanıtı tarayıcıda açıkça etiketli bir test yanıtıyla sınanır.

[tarim2 hareket ve sahne referansı](https://github.com/RumeliFatihi51/tarim2/tree/99dad08144b19ef326a2ddd4678659347c04d45c/src)

## PDF referanslarına dayalı yenileme

PDF'deki ana bölüm, dosya sayfası 3–23 arasındaki 21 referansı içerir. Açık krem yüzeyler, koyu orman menüsü, ince arazi çizgileri ve işlevin öne çıktığı çalışma yüzeyleri bu bölümden alındı. Dosya sayfası 24–44 arasındaki alternatifler yardımcı referanstır.

| PDF sayfası | Uygulama karşılığı |
| --- | --- |
| 3–6 | Genel Bakış kompozisyonu, Platform Merkezi, atlas–harita–liste, uydu kaynakları |
| 7–10 | Tarih şeridi ve gözlem, işlem durumu özeti, tahmin ve geçmiş hava, parsel bağlamlı Tarla Zekâsı |
| 11–13 | Dijital İkiz gerçek parsel haritası, Filiz soru ve kaynak alanları, parsel analiz sahnesi |
| 14–16 | Su dengesi ve senaryo karşılaştırması, para birimine göre maliyet grafikleri ve gider defteri |
| 17–19 | Tutarlılık, kanıt ve saha incelemesinin kayıtlı sınır ve analiz bağlamı |
| 20–23 | Takvim ve görevler, altı saha iş akışı, reçete sınırı, rapor arşivi ve önizleme, MRV, hesap ve işletme |

PDF'de ayrı ana görseli bulunmayan dron bağlantıları, web ve mobil erişim, bildirimler ve veri bağlantıları aynı yüzey ve durum kurallarına bağlıdır. Referanslarda örnek olarak çizilen değerler ürün verisi olarak kullanılmaz. İkiz ve inceleme haritalarında yalnızca kayıtlı parsel geometrisi gösterilir. Reçete, MRV, uydu ve cihaz durumları mevcut hizmetin verdiği kapsamı belirtir.

## Tanıtım filmleri ve sekme geçişleri

`tarim2` deposunun sabitlenen sürümünden on film ve beş fotoğraf seçildi. Filmler yaklaşık 3,75 saniyelik sessiz bölümler olarak yeniden kodlandı. Beş fotoğraf, rapor ve arşiv gibi daha durağan çalışma yüzeylerine ayrıldı. Kadrajlar ufuk, arazi taraması, optik, botanik, saha ve arşiv olarak gruplanır. Modül ve alt sekme eşlemesi `src/features/cinema/sceneFilms.js` içindedir. [Kaynak medya](https://github.com/RumeliFatihi51/tarim2/tree/99dad08144b19ef326a2ddd4678659347c04d45c/public/media)

Ana rota, alt sekme ve hesap modu değişimlerinde tanıtım sitesindeki koyu yeşil perde açılır. Geçiş masaüstünde 420 ms, telefonda 340 ms sürer. Başlık, içeriği geldiğinde 235 ms süren düşey veya yatay maskeyle açılır. Bu hareketler gezinmeyi bekletmez ve azaltılmış hareket tercihinde kapatılır. Mobilde saha ve hesap sekmeleri yatay kaydırılır ve 44 px dokunma alanı kullanır.

İlk kare WebP posterdir. Mobilde hareketli sahneler için 384 × 216 MP4 seçilir. Mobil videolar 19–96 KB, tüm masaüstü videoları 249 KB'nin altındadır. Senaryo ve reçete gibi yoğun çalışma alanlarında mobil açılış hareketi poster üzerinden oynar. Tarayıcı yalnızca görünür sahne için bir video sürümü ister. Mobil sahne 300 ms görünür kaldıktan sonra klip yüklenir. Azaltılmış hareket, veri tasarrufu, yavaş bağlantı ve medya hatasında poster gösterilir. Video görünürlük kaybında durur, bir kez oynar ve ekran kapanınca kaynağını bırakır. Görsel kaynakları ve CC BY 3.0 atıfları platformun altbilgisinden açılır.

Hesap alanı tanıtım sitesindeki Observation Portal düzenini ve orijinal `field` filmini kullanır. Video görünürken sessiz döngüde oynar. Oynatma duraklatılabilir. Filiz'de sorular ve yanıtlar yazma alanının üstündeki tek sohbet akışında yer alır. Model durumu ve kaynak hatası ayrı gösterilir. Atlas ve harita görünümlerinde altlık, konum araçları ve arama tek bir araç alanında yer alır. Harita, boş kayıtta parsel odağı yerine ilk sınırın çizilmesi gerektiğini bildirir.
