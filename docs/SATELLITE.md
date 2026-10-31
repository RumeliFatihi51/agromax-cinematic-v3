# Parsel ve uydu modülleri

## Mevcut uygulama

- Harita varsayılan görünümdür; üstte listeye geçiş bulunur.
- Leaflet + Geoman Free: çokgen, dikdörtgen, köşe ekleme/silme/sürükleme, parsel taşıma/döndürme, kesme/delik açma, taslak silme, yakalama, 60 adım geri/ileri, GeoJSON içe/dışa aktarma, konuma/koordinata/parsellere odaklama.
- Oluşturma ve düzenleme kaydetmeden kalıcı olmaz. Vazgeç, kaydedilmiş sınırı değiştirmez. Parsel kaldırma soft delete kullanır; ekrandaki geri al düğmesi geri yükler.
- Polygon ve MultiPolygon desteklenir. Kesişen/açık/geçersiz sınırlar sunucuda da reddedilir. Alan WGS84 küresel yaklaşık hesaplamadır; resmî kadastro ölçümü değildir.
- Eski alan beyanları korunur; uydu analizi için önce sınır çizilmesi gerekir.
- Ayrı modüller: `src/features/fields/*`, `src/features/assistant/Filiz.jsx`, `server/fields.js`, `server/satellite.js`, `shared/geometry.js`, `shared/metrics.js`.

## Bağlantı

Kullanıcının seçtiği sağlayıcı Copernicus Data Space. Kimlik bilgileri `.env` içinde sunucuda tanımlı ve gerçek OAuth isteğiyle doğrulandı. `.env` Git dışında tutulur; `.env.example` yalnızca değişken adlarını içerir. Secret ve OAuth belirteci tarayıcıya veya doğrulama çıktılarına gönderilmez. Belirteç süresi dolana kadar sunucuda yeniden kullanılır.

30 Ekim 2026 canlı doğrulamasında kullanıcının mevcut parseliyle 36 katalog sahnesi ve 18 günlük mozaik aralığı alındı; 9 aralıkta geçerli NDVI örnekleri bulundu. Gerçek RGB ve NDMI PNG katmanları da doğrulandı. `scripts/live-copernicus-check.mjs` sağlayıcıyı mevcut geometriyle salt okunur sınar; `scripts/live-api-check.mjs` mevcut kullanıcı oturumuyla gerçek analiz başlatır, geçmiş/bildirim/görüntü ilişkisini doğrular. Kanıtlar Git dışında `data/verification/` altında tutulur. Başarılı geçmiş kontrolü sonraki servis erişimini garanti etmez; bağlantı ekranı bu sunucu oturumundaki gerçek yanıt zamanını gösterir.

## Sentinel-2 L2A kapsamı

23 indeks: NDVI, GNDVI, EVI, EVI2, SAVI (L=0,5), MSAVI2, OSAVI, NDRE (B8A/B05), NDRE2 (B8A/B06), NDRE3 (B8A/B07), GCI, RECI, NDMI, NDWI (McFeeters), MNDWI, NBR, NBR2, NDSI, BSI, PSRI, SIPI, ARVI, VARI.

12 yüzey yansıtımı bandı: B01, B02, B03, B04, B05, B06, B07, B08, B8A, B09, B11, B12. B10 bu L2A paketinde yoktur. AOT ve dört gözlem açısı (güneş azimut/zenit, ortalama bakış azimut/zenit) de işlenir. Açıların kaynak çözünürlüğü 5000 m, birimi derecedir; bunlar bitki göstergesi değildir. CDSE'de 40 desteklenen sayısal çıktı vardır. WVP katalogda tanımlı kalır ancak **CDSE bu koleksiyonda WVP sunmaz**; veri yerine desteklenmiyor durumu gösterilir. B09, WVP yerine kullanılamaz. NDSI ve MNDWI aynı formüle sahiptir ve bu sayı bağımsız fiziksel ölçüm sayısı değildir.

CDSE kalite bantları SCL, CLD, SNW ve dataMask'tır. CLP/CLM bu kaynakta yoktur; isteğe eklenmez. SCL 4/5/6 ve CLD<40 kabul edilir; gölge, bulut, kar ve sınıflanmamış alanlar dışlanır. Her sayısal çıktı için sonlu değer maskesi ayrıdır. SNW ve sınıflandırma verisi kalite izinde saklanır. Ticari Sentinel Hub adaptörü için WVP/CLP/CLM ayrı sağlayıcı sözleşmesinde tutulur. Kar maskelendiği için NDSI kar alanı hesabı için kullanılamaz.

## Dönem ve doğruluk

Avrupa/İstanbul ay sınırları UTC'ye çevrilir. Geçen takvim ayının tamamı ile mevcut ayın bugüne kadarki kısmı işlenir. Günlük SIMPLE/mostRecent mozaikleri 20 m UTM ızgarada örneklenir. Bantların doğal çözünürlüğü ayrı belirtilir; 60 m bandı 20 m örneklemek gerçek mekânsal çözünürlüğü artırmaz.

