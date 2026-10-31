# Agromax geliştirme temeli

## Çalıştırma

Node.js 24 gereklidir. `app` klasöründe `npm.cmd install`, ardından `npm.cmd run dev` çalıştırın. Adres: http://127.0.0.1:5173

## Mevcut kapsam

- React arayüzü, Vite geliştirme sunucusu.
- Ortak Node HTTP API; yerelde SQLite, Vercel'de Neon PostgreSQL; scrypt parola özetleri ve HttpOnly oturum çerezleri.
- Hesap açma, giriş, çıkış; kullanıcıya özel tarla ve görev kayıtları; görev tamamlama.
- Örnek tarla, hava ölçümü, indeks veya analiz sonucu eklenmez.
- Sentinel-2 L2A gerçek sağlayıcı erişimi, doğrulanan 40 sayısal çıktı ve kaynak/kalite izi.
- Veritabanında kalıcı analiz kuyruğu, atomik iş sahipliği, iptal, geçmiş sonuç snapshot'ları, gerçek olay bildirimleri ve analiz denetim kayıtları (`server/analysis-jobs.js`).
- Eski kullanıcı alan beyanları korunur. Yeni harita çizimleri geometriden yaklaşık hesaplanır; alanın kaynağı kaydedilir.
- Analiz geçmişi ve bildirim ekranları gerçek kayıtlarla çalışır. Tamamlanmamış diğer modüller açıkça etiketlenir; tam kapsam durumu `PRODUCT_AUDIT.md` içinde izlenir.

## Dosyalar

`src/components/Auth.jsx`: kimlik ekranları. `src/components/icons.js`: ikonlar. `src/features/modules.js`: modül kataloğu. `src/api.js`: HTTP istemcisi. `src/main.jsx`: uygulama kabuğu ve ilk ekranlar. `src/style.css`: temel görünüm. `src/features/fields/`: harita, düzenleyici, liste ve analiz bileşenleri. `src/features/assistant/`: Filiz. `server/index.js`: API kabuğu. `server/fields.js`: parsel işlemleri. `server/satellite.js`: uydu adaptörü. `shared/`: geometri doğrulama ve gösterge sözlüğü. `data/`: yerel veritabanı; sürüm kontrolüne alınmaz.

Ekranlar `features/<modül>/` altında, ortak UI `components/ui/` altında tutulur. `server/application.js` ortak API ve oturum girişidir; `server/index.js` yalnızca yerel HTTP/Vite başlangıcıdır. `api/index.js` Vercel Function girişidir. `server/database.js` parametreli sorgu ve transaction adaptörlerini içerir. Üretimde `DATABASE_URL` zorunludur; geçici dosya sistemine SQLite yazılmaz. Yerel async transaction'lar diğer isteklerden ayrılarak seri çalışır; PostgreSQL transaction'ları tek bağlantı kullanır.

Analizler veritabanında atomik olarak sahiplenilir. Sonuç, geometri kontrolü, bildirim ve geçmiş tek transaction'da kaydedilir. Yeni instance çalışan işleri kesmez; yalnızca altı dakikayı aşmış işler kesilmiş olarak işaretlenir. Vercel `waitUntil` API yanıtından sonra çalışmayı sürdürür; worker bütçesi 230 saniye, Function sınırı 300 saniyedir. Aktif başka instance'daki iptal, sağlayıcı isteğini anında durdurmayabilir; iptal edilmiş sonuç yayımlanamaz. Bu, sınırsız ve kesintisiz bir haricî kuyruk değildir: bekleyen işler sonraki API isteğinde sürdürülür, kesilen işler yeniden denenmek üzere hata olarak gösterilir. Uzun raster işleri için ayrı dayanıklı worker/Workflow gerekir.

## Ticari yayından önce

Vercel arayüzü ve Node Function API aynı projede yayımlanır; HTTPS oturumlarında Secure cookie kullanılır. Kimlikler yalnızca sunucu ortam değişkenleridir. E-posta doğrulama, şifre sıfırlama, kurumsal üyelik/yetki modeli, yedek geri yükleme denemeleri, geniş denetim kapsamı ve KVKK süreçleri hâlâ tamamlanmalıdır. Mevcut yayının çalışması bütün ticari ürün kapsamının tamamlandığı anlamına gelmez.

## Veri sözleşmesi

Entegrasyon modüllerindeki her sonuç kaynak, gözlem zamanı, işleme zamanı, mekânsal çözünürlük, kalite/bulut maskesi, birim, yöntem sürümü ve ölçüm/tahmin ayrımı taşımalıdır. Eksik, eski veya kalite kontrolünden geçemeyen sonuç için değer yerine açıklanmış boş durum dönmelidir. Geçersiz değerler sıfıra çevrilmemelidir. Hiçbir sistem mutlak hatasızlık vaat edemez; kullanıcıya doğrulanamayan bir sonuç kesin bilgi olarak gösterilmemelidir.

## İleri araştırma

RGB hava fotoğrafı NIR/red-edge bandı ölçmez. Öğrenilmiş spektral tahminler gerçek multispektral ölçüm olarak etiketlenemez. Eşleşmiş RGB/multispektral saha verisi, radyometrik kalibrasyon, bağımsız doğrulama ve ürün/bölge bazında hata ölçümü gereklidir. Şimdiki sürüm bu analizi yapmaz.
