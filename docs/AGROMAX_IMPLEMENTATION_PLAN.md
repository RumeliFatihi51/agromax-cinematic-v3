# AgroMax uygulama ve kabul kaydı

| Aşama | Çıkış ölçütü |
| --- | --- |
| 0. Denetim | Başlangıç commit’leri, yerel/CI test kaydı ve özellik matrisi. |
| 1. Temel | Yetkili parsel → Sentinel-2 iş isteği → sonuç → geçmiş → bildirim. İptal, tekrar ve tenant ayrımı. |
| 2. Tasarım | Genel Bakış, Parsel Analizi ve Filiz. Eski bağlantılar ve yedi genişlikte tarayıcı incelemesi. |
| 3. Ürün | Kalite maskeli çok kaynaklı gözlem, zaman serisi ve sürümlü kayıt/rapor akışları. |
| 4. Bilim | Trakya kışlık buğdayı için su dengesi ve en az iki senaryo. Saha kabulüne bağlı verim. |
| 5. Kanıt | Kalıcı iddia, çelişki, inceleme, Filiz referansı ve tekilleştirilmiş olay. |
| 6. Operasyon | Sürüm bazlı onay, cihaz kabulü, MRV, çevrimdışı saha taslağı ve izole eğitim turu. |
| 7. Sürüm | CI, tarayıcı, performans, bilimsel ve operasyonel kanıt. |

Yerel/CI kabulü izole veritabanı kullanır. Haricî sağlayıcı, e-posta, saha verisi, lisans ve cihaz testlerinin kanıtı ayrı kaydedilir. Canlı dağıtım ve migration ayrı onay adımıdır.

## Yerel çalışma

```powershell
npm.cmd ci
npm.cmd run dev:commercial
```

Ticari geliştirme sunucusu `http://127.0.0.1:5180` adresinde çalışır ve yerel kimlik yapılandırmasını oluşturur. Testler ayrı PGlite veritabanı ve açıkça etiketlenmiş uydu fixture’ı kullanır.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:commercial
npm.cmd run build
npm.cmd run build:commercial
npm.cmd exec -- playwright install chromium --only-shell
npm.cmd run test:browser
```

## Geliştirme dalının kabul sınırları

- E-posta için `AGROMAX_RESEND_API_KEY` ve doğrulanmış `AGROMAX_MAIL_FROM` gerekir. Yerelde Resend sözleşmesi fixture ile sınandı.
- USGS Landsat yansıtım ve sıcaklık katalogları gerçek yanıt döndürdü. COG dosyası, yetkisiz HTTP isteğini EarthExplorer’a yönlendirdi. `AGROMAX_LANDSAT_AWS_ENABLED=true` yalnızca yetkili AWS kimliği ve Requester Pays erişimi hazır olduğunda kullanılmalıdır. Sentinel-1 CDSE sözleşmesi fixture ile sınandı.
- Su dengesi kullanıcının kaynağını belirttiği günlük ET₀, etkin yağış, Kc ve sıcaklığı kullanır. Kök derinliği sabittir. ET₀ ±%10 duyarlılığı olasılık aralığı olarak yorumlanmaz. Saha kalibrasyonu ve verim açık kalır.
- Korumalı `/api/internal/dispatch` ticari çalışma yolunda planı olan bekleyen işleri yeniden gönderir. Canlı zamanlayıcı dağıtım kabulünün parçasıdır.
- `0006` ve `0007` analiz isteklerini ve iddiaları ekler. `0008` mevcut çalışma dosyaları ve revizyonlarını yedekleme ile yerel taşıma kapsamına alır. Geçiş provası dışındaki işlemlerde veritabanı URL’si ayrı doğrulanmalıdır.
- Çevrimdışı kopya bir seçili parsel ve isteğe bağlı açık görevler içerir. Bağlantı geri geldiğinde notları Web ve Mobil Erişim ekranından eşitleyin. Sürüm çakışmasında taslak korunur ve güncel sürüm seçimi istenir.

[Landsat Requester Pays](https://www.usgs.gov/software/introduction-landsat-cloud-access-direct-requester-pays) · [Resend e-posta API’si](https://resend.com/docs/api-reference/emails/send-email) · [FAO-56](https://www.fao.org/4/X0490E/x0490e0e.htm)

## Son yerel doğrulama

| Kontrol | Sonuç |
| --- | --- |
| TypeScript ve iki çalışma yolu derlemesi | Geçti |
| Sunucu testleri | 62 geçti |
| Ticari testler | 23 geçti |
| Playwright Chromium | 7 geçti. Aynı referans senaryosunun mobil proje kopyası atlandı. |
| Görsel kanıt | Genel Bakış, Parsel Analizi ve Filiz. 360, 375, 390, 768, 1024, 1440 ve 1920 px. |
| npm üretim bağımlılığı denetimi | 0 raporlanan açık |

Playwright, derlenmiş ticari sunucuda parsel ve analiz isteği, gerçek Workflow yürütümü, sonuç ve bildirim kaydı, iddia, tekrar isteği, su dengesi, MRV ve çevrimdışı sürüm çakışmasını doğrular. Uydu HTTP yanıtı ve hesaplar izole fixture’dır. Tam klavye/ekran okuyucu incelemesi, saha Core Web Vitals ölçümü, üretim kurtarma tatbikatı ve gerçek sağlayıcı kabulü ayrı işlerdir.
