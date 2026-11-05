# Mevcut hesaplarla çalışma alanı · 4 Kasım 2026

`AGROMAX_WORKSPACE_ENABLED=true`, mevcut oturum ve parsel API'lerini koruyarak
sezon/saha, maliyet, PDF raporu, hesap/tercih/oturum ekranları ve kaynaklı Filiz
rehberini açar. Üretim `vercel.json` ile çalışır; tam Nitro/Better Auth cutover'ı değildir.

## Modüller

- `commercial/production/workspace.ts`: mevcut oturumdan gelen, sunucuda doğrulanmış
  kullanıcıyı ortak kayıt/rapor/asistan servislerine bağlayan `/api/v1` yönlendirmesi.
- `snapshot.ts`: yalnızca oturum sahibinin gerçek kaynak kayıtlarını çalışma alanına
  yansıtır. Orijinal hesap/parsel/analiz tabloları yetkili kaynak olarak kalır.
  Filiz'de onaylanan görev gerçek görev tablosuna aynı kimlikle idempotent aktarılır.
- `account.ts`: mevcut hesapta ad/parola değişimi ve gerçek oturum iptali.
  Oturum anahtarı kullanıcıya gösterilmez; HMAC kimliği kullanılır. Eski oturumun
  kaydedilmemiş IP, tarayıcı ve başlangıç bilgileri uydurulmaz.
- `scripts/production-build.mjs`: yerel TS sunucu modüllerini tek ESM pakete derler;
  Vercel çalışma anında kaynak `.ts`/uzantısız import çözümlemeye ihtiyaç duymaz.
  `api/index.js` derlenmiş paketi sunar; PDF yazı tipi açıkça dosya paketine eklenir.

## Erişim ve veri doğruluğu

Her hesap kendi parsellerine bağlı kişisel işletmesini kullanır. Başka işletmenin
kimliğini gönderme, yabancı parsel/rapor erişimi ve sürüm çakışması sunucuda reddedilir.
E-posta doğrulanmış gibi işaretlenmez. Mevcut oturumla kendi kaynaklarından PDF üretimi,
aynı verinin mevcut hesapta okunabilmesine dayanır; hesap/ödeme yetkisi genişletmez.

Ücretli abonelik oluşturulmaz. Günlük 10 rapor oluşturma isteği, işletme kilidi altında
uygulanır; aynı istek anahtarının tekrarı ikinci raporu veya ikinci kullanım sayısını
oluşturmaz. PDF, mevcut istekte hazırlanıp özel Blob'a kaydedilir ve yetkili/süreli
bağlantıyla indirilir. Bu adaptörün PDF çalışması tam Workflow orkestrasyonu değildir.

Filiz modeli kapalıdır. Rehber ve kullanıcı onaylı görev/rapor taslakları çalışır.
E-posta teslimi, ekip daveti, ödeme ve tam ticari cutover ayrı hazırlıklardır.
Bu runtime'da desteklenmeyen özel dönem Workflow analizi gösterilmez; mevcut gerçek
uydu analizi, tarihçe ve bağımsız gözlem araması korunur. Otomatik agronomik doz veya
toprak nemi değeri icat edilmez.

## Geçiş ve kontroller

Üretim eski tablolarının şifreli yedeği oluşturulup çözme/bütünlük turu doğrulandı;
ardından ek Drizzle tabloları oluşturuldu. Mevcut kullanıcı, oturum, parsel, analiz
ve bildirim satırlarının sayıları korundu. Yedekler/anahtarlar yalnızca ignored
`data/production-backups/` altındadır ve dağıtıma eklenmez.

56 mevcut test ve 18 ticari test geçti. Yeni adaptörün PostgreSQL testinde iki hesabın
izolasyonu, gerçek maliyet toplamı, onaylı görev aktarımı, özel PDF, profil/parola,
oturum kimliği ve rapor limit/idempotency kontrolü sınandı. İzole verilerle masaüstü ve
375px telefon tarayıcısında kayıt → sulama → maliyet → PDF indirme → Filiz kaynağı →
profil → oturum iptali akışı geçti. Canlıda test hesabı veya sahte tarımsal kayıt eklenmedi.

Sahibin bilinen e-posta adresiyle aktif oturum bulunmadığından canlıdaki oturumlu
menü kontrolü yerine izole tarayıcı kontrolü kullanıldı. Canlı dağıtımda yeni runtime
yanıtı HTTP 200, oturumsuz çalışma alanı HTTP 401 ve masaüstü/telefon giriş ekranları
doğrulandı. Tam ticari kapasite, saha ve kurtarma kabulü tamamlanmış sayılmaz.

Geri alma: önceki üretim dağıtımına dönmek ek tabloları silmez. Yeni kayıtları koruyun;
uygulama rollback'i için veritabanını eski yedeğin üzerine yazmayın.
