# AgroMax 3D çalışma alanları

## 12 Kasım revizyonu

Başlangıç `b7989f7`, yerel dal `codex/agromax-3d-revision`. İncelenen başlangıç yolları Dijital İkiz, Çok Kaynaklı Uydu, Tarla Zekâsı, Reçete Planları, Senaryo Laboratuvarı ve 3D atlası kapsıyor. Önceki sahnede yüksek ışık ve kalın sınır çizgisi renkleri yıkıyor, düz DEM yedeğindeki düzenli ızgara tarla algısını zayıflatıyor ve senaryo karşılaştırması iki WebGL tuvali açıyordu. WGS84 dönüşümü, mevcut Leaflet çizimi, katman tarihleri ve sayısal piksel API’leri korunuyor.

- **Dijital İkiz.** Kayıtlı sınır, Esri bağlamı, Mapzen DEM ve tarihli görüntü mevcut arazi ağına konumlanır. Seçilen nokta sahnede işaretlenir. Yükseklik eksikse düz referans kullanılır. Optik analiz rengi ışık ve film tonlamasından korunur.
- **Temsili etüt.** Dijital İkiz’den ayrı açılır. Blender 5.2’de olgun buğday aşaması ayrıldı, taban geometrisi temizlendi, normaller yeniden hesaplandı, ağ sadeleştirildi ve doku boyutu düşürüldü. Kavisli bitki sıraları, PBR toprak ve aydınlatma ayrı çalışıldı. Web GLB yaklaşık 711 KB ve 539 üçgenli 468 buğday örneği içerir. Ayrıntılı buğday varlığı 212 KB ve 2.076 üçgendir. WebP ve GPU instancing kullanılır. Mobilde ve yazılımsal WebGL’de örnek yoğunluğu ve piksel oranı azaltılır, gölge kapalıdır. WebGL açılamadığında render posteri gösterilir.
- **Uydu incelemesi.** MapLibre üzerinden kayıtlı ve desteklenen Sentinel‑2 doğal renk PNG’si coğrafi köşelerine yerleştirilir. Earth Search ile kaydedilen sonuçlarda B04/B03/B02 ortak geçerli pikselleri kullanılır. 0–0,28 yüzey yansıtımı aralığı sRGB ekran rengine eşlenir. Sayısal indeks değerleri bu görüntü işlemesinden ayrı kalır. Seçim işareti ve sayısal değer ayrı gösterilir. Dönem farkı, NDMI/NDRE, kapsama, açık arşiv ve sağlayıcı ayrımları mevcut API’lerden gelir.
- **Karar desteği.** Kaynaklı gözlem, seçili nokta ve varsa reçete bölgesi aynı parsel bağlamında görünür. FAO‑56 3D karşılaştırması, planı ve günü tek tuvalde değiştirir. Plan sonuçları birlikte okunabilir. Model rengi tüm parselin tek değerini ifade eder.

### Referans ve varlık seçimi

İstenen Sketchfab köy/kanal kaydı API’de 404 döndü. Kırsal fotogrametri ve mısır kayıtları CC Attribution ve indirilebilir olarak listelendi. Kırsal fotogrametri yaklaşık 3,96 milyon yüz, mısır 55 bin yüz içeriyor. Buğday fenotipleme kaydı da CC Attribution ve indirilebilir olarak listelendi. Bu üç paket bu derlemeye alınmadı. Fab referansında satın alma seçenekleri vardı ve ücretsiz yeniden dağıtım doğrulanamadı. Cesium World Terrain yaklaşımı ve deck.gl TerrainLayer, GeoJsonLayer ve HexagonLayer dokümanları incelendi. Var olan MapLibre DEM ve deck.gl paylaşımı korunarak yeni harita motoru ve erişim anahtarı gereksiniminden kaçınıldı.

