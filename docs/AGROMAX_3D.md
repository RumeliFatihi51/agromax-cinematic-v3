# AgroMax 3D çalışma alanları

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
