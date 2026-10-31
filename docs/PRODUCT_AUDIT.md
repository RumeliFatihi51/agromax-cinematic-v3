# AgroMax kapsam ve doğrulama kaydı

Kaynak: kullanıcının `pasted-text-1.txt` şartnamesi (35 bölüm). Bu kayıt kapsamı daraltmaz. Son inceleme: 30 Ekim 2026. Önceki çalışma turu ilerleme sağladı: arayüz dosyaları değişti, derleme ve 10 test geçti. Tarayıcı görsel doğrulaması yapılamadı.

| Ana özellik | Durum | İncelenen kanıt / kalan iş |
| --- | --- | --- |
| React/Vite uygulama, Node API, kalıcı kayıtlar | Çalışıyor | Yerelde SQLite; Vercel Node Function + Neon PostgreSQL yayını doğrulandı. Ticari hardening ve eksik kapsam ayrıca izlenir. |
| Kayıt, giriş, oturum, parola hash | Kısmen çalışıyor | Gerçek scrypt ve HttpOnly cookie; ad/soyad/tekrar parola, sıfırlama, e-posta doğrulama, oturum yönetimi eksik |
| Hesap ayarları ve onboarding | Eksik | Kalıcı profil/tercih/onboarding uçları ve ekranları henüz yok |
| Gerçek kayıtlara bağlı ana ekran | Kısmen çalışıyor | Alan/tarla/görev ve harita var; gözlem/geçmiş/rapor/bildirim özeti eksik |
| Uydu haritası ve yer araması | Çalışıyor | Esri altlığı, Photon sorguları; ticari kapasite/lisans planı gerekli |
| Aynı haritada parsel CRUD | Çalışıyor | Leaflet/Geoman, GeoJSON, alan, sahiplik, sil/geri al; notlar, CRS/bbox kayıtları ve oluşturulma tarihi eklendi; mobil görsel doğrulaması bekliyor |
| Copernicus OAuth | Çalışıyor | Gerçek OAuth 200; sırlar yalnızca sunucuda, kanıt dosyalarında bulunmaz |
| NASA / Earthdata erişimi | Kısmen çalışıyor | 31 Ekim 2026 gerçek geçit ve korumalı HLS TIFF erişimi doğrulandı; ayrı sunucu modülü ve durum ekranı eklendi. HLS parsel/raster analizi ve NASA POWER akışı henüz yok |
| Sentinel-2 L2A analiz adaptörü | Kısmen çalışıyor | 5 sınırlı grup isteğiyle 40 sayısal çıktı, gerçek görüntü ve metadatası alındı; auth/kota/zaman aşımı/boş/hatalı yanıt testleri geçti. Bağımsız saha referanslarıyla bilimsel karşılaştırma henüz yok |
| Uydu gözlemi keşfi | Kısmen çalışıyor | Analiz içindeki gerçek katalog var; bağımsız parsel/tarih/kaynak sorgu ekranı eksik |
| Spektral çalışma alanı | Kısmen çalışıyor | 23 indeks, bant/açı tabloları, sağlayıcı uygunluğu, gerçek min–maksimum lejantı ve raster katmanları var; kullanıcıya kalıcı favoriler, arama ve özel analiz ayarları eksik |
| Zamansal analiz | Kısmen çalışıyor | Gerçek günlük tablolar/ay farkı var; grafik, tarih seçimi, önce/sonra karşılaştırma eksik |
| Analiz geçmişi ve gerçek işlem durumları | Çalışıyor | PostgreSQL/SQLite kalıcı kuyruk, atomik sahiplenme, süre sınırı, iptal, snapshot sonuçlar, lease recovery ve sahiplik; Vercel'de gerçek analiz/geçmiş/bildirim/NDMI PNG doğrulandı. Sınırsız dayanıklı haricî worker henüz yok. |
| Manuel değerlendirmeler | Eksik | Analizle bağlantılı kullanıcı notları ve dört gerçek durum gerekli |
| Raporlama | Eksik | CSV/JSON analiz ihracı var; seçilebilir, sürümlü rapor kaydı/önizleme/dosya üretimi yok |
| Bildirimler | Kısmen çalışıyor | Gerçek tamamlanma/hata/iptal olayları, sahiplik ve kalıcı okundu uçları ve ekran eklendi; gerçek tamamlanma bildirimi API'de doğrulandı, tarayıcı etkileşim testi bekliyor |
| Filiz | Kısmen çalışıyor | Gerçek kayıtların kurallı özeti; bağlı LLM yok, otomatik teşhis yok |
| Diğer uydu/meteoroloji servisleri | Yapılandırma gerekiyor | Sentinel-1/termal ayrı doğrulama; hava sağlayıcısı ve model girdileri henüz yok |
| Mobil ve görsel kalite | Doğrulanamadı | Responsive CSS ve klavye kontrolleri var; tarayıcı erişim hostu yok, ekran testi tamamlanmadı |
| Güvenlik | Kısmen çalışıyor | Sahiplik/geometri/rate limit testleri var; CSRF, oturum yenileme, audit, sıfırlama ve hassas hesap değişiklikleri tamamlanmalı |
| Kalite/performans | Kısmen çalışiyor | Lazy splitting, istek iptali, PNG/piksel/sayı sayımı doğrulama ve error boundary eklendi; typed API ve tam durum matrisi eksik |