- [Buğday kaynak GLB ve lisansı](https://grab3d.com/models/nature/wheat-crop-stages/) · [Paket lisansı ve üretim açıklaması](https://grab3d.com/dl/wheat-crop-stages/LICENSE.txt)
- [Poly Haven toprak](https://polyhaven.com/a/dirt) · [Tarla HDRI](https://polyhaven.com/a/farm_field) · [Ağaç](https://polyhaven.com/a/tree_small_02) · [CC0 lisansı](https://polyhaven.com/license)
- [Fab örneği](https://www.fab.com/listings/ac7fa331-e125-4ce8-a6f9-3c2f6b5a2ef1) · [Cesium World Terrain](https://cesium.com/platform/cesium-ion/content/cesium-world-terrain/) · [deck.gl TerrainLayer](https://deck.gl/docs/api-reference/geo-layers/terrain-layer)

Blender yeniden üretimi için kaynak buğdayı `data/spatial-source/wheat-source.glb` yoluna, toprak haritalarını `soil-color.jpg`, `soil-normal.jpg`, `soil-rough.jpg` adlarıyla, 1K HDR’yi `farm-field.hdr` adıyla koyun. İsteğe bağlı ağaç için Poly Haven 1K glTF, `.bin` ve doku klasörü `data/spatial-source/tree` altında saklanır. Ana glTF dosyası `tree.gltf` olmalı. Depo kökünden `blender --background --python scripts/prepare-field-study.py` çalıştırılır. Blender kaynağı ve render `../../outputs/agromax-3d`, GLB’ler `public/visuals` altında oluşturulur. Varlıkların atıf kaydı `public/visuals/spatial-models.txt` içindedir.

### Kabul kanıtı ve açık işler

- 73 sunucu ve 23 ticari test, tip kontrolü ve iki üretim derlemesi geçti. 3D, açık Sentinel arşivi, senaryo ve reçete paketi 9 geçiş ve mobilde masaüstüne özel 1 atlama ile tamamlandı. Son sahne ayarları masaüstü/mobilde, plan geçişi ve tek tuval masaüstünde ayrıca sınandı.
- Canlı sağlayıcı doğrulaması Mapzen DEM, Esri altlığı ve Earth Search sayısal COG arşivini kapsadı. Ayrı doğal renk doğrulamasında `S2C_T35TNF_20250630T090706_L2A` sahnesinden 88 ortak geçerli RGB pikseli geldi. Reçete, FAO‑56 ve kayıtlı Copernicus katmanları izole test kayıtlarıyla sınandı.
- Playwright Chromium, ANGLE/SwiftShader ile çalıştı. 44 `requestAnimationFrame` aralığında masaüstü 1440×1000 için medyan 16,7 ms ve p95 116,7 ms, mobil 412×839 için medyan 16,7 ms ve p95 16,8 ms. Masaüstü yazılımsal WebGL, 33,3 ms hedefini sürekli karşılamadı. Donanım hızlandırmalı tarayıcı ve gerçek telefon FPS kabulü açık.
- Blender 5.2.2 kaynak dosyası yeniden açıldı. Sahne 473 nesne ve 25 paketli görüntü içerir. Web sahnesi yaklaşma açısında yakındaki buğday kümelerini ayrıntılı ağla değiştirir. Kaydedilmemiş açık arşiv RGB seçimi ve gerçek parsel içi bitki yoğunluğu ölçümü kapsam dışındaki açık maddelerdir.
- Önce/sonra görüntüleri, tarla etüdünün iki kamera açısı, mobil kanıt, FAO‑56 sahnesi ve ham kare ölçümleri `../../outputs/agromax-3d` altında. Canlı dağıtım ayrı yayın kararı gerektirir.

## Veri yolları

Leaflet mevcut parsel çizimini ve düzenlemeyi sürdürür. Dijital İkiz, kayıtlı WGS84 sınırını metreye ölçeklenmiş yerel Web Mercator düzlemine alır. Mevcut geodezik parsel alanı korunur. Aynı sınırın Polygon ve MultiPolygon parçaları ile iç boşlukları 3D yüzeyde maske olarak kullanılır.

- Dijital İkiz, Reçete Planları ve Senaryo Laboratuvarı özel sahneleri Three.js ve React Three Fiber kullanır.
- Çok Kaynaklı Uydu ile Tarla Zekâsı MapLibre üzerinden coğrafi harita açar. Sütun modu deck.gl katmanını aynı WebGL bağlamına ekler.
- Mapzen yükseklik döşemeleri ölçülen yükseklik girdisidir. Esri altlığı görsel konum bağlamıdır ve tarihli Sentinel gözlemiyle ayrı tutulur.
- Buğday ve mısır varlıkları isteğe bağlı ve temsilidir. Model lisansları [varlık notunda](../public/visuals/spatial-models.txt) yer alır.

## Sayısal uydu katmanı

`GET /api/platform/fields/{id}/spatial` güncel sınırla eşleşen kayıtlı Sentinel-2 gözlemlerinin tarih, yöntem, kaynak ve mevcut indekslerini döndürür. En fazla 20 analiz çalışması ve 180 benzersiz tarih taranır.

Mevcut `POST /api/records/{id}/image` çağrısına `format: "values"` eklendi. Bu biçimde `analysisId`, `date` ve `layer` gerekir. Sunucu erişim kapsamını, kayıtlı tarih aralığını, güncel parsel sınırını, sağlayıcıyı ve TIFF koordinatlarını doğrular. Aynı API’nin mevcut PNG yolu kullanılmaya devam eder.

Analitik ızgara EPSG:3857, en çok 96 × 96 hücre ve yakın komşu örnekleme kullanır. 20 m SCL/CLD maskesi ve katmanın bant çözünürlüğü yer örnekleme sınırını belirler. Bulutlu, geçersiz ve NoData hücreleri `null` döner. Piksel renkleri değiştirilebilir, alttaki değerler sabit kalır. Sütun yüksekliği indeksin görsel ölçeğidir. Fark yalnızca aynı kaynak, yöntem, ızgara ve parsel sürümündeki ortak geçerli piksellerden hesaplanır. MAD görünümü, gözlemsel farklardan saha kontrolü için aday hücreler seçer.

**Açık Sentinel-2 arşivi.** Bu ayrı kaynak Earth Search Collection 1 L2A kataloğundan sahne seçer ve AWS arşivindeki COG bantlarını HTTP aralık istekleriyle okur. Sorguda sağlayıcıya yalnızca dışa doğru 0,01 dereceye yuvarlanan arama zarfı gider. Asıl sınır, UTM dönüşümü ve piksel maskesi AgroMax içinde işlenir. NDVI, NDRE, NDMI, NDWI, EVI ve WDRVI (α 0,1) desteklenir. Bantlar STAC ölçek ve ofsetiyle yüzey yansıtımına çevrilir. SCL 4/5/6 ve bant NoData maskesi uygulanır. Gerçek çekim tarihi, sahne kimliği, ızgara ve yöntem arayüzde görünür. İki ayın sahneleri aynı parselde karşılaştırılabilir. Açık arşiv incelemeleri kayıtlı Copernicus analiz geçmişine yazılmaz.

Alan dağılımı, geçerli hücreleri kayıtlı parsel sınırına ve iç boşluklara göre keser. Yüzdelerin paydası geçerli ölçüm alanıdır. MAD sonucu komşu hücreler birleştirilerek alan ve alan ağırlıklı farkla incelenebilir. Aday bölgelerin GeoJSON çıktısı saha incelemesine veya dozun kullanıcı tarafından eklendiği reçete taslağına aktarılabilir.

## Karar destek verileri

Reçete bölgesi girdisi WGS84 GeoJSON FeatureCollection kabul eder. Her özellik Polygon veya MultiPolygon ve `properties.name` ile sayısal `properties.rate` içerir. Birim, reçetenin uygulama türünden gelir. Sunucu örtüşmeleri, dışarı taşan bölgeleri ve sınır sürümünü denetler. Bölgeler mevcut reçete ve sürüm kayıtlarında saklanır. Çalıştırılabilir cihaz dosyası ve uzman onayı mevcut iş akışına bağlıdır.

Konumu girilmiş saha gözlemleri mevcut gözlem kayıtlarında saklanır ve aynı sınır sürümünde gösterilir. Model karşılaştırması, yalnızca güncel parsel sürümüne bağlı FAO-56 çalışmasının günlük su açığını renklendirir. Su açığı tüm parsel için tek bir model çıktısıdır. Kalibre verim, piksel düzeyinde model sonucu ve otomatik doz üretimi ayrı önkoşullara bağlıdır.

## Çalıştırma ve doğrulama

- `npm run dev` mevcut yerel çalışma alanı.
- `npm run dev:commercial` işletme çalışma alanı ve FAO-56 modeli.
- `npm run typecheck`, `npm test`, `npm run test:commercial` ve iki üretim derlemesi.
- `npm run build:commercial` ardından `npm run test:browser -- spatial.spec.ts` hesap, parsel, Float32 TIFF, tarihler, 3D görünümler ve bölge taslakları için izole tarayıcı testleri.
- `AGROMAX_VERIFY_LIVE_TERRAIN=true` ile aynı tarayıcı testi gerçek Esri ve Mapzen döşemelerine de istek gönderir. Sentinel-2 taşıması bu testte açıkça etiketlenmiş fixture ile yalıtılır.
- `AGROMAX_VERIFY_OPEN_SENTINEL=true` ile `npm run test:browser -- spatial-open.spec.ts` açık arşivden gerçek Sentinel-2 sahnelerini, parsel yetkisini ve tarihler arası farkı doğrular.

Copernicus kayıtlı analiz yolu için sunucuda `SENTINEL_PROVIDER`, `SENTINEL_CLIENT_ID` ve `SENTINEL_CLIENT_SECRET` ayarlanır. Sağlayıcı erişimi hazır olduğunda kayıtlı bir parselde analiz çalıştırılır, tarih ve indeks seçilir, kaynak ve çözünürlük kontrol edilir. Açık arşiv OAuth gerektirmez. Landsat ve Sentinel-1’in mevcut katalog ve özet araçları ayrı çalışır.

Kaynaklar [Copernicus Sentinel-2 L2A](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html), [Earth Search Sentinel-2 COG arşivi](https://registry.opendata.aws/sentinel-2-l2a-cogs/), [Gitelson WDRVI](https://www.sciencedirect.com/science/article/pii/S0176161704705726), [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), [Mapzen veri lisansları](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) ve [deck.gl MapLibre entegrasyonu](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre).
