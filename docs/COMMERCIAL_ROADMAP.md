# Agromax ticari uygulama kaydı

Başlangıç: 1 Kasım 2026. Hedef: Türkiye ve araştırmayla seçilecek ilk AB ülkesi; Türkçe/İngilizce; tüm ana modüller; alan ve kullanım kotalı abonelik. İlk otomatik hesap doğrulaması buğday/mısır içindir. Hedef 50–200 aktif müşteri ve aylık en fazla 100 USD altyapı/veri/API gideridir. Bunlar henüz kanıtlanmış kapasite veya maliyet değildir.

## Kabul kaydı

| Alan | Başlangıç kanıtı | Ücretli açılış için gereken |
| --- | --- | --- |
| Hesap | Gerçek kayıt/giriş/çıkış; eski scrypt | Doğrulama/kurtarma/oturum/hesap lifecycle ve gerçek e-posta teslimi |
| İşletme | Kayıtlar kullanıcıya bağlı | İşletme, üyelik, dört rol ve tüm kaynaklarda yetki testleri |
| Parsel | Aynı haritada gerçek CRUD | Sezon/ürün/onboarding, sürümlü geometri, mobil test |
| Uydu | Gerçek Sentinel-2; 40 çıktı | Tarih aralığı, gözlem keşfi, karşılaştırma, artımlı önbellek ve bağımsız referans |
| Meteoroloji | MET Norway; kaynaklı tahmin | IANA zaman dilimi, geçmiş veri, gereken hesap girdilerinin doğrulanması |
| İşler | DB kuyruğu; 230 saniyelik worker | Workflow, tekrar/iptal/kesinti/idempotency testleri |
| Tarımsal modüller | Ticari işlevler eksik | Gerçek uygulama kayıtları, doğru birimler, yöntem ve saha doğrulaması |
| Rapor | CSV/JSON | Gerçek sürüme bağlı PDF/önizleme/özel dosya erişimi |
| Filiz | Kurallı kayıt özeti | Gerçek model, kaynaklı cevaplar, kullanıcı onaylı işlemler |
| Satış | Yok | Şirket/sağlayıcı kabulü, tarife, doğrulanmış ödeme olayları ve kotalar |
| İşletim | Vercel + Neon | Ayrı staging, CI, yedek/geri yükleme, alarm ve destek |

Her satırın geçti sayılması için tarihli test/gerçek servis/saha belgesi gerekir. API anahtarının varlığı kanıt değildir. Arayüz veya model cevabı başarılı işlem kaydı yerine geçmez.

## Uygulanan çalışma alanı — 1 Kasım 2026

Mevcut canlı prototipin yanında ayrı `commercial/` modülleri geliştirildi. Bu bölüm tamamlanan kodu kaydeder; yukarıdaki ticari kabul koşullarının geçtiği anlamına gelmez.

- React/Vite korundu; yeni modüller TypeScript, Nitro, Drizzle migration ve PostgreSQL temeline taşındı. Yerel/test PGlite gerçek PostgreSQL motorunu kullanır; üretim Neon geçişi yapılmadı.
- Better Auth doğrulama, kurtarma, parola değişikliği ve oturum iptali; eski kimlik/parola köprüsü ve bire bir veri aktarım kontrolü eklendi. Gerçek e-posta teslimi için alan adı/Resend hâlâ eksik.
- İşletme, dört rol, üyelik, davet, son sahibin korunması ve sunucuda işletme ayrımı eklendi. Takım işlemleri doğrulanmış e-posta gerektirir.
- Sezon, sulama, besleme, koruma, maliyet, toprak laboratuvarı ve değerlendirme kayıtlarının oluşturma/düzenleme/kaldırma ekranları çalışır. Bunlar kullanıcı beyanı olarak gösterilir. Kayıt sürümü, para birimi ve kaynak ayrımı korunur.
- Aynı harita parsel çizimi korundu. “Parseller” ve “Uydu analizleri” yinelenmesi kaldırıldı; saha modülleri tek menü altında sekmelere toplandı. Mobil kayıtlar kart görünümüne geçti.
- Parsel sürümü/geometri hash'i, alan/parsel sayısı limitleri ve analiz/rapor/Filiz kullanım rezervasyonları sunucuda uygulanır. Aktif olmayan/limiti tanımlanmamış paket gerçek abonelik sayılmaz.
- Uydu analizinde tüm desteklenen çıktı grupları ayrı Workflow adımlarında işlenir; aynı iş için yarışan run'lar, tekrar teslim, iptal ve geometri değişimi sonuç/kota tutarlılığıyla sınanır. Gerçek Vercel kesinti/429/5xx kabul tatbikatı henüz tamamlanmadı.
- Bağımsız katalog araması, gösterge arama/favorileri, özel tarih aralığında sayısal analiz ve iki gözlem karşılaştırması eklendi. Özel dönem sonuçları aylık özetin üzerine yazılmaz. Gözlem bazlı artımlı hesaplama ve bağımsız bilimsel uydu karşılaştırması henüz tamamlanmadı.
- NASA POWER geçmiş günlük meteoroloji adaptörü, kaynak/birim/LST/NoData ayrımı ve önbellek eklendi; gerçek NASA yanıtı doğrulandı. İlgili ekran tahmin ekranının ayrı sekmesidir.
- Kaynak/geometri/kayıt sürümüne bağlı PDF önizleme, Workflow üretimi, özel dosya saklama, bütünlük kontrolü ve süreli/yetkili indirme eklendi. Özel Blob gerçek yaz/oku ve yetkisiz erişim 403 kontrolünü geçti. Laboratuvar belge yükleme ve PDF'ye gerçek uydu görüntüsü ekleme akışı henüz tamamlanmadı.
- Filiz kaynaklı kayıt rehberi ve açık onaylı görev/rapor taslaklarıyla çalışır. Dil modeli bağlantısı kullanıcı isteğiyle beklemede; model cevabı üretilmiş gibi gösterilmez.
- FAO-56 ve miktar hesap çekirdekleri, yayımlanmış denklem örneği ve birim/sınır testleriyle eklendi. Ürün/bölge saha kanıtı yoktur; otomatik tarımsal öneri miktar üretmez.
- Şifreli DB yedeği/boş hedefe bire bir geri yükleme aracı ve testi, maliyet ölçüm çıktısı ve CI eklendi. Üretim RPO/RTO, 200 müşteri kapasitesi ve aylık 100 USD henüz kanıtlanmadı.

