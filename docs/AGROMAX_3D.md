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

## Senaryo karşılaştırması ve drone arazi katmanı

Senaryo Laboratuvarı kayıtlı model çalışmasının iki planını eşzamanlı çizer. Ortak kamera ve model günü iki görünümü birlikte yönetir. Yağış model girdisinden, sulama ve su açığı günlük model çıktısından gelir. Ortak günlere göre hesaplanan tablo farkı B − A yönündedir. FAO‑56 su açığı parsel geneli pilot model değeridir.

Dijital İkiz’de yetkili parsel düzenleyicisi **Drone ortomozaik ve arazi modeli** bölümünden tarih ve kaynak girerek 8 bit RGB/RGBA ortomozaik ve isteğe bağlı metre birimli tek bant DTM yükler. Dosyalar kuzeye hizalı, döşemeli COG biçiminde ve en fazla 50 MB olmalıdır. WGS84 ve WGS84/UTM EPSG kodları kabul edilir. Alfa ve NoData alanları saydam kalır. Drone yükseklik alanı dışında Mapzen rölyefi kullanılır. İki veri setinin örtüşmesindeki medyan ofset yalnızca sahne yüzeylerini hizalar. Nokta okuması kendi kaynağının değerini ve etiketini gösterir.

Ticari ve mevcut oturum köprüsü aynı API’yi kullanır. POST `/api/v1/fields/:id/terrain-datasets` kısa süreli yükleme bağlantısı açar. `/:datasetId/finish` doğrulamayı başlatır, `/:datasetId` durumu döndürür ve `/:datasetId/layers/:kind` yetkili oturuma görünüm dosyasını verir. Kaynak ve çıktı nesneleri özel kalır. Veri setleri mevcut sürümlü domain kayıtlarında saklanır. Ayrı şema migration’ı gerekmez. Üretimde özel Supabase S3 bucket yapılandırması gerekir. Bucket boyut sınırı 50 MB olmalı ve istemci kökeninden imzalı PUT çalışmalıdır. Depolama eksikse uydu ve Mapzen görünümü kullanılabilir.

Blender betiği paketlenmiş düzenlenebilir sahneyi, iki PNG renderı ve web GLB’sini üretir. PNG çıktıları çalışma alanındaki `outputs/agromax-terrain-v2` klasörüne gider. Buğday ve çevre ayrıntıları temsili saha etüdünde yer alır.

