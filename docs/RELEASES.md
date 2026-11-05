# Yayın kayıtları

## 4 Kasım 2026 · Mevcut hesaplarla ek menüler

- Canlı: https://agromax-rust.vercel.app
- Dağıtım: `dpl_Foz453jjEX2XGcchtziDpWftqpif` (`READY`).
- Kaynak URL: https://agromax-32cvkxfau-next-3011.vercel.app
- Önceki üretim: `dpl_CkMBymmCFa7MfyR9ojdLydjeqVDF`.
- Mevcut oturumlara sezon/saha, maliyet, rapor ve hesap menüleri bağlandı;
  özel Blob üretime bağlandı ve ek tablolar, doğrulanmış şifreli yedekten sonra oluşturuldu.
- İlk aşamalı dağıtım sunucu TS yükleme hatası nedeniyle canlıya geçirilmedi.
  Sunucu modülleri ESM pakete derlenerek sorun giderildi; yeni dağıtım kontrol sonrası promote edildi.
- HTTP 200 yeni runtime (`workspaceEnabled:true`), oturumsuz bootstrap HTTP 401;
  canlı giriş/kayıt formları iki ekran boyutunda geçti. Yeni dağıtım loglarında
  Node `DEP0169` uyarıları vardı; bunlar uygulama işleminin başarılı/başarısız sonucu değildir.
- [Kapsam, erişim, test ve rollback ayrıntıları](PRODUCTION_WORKSPACE.md).

## 4 Kasım 2026 · Canopy v1 arayüz

- Proje: `next-3011/agromax`, `prj_t2t4a9YoSToeg5WXtsi665OtmDc8`.
- Canlı adres: https://agromax-rust.vercel.app
- Dağıtım: `dpl_CkMBymmCFa7MfyR9ojdLydjeqVDF`, durum `READY`.
- Dağıtım adresi: https://agromax-fty9ntx8f-next-3011.vercel.app
- Kaynak: yerel çalışma ağacı; Git HEAD `4e3bb5b` üzerine kaydedilmemiş geliştirmeler.
  Bu işlem GitHub push veya otomatik Git dağıtımı değildir.
- Yapılandırma: mevcut `vercel.json`, Vite + mevcut `api/index.js`, Node 24.
- Dağıtım önce `--prod --skip-domain` ile hazırlandı, kontrol edildi ve `promote` edildi.
- Önceki üretim: `dpl_5NWpDeR8KaHX5c4nG9egC1jrK2E5`,
  https://agromax-ijwlaw8xi-next-3011.vercel.app

### Doğrulama

- Üretim HTML `canopy-v1` işaretini taşıyor; yeni JS/CSS dosyaları HTTP 200.
- Herkese açık ana sayfa HTTP 200; oturumsuz `/api/me` HTTP 401.
- Masaüstü ve 375px telefon tarayıcısında gerçek canlı giriş/kayıt formları,
  taşma, JS hatası ve HTTP 5xx kontrolü geçti. Üretimde deneme kaydı oluşturulmadı.
- Mevcut backend ile yalıtılmış bellek veritabanında gerçek tarayıcıdan kayıt,
  görev oluşturma/tamamlama, hızlı erişim ve aynı haritada çizim paneli doğrulandı.
- Üretim backend'inin 56 otomatik testi ve TypeScript kontrolü tekrar geçti.
- Son 10 dakikalık yeni dağıtım log taraması iki Node `DEP0169 url.parse()`
  kullanımdan kaldırma uyarısı döndürdü. Bunlar stderr nedeniyle error seviyesinde
  sınıflandı; canlı kontrollerde uygulama/HTTP 5xx hatası görülmedi.

### Kapsam

Hesaplar ve üretim kayıtları mevcut altyapıda kaldı; ticari PostgreSQL şeması için
üretim migration/import çalıştırılmadı. `vercel.commercial.json` etkinleştirilmedi.
Ticari runtime'ın ek modülleri, e-posta/ödeme ve Filiz modeli etkinleştirilmiş
gibi sunulmuyor. Ücretli satış kapalıdır. Özel dosyalar, yerel veriler ve env
dosyaları dağıtım yüklemesinden dışlandı.
