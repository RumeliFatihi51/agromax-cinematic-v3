# AgroMax hedef mimarisi

- React/Vite arayüzü mevcut bağlantıları ve parsel çalışma alanlarını korur. Tipli `/api/v1` servisleri ticari çalışma yolunda Zod ile doğrulanır. Üretim köprüsü mevcut oturum ve veri sahipliğiyle uyumlu kalır.
- Node, PostgreSQL ve Drizzle alan servisleri kuruluş bağlamını sunucuda çözer. Geometri ve analiz geçmişi kaydedildiği revizyonla ilişkilendirilir. Ham gözlem, türetilmiş değer, model çıktısı ve eksik veri ayrıştırılır.
- Uzun işlerde veritabanı iş kaydı dayanıklı gönderim kaynağıdır. Workflow sağlayıcı çağrısını ve yayını adımlara böler. İş sahipliği sonuç yazımından önce doğrulanır. İş durumu, sonuç, denetim ve bildirim aynı işlemle tamamlanır.
- Uydu adaptörleri ürün, bant, kalite, fiziksel birim, tarih ve doğal çözünürlüğü kendi sözleşmelerinde taşır. Nesne depolamada kuruluş yetkisi doğrulanmış dosyalar süreli erişimle açılır.
- Gözlem ve modelden çıkan iddialar kanıt, çelişki ve saha incelemesiyle ilişkilendirilir. Filiz yalnızca yetkisi yeniden doğrulanmış kaynakları kullanır. Reçete onayı ve cihaz aktarımı ayrı izinlerdir.

## Veri geçişi

İzole hedefte şifreli yedek ve geri yükleme, satır sayısı ve kimlik mutabakatı, geometri/sonuç özeti ve özel dosya doğrulaması yapılır. Canlı geçiş ayrı onay gerektirir. Yazılar durdurulduktan ve aktif işler bittikten sonra son farklar taşınır. Mutabakat geçince ticari çalışma yolu tek yazıcı olur. Yeni yazılar başladıktan sonra sorun yaşanırsa kayıtları koruyarak salt okunur moda geçilir ve ileri düzeltme yapılır.
