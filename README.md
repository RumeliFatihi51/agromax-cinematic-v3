# Agromax

## Platform çalışma alanları

**Platform merkezi**, 14 temel yeteneği Gözlem ve Arazi, Karar ve Uygulama, Doğrulama ve Rapor menülerinde toplar. Her araçta bugünkü kapsamı ve bir sonraki veri/model bağımlılıklarını görebilirsiniz.

Parsel özeti, analiz hafızası, kaynaklı dönem farkları, kayıt hazırlık kontrolleri; kalıcı senaryo, saha gözlemi, inceleme dosyası, reçete taslağı ve cihaz profilleri kullanılabilir. Senaryo hesapları girilen miktar ve birim fiyatlara dayanır. Reçete/dron dışa aktarımları yalnızca inceleme dosyasıdır; uzman onayı veya çalıştırılabilir görev değildir. Sentinel-1, Landsat, ticari görüntü işleme ve tahmine dayalı tarımsal modeller henüz etkin değildir.

[14 yeteneğin kapsamı, API, veri sahipliği ve doğrulama ayrıntıları](docs/PLATFORM_FOUNDATION.md).

Uydu haritasında parsel yönetimi, gerçek Copernicus Sentinel-2 L2A analizi ve sezon görevleri için modüler tarım platformu. Geliştirme aşamasındadır; tamamlanmış ve eksik özellikler [ürün kapsam raporunda](docs/PRODUCT_AUDIT.md) izlenir.

Node.js 24 gereklidir. Proje klasöründe:

```powershell
npm.cmd ci
Copy-Item .env.example .env
# .env dosyasına kendi sunucu kimlik bilgilerinizi ekleyin.
npm.cmd run dev
```

http://127.0.0.1:5173 adresini açın. İlk hesabınızı arayüzden oluşturun. Hazır kullanıcı veya örnek tarla bulunmaz.

`npm.cmd test` otomatik testleri, `npm.cmd run build` arayüz derlemesini çalıştırır. Test fixture'ları üretim deneyimine eklenmez. Sunucu açıkken `node server/smoke-test.js` HTTP kontrollerini kendi geçici hesaplarıyla çalıştırır ve bu kayıtları temizler.

`.env`, `data/`, `node_modules/`, `dist/` ve `.vercel/` Git dışında tutulur. Yerel SQLite dosyası kullanıcı hesapları, parseller, analiz geçmişi ve bildirimler içerir; depoya gönderilmez. Bu kodu klonlamak mevcut kullanıcının hesabını veya arazilerini kopyalamaz.

- [Mimari, mevcut kapsam ve üretime geçiş](docs/ARCHITECTURE.md)
- [Gerekli veri erişimleri](docs/INTEGRATIONS.md)
- [Parsel araçları, uydu kapsamı ve kalite sözleşmesi](docs/SATELLITE.md)
- [Arayüz bileşenleri ve düzenleme rehberi](docs/INTERFACE.md)
- [Güncel Fieldwork tasarımı ve ekran yapıları](docs/FIELDWORK_UI.md)
- [Logo, görseller, boyutlar ve üretim istemleri](docs/BRAND.md)
- [NASA ve Earthdata erişimi](docs/NASA_ACCESS.md)
- [Doğrulama sonuçları ve sınırları](docs/VERIFICATION.md)

Copernicus sorguları sunucuda çalışır; kimlik bilgileri yapılandırıldığında gerçek katalog, bant/indeks istatistikleri ve raster görüntüleri alınır. Hesaplama boyutu sınırında istekler aynı günlük ızgarayı koruyarak bölünür. Eksik veriler sıfırla veya uydurma sonuçla doldurulmaz. Başlatılan analizler kalıcı işlem durumları ve sonuç sürümleriyle saklanır.

NASA Open APIs ve Earthdata kimlikleri ayrı doğrulanır. Korumalı HLS bant erişim kontrolü vardır; HLS parsel analizi henüz uygulanmadı. Meteoroloji ekranı anahtarsız MET Norway model tahminlerine bağlıdır: parsel konumu, 24 saatlik sıcaklık grafiği, mevcut tüm anlık değişkenler ve ayrı 1/6/12 saatlik dönemler gösterilir. Veri kaynağı, zaman ve CC BY 4.0 atfı ekrandadır. SAR/termal ve ileri agronomik modeller bağlı değil. Filiz mevcut tarla/görev kayıtlarını kurallarla özetler; dil modeli veya otomatik hastalık teşhisi kullanmaz.

Canlı yayın: **https://agromax-rust.vercel.app**. Vercel projesi `next-3011/agromax`; arayüz Vite, backend Node.js Function, kalıcı kayıtlar Frankfurt bölgesindeki Neon PostgreSQL üzerindedir. Yerel hesap ve mevcut gerçek kayıtlar taşındı; yerel oturum çerezleri taşınmadığı için canlı adreste yeniden giriş gerekir. API anahtarları Vercel'in sunucu ortamında tutulur.

Yeni kurulumda `vercel link` ile doğru projeyi seçin, Neon entegrasyonunu bağlayın ve `.env.example` içindeki sunucu değişkenlerini Vercel Production ortamına ekleyin. `DATABASE_URL` Vercel'de zorunludur. `vercel deploy --prod --skip-domain` ile hazırlayıp doğruladıktan sonra `vercel promote <deployment-url>` ile yayımlayın. Yerel SQLite kullanımı `npm.cmd run dev` ile devam eder; bilerek bulut veritabanıyla geliştirmek için `node --env-file=.env.local --env-file=.env server/index.js` kullanılabilir.

`scripts/migrate-to-postgres.mjs`, boş hedef veritabanına gerçek yerel kayıtları tek transaction'da taşır ve bütün satırları karşılaştırır; dolu hedefi değiştirmez. `scripts/verify-deployment.mjs` canlı API'yi geçici özel kontrol hesaplarıyla sınar ve finally bloğunda bunları siler. Ayrıntılar ve worker süre sınırları mimari belgesindedir.

GitHub kodu `erdoganenestr/Agromax` deposundadır. Vercel'in GitHub uygulaması bu depoya erişemediğinden Git üzerinden otomatik yayın bağlantısı henüz kurulamadı; mevcut yayın CLI ile yapıldı. Otomatik yayın için Vercel Project → Settings → Git bölümünden uygulamaya depo erişimi verilmelidir.
