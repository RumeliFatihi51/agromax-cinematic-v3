# Agromax görsel kimliği

## Kullanılan tasarım

Logo, “A” harfini yaprak ve tarla sıralarıyla birleştirir. Vektör işaret kodla çizildi; küçük boyutlarda keskin kalır. `src/components/Brand.jsx` giriş ekranı, menü ve yükleme ekranında ortak kullanılır. `src/styles/brand.css` logo ölçülerini, Filiz görsellerini ve giriş kompozisyonunu yönetir.

Giriş illüstrasyonu ve Filiz simgesi yerleşik ImageGen ile üretildi; kaynak çıktılar kopyalanarak projeye alındı. Üretim istemleri [BRAND_PROMPTS.md](BRAND_PROMPTS.md) dosyasındadır. CLI kullanılmadı.

İllüstrasyon yalnızca giriş/kayıt ekranındaki dekoratif marka alanında kullanılır; gerçek coğrafi veri gibi sunulmaz. Ekranda “Marka illüstrasyonu · Gerçek arazi veya uydu görüntüsü değildir.” etiketi bulunur. Etkileşimli tarla haritaları gerçek Esri/OSM altlıklarını, analizler tarihli veri adaptörünü kullanmaya devam eder.

## Dosyalar ve ölçüler

Tüm görseller `app/public/brand/` altında kalıcıdır. Çalışan arayüz, PNG kaynakları yerine uygun WebP boyutlarını yükler. Şeffaf Filiz görselinin alfa kanalı korunur.

| Dosya | Boyut | Kullanım |
| --- | --- | --- |
| agromax-mark-v1.svg | 64 × 64 görünüm kutusu, ölçeklenebilir | Açık yüzeyler için ana işaret |
| agromax-mark-light-v1.svg | 64 × 64 görünüm kutusu, ölçeklenebilir | Koyu yüzeyler için açık işaret |
| agromax-logo-v1.svg | 260 × 64 görünüm kutusu, ölçeklenebilir | Tam logo; yazılar vektör eğrisidir, font gerektirmez |
| agromax-logo-light-v1.svg | 260 × 64 görünüm kutusu, ölçeklenebilir | Koyu yüzeylerde tam logo |
| agromax-logo-v1.png | 1040 × 256, şeffaf | Paylaşım / doküman için tam logo |
| agromax-logo-light-v1.png | 1040 × 256, şeffaf | Koyu yüzeylerde PNG logo |
| agromax-icon-32.png | 32 × 32 | Tarayıcı sekmesi |
| agromax-icon-180.png | 180 × 180 | Apple dokunmatik simgesi |
| agromax-icon-192.png | 192 × 192 | Uygulama manifesti |
| agromax-icon-512.png | 512 × 512 | Büyük uygulama simgesi |
| agromax-landscape-v1.png | 1024 × 1536 | Üretilen illüstrasyonun PNG kaynağı |
| agromax-landscape-v1.webp | 1024 × 1536 | Masaüstü giriş ekranı, yaklaşık 245 KB |
| agromax-landscape-v1-768.webp | 768 × 1152 | Daha küçük ekranlar, yaklaşık 133 KB |
| filiz-emblem-v1.png | 1254 × 1254, RGBA | Üretilen şeffaf Filiz kaynağı |
| filiz-emblem-v1-256.webp | 256 × 256, alfa | Menü, kart ve mesaj simgesi, yaklaşık 15 KB |
| filiz-emblem-v1-512.webp | 512 × 512, alfa | Daha büyük/yüksek yoğunluklu avatar, yaklaşık 42 KB |

Menüde logo işareti 31–39 px, girişte 36–42 px gösterilir. Filiz simgesi menüde 37 px, ana ekran kartında 46 px ve asistan başlığında 94 px kullanılır. Mobil kırpma ve `srcset` seçimi CSS/HTML üzerinden yapılır; görsel dosyalarına veri etiketleri çizilmez.

## Düzenleme

- Logoyu değiştirmek için SVG kaynaklarını düzenleyin. Önce `python scripts/build-logo-lockups.py`, ardından `node scripts/build-brand-assets.mjs` ile tam vektör logoları ve PNG'leri üretin. Python betiği fontTools kullanır. `@resvg/resvg-js` yalnızca geliştirme bağımlılığıdır.
- Başlık ve renkler `src/styles/brand.css` dosyasındadır; form işlevleri `Auth.jsx` içinde kalır.
- Üretilen yeni sanat varyantlarını farklı sürüm adıyla kaydedin. PNG kaynaklarını koruyun; çalışma arayüzünde optimize edilmiş boyutları kullanın.
- `index.html` favicon, Apple simgesi, tema rengi ve açıklamayı içerir. Manifest tek başına çevrimdışı çalışma veya tam PWA desteği sağlamaz.

Manrope değişken fontunun Türkçe/Latin karakterleri içeren WOFF2 sürümü yaklaşık 29 KB olarak yerel sunulur: `public/fonts/Manrope-Latin-Variable.woff2`. Kaynak font ve SIL Open Font License dosyası aynı klasördedir. Kaynak: `https://github.com/google/fonts/tree/main/ofl/manrope`. Tam SVG logolarda yazı eğrilere dönüştürüldüğü için haricî font gerekmez. Harita ve modül kodları da giriş ekranında yüklenmemesi için ayrı parçalar halinde derlenir.

Doğrulama: Logo PNG'si görsel olarak incelendi; üretilen iki görsel araç çıktısında incelendi. Dosya ölçüleri, Filiz alfa kanalı, derleme ve yerel varlık URL'leri ayrıca kontrol edilir. Tarayıcı düzeninin ekran görüntüsüyle doğrulandığı iddia edilmez.