## Nihai 20 kabul maddesi

1. Giriş ekranı: uygulanmış, görsel QA bekliyor.
2. Güvenli kayıt: kısmi.
3. Gerçek oturum: uygulanmış, kapsamlı lifecycle testi bekliyor.
4. Gerçek dashboard: mevcut veriler gerçek; kapsam kısmi.
5. Sahte veri yok: uygulamada fixture/seed yok; her yeni özellikte korunacak.
6. Harita/parsel: uygulanmış, mobil görsel QA bekliyor.
7. Gerçek gözlem: canlı katalog doğrulandı; özel keşif ekranı eksik.
8. Doğru spektral analiz: canlı sonuç alındı; maskeler/lejand ve tüm metriklerin doğrulanması sürüyor.
9. Gerçek zamansal analiz: günlük sonuçlar gerçek; çalışma alanı eksik.
10. Kalıcı analiz geçmişi: gerçek API işlemiyle doğrulandı; tarayıcı görsel kontrolü bekliyor.
11. Gerçek raporlar: eksik.
12. Kalıcı kullanıcı ayarları: eksik.
13. Profesyonel mobil deneyim: doğrulanmadı.
14. Özgün arayüz: uygulandı, görsel değerlendirme bekliyor.
15. Anlamlı kontroller: çalışan araçlar var, eksik modüller açıkça etiketli; kapsam tamamlanmadı.
16. Eksik yapılandırma durumları: kısmi, kimlik varlığı canlı servis sağlığıyla karıştırılmamalı.
17. Güvenlik kontrolleri: kısmi.
18. Mevcut kodla bütünlük: korunuyor, testler çalışıyor.
19. Testler: 32 otomatik test geçti. Sahiplik, kuyruk/iptal/restart/geometri değişimi, gerçek eksik veri, eksik bant, maske, negatif ölçek, hatalı PNG, tarih doğrulama; sağlayıcı auth/API/kota/zaman aşımı/boş/malformed yanıt durumları test edildi. Gerçek sağlayıcı ve gerçek uygulama API denemesi de yapıldı. Authentication lifecycle ve tarayıcı durum matrisi henüz tamamlanmadı.
20. Dürüst durum raporu: bu belge mevcut; her değişiklikte güncellenmeli.

Tamamlandı kararı ancak her maddenin güncel kanıtı incelendikten sonra verilebilir. Bir API yanıtı veya başarılı derleme bütün platformun tamamlandığını kanıtlamaz.
