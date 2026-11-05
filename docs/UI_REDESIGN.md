# Agromax arayüz yenilemesi · 4 Kasım 2026

UI UX Pro Max kuruldu ve Agriculture/Farm Tech önerisi üzerinden uygulandı.
Tasarım kararları [tasarım sisteminde](../design-system/agromax/MASTER.md),
ortak renkler ve bileşenler `src/styles/canopy/` altında dört dosyada tutulur.

## Kapsam

Giriş/kayıt/kurtarma, ilk işletme kurulumu, genel bakış, harita ve çizim,
parsel listesi ve analiz, gözlem/tarih karşılaştırmaları, hava tahmini/geçmişi,
sezon ve saha kayıtları, maliyet, görevler, raporlar, bildirimler, Filiz,
veri bağlantıları, hesap/tercih/güvenlik/oturum/ekip/abonelik ekranları ortak
yazı, boşluk, renk, form ve tablo diliyle yenilendi.

Mobilde dört hedefli alt gezinme ve tüm menülere erişen çekmece bulunur.
İşletme seçimi mobil çekmecede korunur. Harita üzerinde aynı çizim akışı devam eder.
Kaydedilmiş saha kayıtlarında gerçek arama, sonuç sayıları, boş ekran eylemleri
ve silmeden önce onay eklendi. Ekran bağlantıları tarayıcı geçmişini korur.

## Doğrulama

- TypeScript kontrolü; mevcut 56 ve ticari 17 otomatik test.
- Chromium masaüstü/telefon akışları: menüler, gerçek kayıt CRUD'u, arama,
  silme onayı/iptali, görev taslağı onayı ve Workflow ile özel PDF üretimi/indirme.
- 375/768/1024/1440px ve yatay telefon; azaltılmış hareket.
- Ayrı canlı kontrolünde Esri uydu karolarının gerçekten yüklendiği doğrulandı.
- Görsel kanıtlar yalnızca izole, açıkça TEST olarak işaretlenmiş verilerle
  `data/browser-results/` altında üretilir. Bunlar müşteri ölçümü değildir.

## Sınırlar

Yeni arayüz 4 Kasım 2026'da mevcut üretim altyapısıyla
https://agromax-rust.vercel.app adresine yayınlandı. Bu yayın ticari backend
geçişi veya ücretli satış açılışı değildir. Sonraki yayında sezon/saha, maliyet,
rapor ve hesap menüleri mevcut oturumlara bağlandı. Uygulama ayrıntıları
[üretim çalışma alanı kaydında](PRODUCTION_WORKSPACE.md) bulunur.
Gerçek e-posta teslimi, ödeme sağlayıcısı ve bilimsel saha kabulü ayrı bağımlılıklardır.
Filiz model bağlantısı kullanıcının kararıyla kapalıdır. Eksik servislerin yerini
uydurma veri veya başarılı işlem bildirimi almaz. Ticari kabulün kalan işleri
[ürün kaydında](COMMERCIAL_ROADMAP.md) izlenir.
