# NASA erişimleri

İki kimlik birbirinin yerine geçmez:

- `NASA_API_KEY`: NASA Open APIs geçidi. Anahtarın varlığı arazi, hava tahmini veya multispektral sonuç alındığı anlamına gelmez.
- `EARTHDATA_TOKEN`: NASA Earthdata korumalı veri erişimi. HLS gibi koleksiyonların gerçek bant dosyalarına erişim için kullanılır.

Gerçek değerler yalnızca Git dışında `.env` içinde saklanır. Vercel dağıtımında sunucu ortam değişkenleri kullanılmalıdır; `VITE_` öneki eklenmez. Örnek dosya boş değişken adları içerir.

## Uygulanan doğrulama

`server/nasa.js` iki bağımsız erişimi sınar. Sonuçları `integration_checks` tablosunda kontrol zamanı ve kimlik bilgisinin tek yönlü özetiyle tutar. Anahtar veya token veritabanı kontrol kaydına, API yanıtına ya da frontend'e yazılmaz. Kimlik değişince eski doğrulama geçersiz sayılır. Başarılı kontroller beş dakika yeniden kullanılabilir.

- NASA geçit kontrolü belgelenmiş, küçük bir servis isteğiyle yapılır. Astronomi yanıtı atılır; tarımsal veri olarak kullanılmaz.
- Earthdata için CMR'den gerçek bir HLSL30 v2.0 kaydı bulunur. Korumalı B04 dosyasının ilk baytları istenir ve gerçek TIFF imzası kontrol edilir. Tam raster indirilmez. CDN yönlendirmesinde kullanıcı tokenı aktarılmaz.
- `/api/nasa/status` ve `/api/nasa/verify` oturum açmış kullanıcılara açıktır. `Veri bağlantıları` ekranı yapılandırma, doğrulanmamış, doğrulanmış, yetkisiz, hız sınırı ve servis hatası durumlarını ayırır.

31 Ekim 2026 canlı kontrolü: NASA geçidi HTTP 200; Earthdata korumalı HLS bant erişimi HTTP 206 ve TIFF imzası. Aynı korumalı dosyaya tokensız istek Earthdata girişine yönlendirildi. Bunlar gerçek erişim kanıtlarıdır; tarla analizi yapıldığına dair kanıt değildir.

## Kalan HLS çalışması

HLS parsel analizi henüz uygulanmadı. HLS L30 ve S30 bant eşlemesi, ölçek/offset, Fmask kalite bitleri, 30 m örnekleme, bulut/gölge/kar maskeleri ve formül doğrulaması ayrı işlem zinciri gerektirir. Mevcut sonuçlar Copernicus Sentinel-2 L2A kaynağı olarak etiketlenmeye devam eder. Erişim testi bu işlemleri tamamlanmış göstermez.

NASA POWER meteoroloji hizmeti ayrıca değerlendirilmelidir. Anahtar veya Earthdata tokenı sağlamak meteoroloji verisinin bağlandığı anlamına gelmez.

Resmî kaynaklar:

- https://api.nasa.gov/
- https://urs.earthdata.nasa.gov/documentation/for_users/user_token
- https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
- https://hls.gsfc.nasa.gov/data-products/
- https://power.larc.nasa.gov/docs/services/api/
