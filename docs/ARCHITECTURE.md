# Agromax geliştirme temeli

## Çalıştırma

Node.js 24 gereklidir. `app` klasöründe `npm.cmd install`, ardından `npm.cmd run dev` çalıştırın. Adres: http://127.0.0.1:5173

## Mevcut kapsam

- React arayüzü, Vite geliştirme sunucusu.
- Node HTTP API, SQLite kalıcı kayıtlar, scrypt parola özetleri ve HttpOnly oturum çerezleri.
- Hesap açma, giriş, çıkış; kullanıcıya özel tarla ve görev kayıtları; görev tamamlama.
- Örnek tarla, hava ölçümü, indeks veya analiz sonucu eklenmez.
- Sentinel-2 L2A gerçek sağlayıcı erişimi, doğrulanan 40 sayısal çıktı ve kaynak/kalite izi.
- SQLite kalıcı analiz kuyruğu, iptal, geçmiş sonuç snapshot'ları, gerçek olay bildirimleri ve analiz denetim kayıtları (`server/analysis-jobs.js`).
- Eski kullanıcı alan beyanları korunur. Yeni harita çizimleri geometriden yaklaşık hesaplanır; alanın kaynağı kaydedilir.
- Analiz geçmişi ve bildirim ekranları gerçek kayıtlarla çalışır. Tamamlanmamış diğer modüller açıkça etiketlenir; tam kapsam durumu `PRODUCT_AUDIT.md` içinde izlenir.

## Dosyalar

`src/components/Auth.jsx`: kimlik ekranları. `src/components/icons.js`: ikonlar. `src/features/modules.js`: modül kataloğu. `src/api.js`: HTTP istemcisi. `src/main.jsx`: uygulama kabuğu ve ilk ekranlar. `src/style.css`: temel görünüm. `src/features/fields/`: harita, düzenleyici, liste ve analiz bileşenleri. `src/features/assistant/`: Filiz. `server/index.js`: API kabuğu. `server/fields.js`: parsel işlemleri. `server/satellite.js`: uydu adaptörü. `shared/`: geometri doğrulama ve gösterge sözlüğü. `data/`: yerel veritabanı; sürüm kontrolüne alınmaz.

Ekranlar `features/<modül>/` altında, ortak UI `components/ui/` altında tutulur. API giriş/oturum bölümü hâlâ `server/index.js` içindedir ve ayrı authentication servisine ayrılmalıdır. Mevcut SQLite kuyruğu aynı Node sürecinde tek worker çalıştırır; üretimde çoklu instance için tekil worker sahipliği/lease veya haricî kuyruk gereklidir. Ticari mimari için modüler monolit API, PostgreSQL/PostGIS, coğrafi dosyalar için nesne depolama ve ayrı raster worker önerilir.

## Ticari yayından önce

Bu sürüm yalnızca loopback üzerinde çalışan yerel geliştirme sürümüdür; üretim servisi değildir. HTTPS, Secure cookie, e-posta doğrulama, şifre sıfırlama, kurumsal üyelik/yetki modeli, yedekleme, denetim kayıtları, erişim testleri ve KVKK süreçleri tamamlanmalıdır. `npm run build` arayüz çıktısı üretir; mevcut sunucu geliştirme middleware'i kullanır. Sadece dist klasörünü yayımlamak API'yi çalıştırmaz.

## Veri sözleşmesi

Entegrasyon modüllerindeki her sonuç kaynak, gözlem zamanı, işleme zamanı, mekânsal çözünürlük, kalite/bulut maskesi, birim, yöntem sürümü ve ölçüm/tahmin ayrımı taşımalıdır. Eksik, eski veya kalite kontrolünden geçemeyen sonuç için değer yerine açıklanmış boş durum dönmelidir. Geçersiz değerler sıfıra çevrilmemelidir. Hiçbir sistem mutlak hatasızlık vaat edemez; kullanıcıya doğrulanamayan bir sonuç kesin bilgi olarak gösterilmemelidir.

## İleri araştırma

RGB hava fotoğrafı NIR/red-edge bandı ölçmez. Öğrenilmiş spektral tahminler gerçek multispektral ölçüm olarak etiketlenemez. Eşleşmiş RGB/multispektral saha verisi, radyometrik kalibrasyon, bağımsız doğrulama ve ürün/bölge bazında hata ölçümü gereklidir. Şimdiki sürüm bu analizi yapmaz.