İzole tarayıcı testi `npm run test:browser -- terrain-v2.spec.ts` komutuyla çalışır. Gerçek veri denemesi için `AGROMAX_DRONE_SAMPLE_DIR` değişkeni, `sample.json` geometrisi, kaynak ve çekim tarihi ile `ortho.tif` ve `dtm.tif` içeren klasörü gösterir. Kanıt çekimi `AGROMAX_TERRAIN_EVIDENCE=true` ile açılır. QA kesiti Steve Vessey / GeoNadir Beesby Wood 10000 çekiminden kırpıldı ve yaklaşık 0,25 m örnekleme aralığında COG olarak paketlendi. Bu veri setindeki DTM’nin düşey datum bilgisi bulunmadığı için yükseklik kaynağın ham değeri olarak okunur. [GeoNadir çekimi](https://data.geonadir.com/image-collection-details/10000) · [Kaynak ve CC BY 4.0 lisansı](https://registry.opendata.aws/geonadir-fair-data/)

### Revizyon kabul kaydı

- Önceki sürüm `04ebcdd` ile yeni sürüm aynı Beesby parseli ve aynı izole model girdileriyle çalıştırıldı. Her iki ekran 1440 ve 390 CSS pikselinde görüntülendi.
- Lisanslı RGB kesitinde parsel kapsamı %100, DTM kesitinde %84,65 ölçüldü. Boş DTM alanlarında sahne Mapzen yüksekliğine kademeli geçer. Nokta okuması veri kaynağını ayrı gösterir. Model meteorolojisi ve toprak girdileri açıkça izole QA girdileridir.
- AMD Radeon Graphics ve Direct3D 11 üzerinde 79 kare aralığında ölçülen p95, 1440 px görünümde Dijital İkiz için 7,0 ms ve Senaryo Karşılaştırması için 7,1 ms oldu. 390 px görünüm masaüstü cihazda emüle edildi ve iki sahnede 7,1 ms ölçüldü.
- Gerçek COG doğrulaması ve kuruluş sınırı izole depolamada tarayıcıyla çalıştırıldı. Üretim Supabase bağlantısının imzalı yükleme ve CORS doğrulaması, canlı yayın adımında yapılır.

## 3D Saha Stüdyosu ve sürekli harita

- `#field-studio?field=<id>` ayrı gezinme girişidir. Parsel detayındaki 3D inceleme bu ekranda NDVI katmanını açar. Atlas, Dijital İkiz, Çok Kaynaklı Uydu, Tarla Zekâsı, Reçete Planları ve Senaryo Karşılaştırması aynı sürekli harita bileşenini kullanır. Çizim ve düzenleme mevcut 2D Leaflet akışında çalışır.
- Görsel altlık Mapbox Satellite Raster Tiles API ile alınır. Her ortam için URL kısıtlı Mapbox public tokenını `VITE_MAPBOX_ACCESS_TOKEN` olarak tanımlayıp derleyin. Anahtar eksikse veya Mapbox katmanı açılmazsa EOX Sentinel-2 Cloudless 2016 mozaiği denenir. Bu altlık da açılmazsa yol haritası gösterilir. Mapbox logosu ve veri atıfları harita üzerinde kalır. [Mapbox Satellite](https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/) · [Token kısıtları](https://docs.mapbox.com/accounts/guides/tokens/) · [EOX WMTS](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml)
- Mapzen çevre topoğrafyası sağlar. Yetkili drone görüntüsü haritaya kendi Mercator köşeleriyle serilir. Geçerli drone DTM pikselleri için özel tarayıcı protokolü yükseklik döşemeleri üretir. Geçişte düşey referans farkı görüntüleme için hizalanır. Nokta okuması kaynağın ölçüsünü gösterir. Coğrafi indeks katmanları mevcut uydu API’lerinden gelir.
- İndeks kataloğu veri sağlayıcısının desteklediği tarihli gözlemleri açar. Yüzey, sütun ve tarih farkı aynı veriye dayanır. Sütun yüksekliği indeks ölçeğidir. Maskeli pikseller haritada çizilmez. Mevsim, görevler, saha gözlemleri, reçete ve FAO-56 paneli mevcut kayıt sözleşmelerini kullanır. Fenoloji ölçümü veya cihaz çıktısı ancak kendi verisiyle gösterilebilir.
- Vite, MapLibre worker'ını sürümlü bir derleme çıktısı olarak yayımlar. Senaryo Karşılaştırması tek etkileşimli WebGL görünümünün karesini Plan B’ye yansıtır. 3D bağlamı kaybolduğunda tablonun yanı sıra 2D parsel haritası açılır.
- Mapbox Satellite bir görüntü mozaiğidir. Tekil bitki ve yapı geometrisi için sahaya ait fotogrametri gerekir. Temsili Blender tarla etüdü Dijital İkiz’den açılır. [Mapbox görüntü kapsamı](https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/)
- `#field-studio` girişindeki örnek panorama referanstaki eğik görüş ve tarla dokusuyla ImageGen’de üretildi. Üretim girdisinde referanstaki tarımsal vadinin arayüzsüz, etiketsiz ve yüksek ayrıntılı bir görünümü istendi. `public/visuals/studio-valley.webp` gösterim etiketiyle açılır. Parsel bağlantısıyla açılan sahne beş paneli gerçek parsel, sezon, reçete, uydu ve görev kayıtlarından doldurur.
- Mapbox yapılandırılmamışsa Stüdyo, tarihli Sentinel-2 L2A doğal renk görüntüsünü parsel çevresine de serer. `/api/platform/fields/:id/spatial/earth-search/landscape` yalnızca yetkili oturum ve geçerli geometri özetiyle açılır. Yakın tarih seçilirse gerçek çekim tarihi sahnede yazılır. RGB 10 m bantlarından üretilen görüntü 256 piksel kenar sınırına göre yeniden örneklenir. Maskeli alanlarda ve görüntü kenarlarında alttaki mozaik görünür. Geçerli drone ortomozaiği uydu çevresinin üzerinde kalır. Bu katman görsel bağlam sağlar. Analiz geçmişini değiştirmez. [Earth Search](https://github.com/Element84/earth-search) · [Sentinel-2 COG](https://registry.opendata.aws/sentinel-2-l2a-cogs/)
