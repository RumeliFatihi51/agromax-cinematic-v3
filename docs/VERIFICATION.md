# Doğrulama — 30 Ekim 2026

Bu dosya bütün ürünün tamamlandığı iddiası değildir. Eksik kapsam `PRODUCT_AUDIT.md` içinde izlenir.

- `npm.cmd test`: 32 test, 32 başarılı. Test kullanıcıları/parseller/uydu yanıtları yalnızca açıkça işaretlenmiş in-memory fixture'lardır.
- `npm.cmd run build`: başarılı. Lucide paketinin `use client` yönergesine ilişkin bundler uyarısı devam eder; derlemeyi engellemez.
- `node server/smoke-test.js`: gerçek HTTP kayıt/oturum/parsel/geometri/sahiplik/sil-geri al/görev/çıkış akışları başarılı. Geçici fixture hesapları finally bloğunda silindi; gerçek kullanıcı hesabına kayıt eklenmedi.
- `node --env-file=.env scripts/live-copernicus-check.mjs`: mevcut gerçek parsel üzerinde CDSE istatistik/katalog ve açık pikselli RGB sorgusu başarılı. 36 katalog sahnesi, 18 aralık, 9 geçerli NDVI aralığı. 40 desteklenen sayısal çıktıdan hiçbirinde bütün dönem boyunca sonuç eksik değildi. Bu değerler yalnızca bu parsel ve sorgu dönemine aittir.
- `node scripts/live-api-check.mjs`: gerçek mevcut oturum ve parsel üzerinde 202 işlem kabulü → tamamlanmış kalıcı sonuç → aynı işlem kimliğine bağlı bildirim → geçmiş sürümün NDMI PNG katmanı doğrulandı. 30 Ekim 2026 18:46 UTC kontrolünde gerçek işlem tamamlandı. Bu helper bir gerçek analiz isteği yaratır; görüntü testleri başarısız olduğunda sonuç geçmişini silmez.
- Tamamen maskeli bir gerçek çekim tespit edildi ve sıfır açık pikselin görüntü başarısı sayılmaması uygulandı. Açık piksel içeren 23 Ekim çekiminde RGB ve NDMI doğrulandı. PNG boyutu doğal uydu çözünürlüğü değildir.
- Gerçek sorgular başarısız olduğunda uydurma sonuç, sahte parsel veya yeni gerçek kullanıcı hesabı oluşturulmadı. Kimlik bilgileri ve erişim belirteçleri kanıt dosyalarına yazılmadı. Gerçek kanıt JSON/PNG dosyaları Git dışında `data/verification/` altında tutulur.
- Browser access host kullanılamadığından masaüstü/tablet/mobil ekran görüntüsü, klavye ve gerçek tarayıcı etkileşim QA'sı tamamlanmadı. Derleme veya sunucu render kontrolü bu kontrollerin yerine geçmez.
- Çalışan tarayıcıdan Vite'a ulaşan `wrong listener type: undefined` uyarısı incelendi. Geoman 2.20.4, etkinleştirilmemiş global modlar kapatıldığında henüz oluşmamış event handler'larını Leaflet'ten kaldırmaya çalışıyordu. Kapatma yalnızca etkin modlarda yapılacak şekilde korundu; etkileşimli tarayıcı doğrulaması hâlâ bekliyor.

Sonraki temel işler: modüler authentication yaşam döngüsü ve hesap tercihleri; bağımsız tarih aralıklı gözlem keşfi; spektral favoriler; gerçek zamansal grafik ve iki tarih haritası; manuel değerlendirmeler; gerçek analize bağlı rapor üretimi; kapsamlı mobil ve erişilebilirlik doğrulaması.

## 31 Ekim 2026 ek kontrol

- Copernicus'un gerçek `calculation results are too large` hatası yeniden üretildi. `server/statistics-request.js` yalnızca bu boyut hatasında tarih aralığını aynı günlük ızgarayı koruyarak böler; hiçbir katman veya gün sessizce atılmaz. Diğer HTTP hataları yeniden denenerek gizlenmez; toplam istek sayısı sınırlandırılır.
- Hata veren 8,06 dekar parselde 13 sağlayıcı isteğiyle gerçek sonuç alındı. Yaklaşık 12 km² olan en büyük aktif parselde de 15 istek, 18 katalog sahnesi, 18 günlük aralık ve 40 desteklenen çıktı başarıyla döndü. Bunlar parsel ve döneme özgü sayımlardır.
- Yeni yerel sunucu düzeltmeyle başlatıldı. Önceki uygulama oturumları sona erdiği için bu turda gerçek kullanıcı adına oturum üretilmedi; doğrudan sağlayıcı sorguları ve izole testler kullanıldı.
- NASA anahtarı ve Earthdata tokenı sunucuya kaydedildi. Gerçek NASA geçit isteği HTTP 200; korumalı HLS dosyası HTTP 206/TIFF döndürdü. Kimliksiz kontrol giriş sayfasına yönlendirildi. Katalog kaydı ve erişim kontrol sonucu gerçek; HLS tarla analizi henüz yok.
- `npm.cmd test`: 43 test geçti. NASA testleri açıkça işaretlenmiş in-memory fixture'lardır; gerçek kimlik değerleri test dosyalarında bulunmaz.
- Yerel Git deposu oluşturuldu ve hedef uzak URL kullanıcı tarafından verilen `erdoganenestr/Agromax` olarak ayarlandı. GitHub hesabı/depo yetkisi doğrulanmadan uzak depoya yazılmadı. `.env`, `data/` ve `.vercel/` Git dışında tutulur.
- Vercel CLI için ayrı cihaz giriş akışı başlatıldı. Bağlı Vercel servisindeki mevcut `agromax` projesi `RumeliFatihi51/tarim2` kaynağını kullanıyor; kullanıcının istediği başka depoyla karıştırılmadı. Bu uygulamanın kalıcı veritabanlı Vercel dağıtımı henüz tamamlanmadı.