Geçerli piksellerin işlem ızgarasına oranı %70 altındaki günlük gözlemler dönem ortalamasına alınmaz. Maskelenmiş poligon dışı pikseller sağlayıcının örnek sayımı sözleşmesine bağlı olarak bu oranı düşürebilir; bu eşik korumacı bir kalite eleğidir ve kesin parsel bulut yüzdesi diye sunulmamalıdır. İki dönemin geçerli gözlemleri piksel sayısına göre ağırlıklı ortalanır; eksik dönem için fark üretilmez. Fark, indeks puanıdır; yüzde değişim değildir. Fenoloji, gözlem sıklığı ve kısmi/tam ay karşılaştırmasının sınırlaması açıklanır.

Ortalama, minimum, maksimum, standart sapma, P10/P50/P90 ve histogramlar sağlayıcıdan istenir. Kaynak yanıtı, tarih aralıkları, kalite maskesi, yöntem sürümü ve çekim katalog kayıtları saklanır. Katalog sayfaları tamamlanana kadar okunur; sessizce ilk 100 kayıtla kesilmez. Günlük mozaik tek bir çekim sahnesine eşit kabul edilmez. Çekim kayıtları ayrı listelenir.

İlk istek kullanıcı tarafından başlatılır. Beş dakikalık yeniden kullanım kotayı korur. Sayısal çıktılar sekizerli beş grup halinde alınır; bütün gruplar aynı aralıkları döndürüp doğrulanmadan sonuç yayımlanmaz. Ay veya geometri/yöntem değiştiğinde eski karşılaştırma yeni veri gibi gösterilmez. JSON/CSV dışa aktarılır.

PNG katmanları gerçek katalog tarihine ve analiz sürümüne bağlanır. İndeks, kaynak bant, AOT ve açı katmanları seçilebilir. Renk ölçeği ilgili günün gerçek minimum–maksimum istatistiğinden türetilir; sabit −1/+1 aralığı bütün göstergelere uygulanmaz. SCL 4/5/6 ve CLD<40 görüntü maskesi kullanılır. Tamamen saydam görüntü 422 ile reddedilir; gerçek açık piksel yoksa boş görüntü başarı sayılmaz. Görüntü boyutu doğal mekânsal çözünürlüğü artırmaz. Geçmiş analiz görüntüsü kendi kayıtlı geometrisini, günlük aralığını ve ölçeğini kullanır.

## Kalıcı işlem geçmişi

`server/analysis-jobs.js` SQLite işlem kuyruğunu yönetir. POST analiz isteği 202 ile gerçek işlem kimliği döndürür; durum `/api/analyses/:id` üzerinden izlenir. Kuyrukta/işleniyor/tamamlandı/başarısız/iptal gerçek durum geçişleridir. Aktif istek AbortController ile durdurulabilir. Başarılı sonuç ve önbellek tek transaction içinde yazılır; başarısız/iptal/değişen geometri sonucunda eski önbellek korunur. Her sonuç kendi sürümünü ve parsel snapshot'ını kalıcı saklar. Yeniden başlatmada yalnızca gerçekten çalışır durumda bırakılmış işler başarısız/yarıda kaldı olarak kaydedilir. Bildirimler gerçek terminal olaylardan oluşur ve kullanıcı sahipliğiyle korunur; okundu durumu kalıcıdır.

## Diğer erişimler

- Sentinel-1 GRD SAR: aynı hesabın koleksiyon yetkisi ve ayrı radar işleme adaptörü; henüz uygulanmadı. Radar yansıtımı doğrudan toprak nemi değildir.
- Landsat 8/9 termal: koleksiyon erişimi, kalite kontrolü ve uygun yüzey sıcaklığı işleme zinciri; henüz uygulanmadı. Sentinel-2 termal bant taşımaz.
- Meteoroloji/ET0: ticari meteoroloji sağlayıcı anahtarı, ürün ve sulama bilgileri gerekli.
- Filiz: şu anda kendi tarla/görev kayıtlarından kurallı özet verir. Bir dil modeli/API sağlayıcısı henüz seçilmedi. Hastalık veya gübre önerisi üretmez.
- Yüksek trafikli ticari harita için uygun tile sağlayıcısı veya kendi tile sunucusu gerekir. Standart OSM sunucusunun kullanım politikası ve atfı korunmalı; çevrimdışı toplu tile indirme yapılmaz.

## Resmî teknik kaynaklar

- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical/Examples.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Catalog.html
- https://dataspace.copernicus.eu/news/2026-3-9-api-path-structure-updates-sentinel-hub-services
- https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/
- https://geoman.io/docs/leaflet
- https://operations.osmfoundation.org/policies/tiles/

Formüller tek bir evrensel “tüm tarımsal veri” listesi değildir. Her yeni gösterge/uydu, fiziksel anlamı, yerel geçerliliği, lisansı ve testleriyle ayrıca eklenmelidir. Ticari sahaya çıkmadan önce gerçek parseller ve bağımsız referanslarla uçtan uca karşılaştırma gereklidir.
