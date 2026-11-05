# İşletim ve kabul kaydı

Bu depodaki yeni ticari çalışma alanı mevcut canlı prototipten ayrı çalışır. Yeni hesabın e-posta sağlayıcısı, ticari lisanslar, ödeme kabulü ve saha doğrulaması tamamlanmadan ücretli satış açılmaz.

## Yerel geliştirme ve kontroller

- `npm ci`
- `npm run dev:commercial`: http://127.0.0.1:5180. Ayrı PGlite PostgreSQL dizini `data/commercial-pg`; gerçek üretim `DATABASE_URL` değeri otomatik kullanılmaz.
- `npm run typecheck`, `npm test`, `npm run test:commercial`
- `npm run build:commercial`: Nitro/Workflow içeren gerçek sunucu ve istemci derlemesi.
- `npm run test:browser`: derlenmiş sunucuyu 5182 portunda, açıkça etiketli ayrı test verileriyle açar. Canlı üretim verisi veya dış sağlayıcı çağrısı kullanmaz.
- `npm run db:generate`, `npm run db:migrate`: migration üretme/uygulama. Uzak hedef yalnızca açıkça verilmiş `AGROMAX_DATABASE_URL` ile seçilir. Üretime `db push` kullanılmaz.

## Geçiş ve geri alma

1. Üretimde bakım penceresi açılır; yeni yazma ve analiz kabulü durdurulur, aktif işler bitirilir.
2. Şifreli yedek ve sağlayıcı veritabanı geri dönüş noktası alınır. Erişim kontrollü, ayrı saklanan anahtar kullanılır.
3. Kaynak sabit anlık görüntüye alınır; yeni şema ayrı staging veritabanına uygulanır.
4. `importLegacy` kullanıcı/parsel kimliklerini, eski parola doğrulama köprüsünü ve kayıt içeriklerini bire bir kontrol ederek taşır. E-posta doğrulanmış gibi işaretlenmez; eski oturumlar aktarılmaz. Aktif iş varsa veya hedefte kullanıcı varsa işlem durur.
5. Staging üzerinde hesap/işletme/rol/parsel/analiz/rapor akışı, kaynak-hedef içerik kontrolü ve geri yükleme tatbikatı geçer. Açık kaynak/hedef sayımı tek başına yeterli değildir.
6. Üretim hedefi, özel dosya anahtarı, auth URL/secret, Workflow ve cron ayarları doğrulanır. Sonra yönlendirme değiştirilir.
7. Sorunda yeni yazmalar durdurulur. Eski sürüm ve önceki veri noktası değerlendirilir; geçiş sonrası yeni kayıtlar uzlaştırılmadan körlemesine eski veritabanına dönülmez.

**Bu üretim geçişi henüz yapılmadı.** Yerel SQLite aktarım aracı üretim Neon kaynağını değiştirmez. Üretimde bakım/geri alma penceresi ve gerçek tatbikat kanıtı ayrıca gereklidir.

## Yedek ve kurtarma

`commercial/operations/backup.ts`, ilişkisel veriyi tutarlı PostgreSQL anlık görüntüsünden AES-256-GCM ile şifreler. Anahtar depoya/rapora/loga yazılmaz. Geri yükleme yalnızca boş hedefe yapılır; şema ve içerik bire bir doğrulanır. Dosya deposundaki PDF ve belgeler ayrıca yedek kapsamına alınmalıdır; yalnızca DB yedeği dosyaları içermez.

Başlangıç RPO 24 saat / RTO 4 saat birer hedeftir. İzole veriyle geçen şifreleme/geri yükleme testi, gerçek üretim boyutunda bu hedeflerin kanıtı değildir. Günlük otomasyon, saklama süresi, alarm ve üretim tatbikatı satış kapısıdır.

## Sağlayıcı ve bütçe

- `docs/COST_MODEL.json` ölçülmemiş alanları `null` tutar.
- Workflow uydu istekleri statik operasyon adı, süre ve gerçek HTTP durumuyla `provider_usage` tablosuna ölçüm kaydeder. Kimlik bilgileri ve istek gövdeleri kaydedilmez.
- `npx tsx scripts/commercial-cost-report.ts` gerçek ölçümleri `data/measurements/provider-costs.json` dosyasına çıkarır. Ölçülmemiş PU veya ücret sıfır kabul edilmez.
- 200 aktif müşteri ve 20 eşzamanlı oturum için vaat edilecek aylık parsel/alan/analiz/Filiz yükü henüz kesin değil. Kotalar ve tam maliyet yük profiliyle kanıtlanmalıdır.
- Filiz model bağlantısı kullanıcı isteğiyle beklemede; AI Gateway gerçek isteği ödeme yöntemi eksikliği nedeniyle 403 verdi. Model kapalıdır. Proje model bütçesi 1 USD/ay ile sınırlandı; bu, toplam altyapı bütçesi değildir.
- Özel Vercel Blob deposu yalnızca preview/development ortamlarına bağlandı. Üretim dosya bağlantısı ve ticari plan geçişi yapılmadı.

## Dış hazırlıklar

Sahip olunan alan adı ve Resend DNS doğrulaması yok. Şirket/Paddle kabulü, MapTiler ticari erişimi, uzman ve izinli saha verisi, özel alan adı, hukuki/mali inceleme ve destek kanalı tamamlanmadı. CI dosyası yazılmış olması GitHub Actions'ın veya Vercel Git uygulamasının gerçek koşuda başarılı olduğunu kanıtlamaz.