Tamamlanmayan diğer işler: tam TR/EN dönüşümü, hesap silme/veri talebi süreçleri, ticari ödeme/webhook/iptal/iade, güvenli belge yükleme, işlem e-postası/bildirim teslimi, üretim staging/Git otomatik dağıtım bağlantısı, tarayıcı çeşitliliği, gerçek yük testi ve saha/hukuk/lisans kabulü. Bu işleri “tamamlandı” veya “ticari satışa hazır” olarak işaretleyen veri eklenmedi.

## Bağımlılık sırası

1. Kapsam, veri sözleşmeleri, sürümlü migration ve maliyet ölçüm altyapısı.
2. Kimlik/işletme temeli ve mevcut verinin kayıpsız geçişi.
3. Parsel/gözlem/analiz/sezon/ayar ekranları; dayanıklı işler.
4. Sulama/besleme/koruma/maliyet ve deterministik hesaplar.
5. PDF, e-posta, Filiz ve onaylı taslak işlemler.
6. Abonelik/kullanım ve işletim araçları.
7. Saha, güvenlik, tarayıcı, kapasite, maliyet ve kurtarma kabulü.

Şirket, saha ortaklığı, lisans ve müşteri araştırması teknik geliştirmeyle paralel yürür. Bütün koşullar geçmeden gerçek tahsilat açılmaz. Mevcut hesaplar ücretli abonelik gibi işaretlenmez.

## Dış bağımlılıklar

| Bağımlılık | Mevcut durum | Tamamlanma kanıtı |
| --- | --- | --- |
| Türkiye işletmesi ve mali süreç | Kullanıcı beyanına göre henüz yok | İşletme/vergisel uygunluk ve mali müşavir incelemesi |
| AB ilk ülke | Araştırılacak | Aşağıdaki pazar çalışması ve yazılı ülke kararı |
| Saha ve uzman | Kullanıcı beyanına göre henüz yok | İzinli gerçek kayıtlar ve önceden onaylanmış protokol |
| Resend | Erişim doğrulanmadı | Doğrulanmış alan adı ve gerçek teslim |
| MapTiler ticari erişim | Yok | Hesap/lisans, anahtar, domain kısıtı ve gerçek istek |
| Paddle | Yok | Sağlayıcı kabulü, test akışı ve yetkili gerçek tahsilat doğrulaması |
| Filiz modeli | Yok | Gerçek model erişimi ve TR/EN kalite-maliyet raporu |
| Vercel Pro | Başlangıç hesabı Hobby | Plan ve harcama kontrolü doğrulaması |
| Git otomatik dağıtım | Depo izni eksik | GitHub uygulama erişimi ve başarılı preview/production akışı |

## Sabit kaynaklar

- https://vercel.com/pricing (Pro liste fiyatı 20 USD/ay; kullanım/vergiler ayrıca değerlendirilir)
- https://www.maptiler.com/cloud/pricing/ (Flex liste fiyatı 30 USD/ay; lisans/ek trafik ayrıca)
- https://documentation.dataspace.copernicus.eu/Quotas.html (genel kullanıcı Sentinel Hub kotaları)
- https://docs.api.met.no/doc/TermsOfService ve https://docs.api.met.no/doc/License
- https://www.paddle.com/pricing (işlem başına fiyat; sağlayıcı kabulü garanti değildir)

Fiyatlar ve lisanslar satın alma öncesi yeniden doğrulanır. Şirket, hukuk, saha/uzman ve geliştirme giderleri 100 USD altyapı hedefinden ayrı izlenir.
