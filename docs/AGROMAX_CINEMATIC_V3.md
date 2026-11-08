# AgroMax Cinematic V3

## Yerleşim ve uygulama sırası

Referans 1672 × 941 px. Sol menü x 0–261, çalışma alanı x 280–1311, Filiz x 1327–1664. Hero y 0–255, KPI y 235–344, harita ve parsel y 362–735, modüller y 753–918. Harita yaklaşık %64, parsel paneli %36. Renk ailesi koyu orman, sıcak ivory ve botanik yeşil. Başlık serif, kontroller Instrument Sans.

1. Mevcut Dashboard kompozisyonunu yeniden kur. AppShell menü, arama, bildirim, oturum ve kuruluş davranışlarını taşısın. Parsel çizimi mevcut ParcelMap ve FieldEditor üzerinden yürüsün.
2. Dashboard kendi grid ve yüzey kurallarına sahip olsun. Kullanılmayan eski Dashboard kuralları kaldırılırken diğer modüllerin kullandığı ortak sınıflar korunur.
3. Hero posterinden başla. tarim2 SceneRefinement’teki maskeyi, sınırlı ölçek değişimini ve yaşam döngüsü temizliğini GSAP ile uygula. Basit etkileşimleri CSS ile çalıştır. Görsel ve metin CSS başlangıcında görünür kalır. Ağ ve veri durumu animasyondan bağımsızdır.
4. Parsel, analiz geçmişi, hava, uydu katmanı ve Filiz gerçek uçlardan gelir. Uygun analiz ve erişim yoksa arayüz ilgili boş veya hata durumunu gösterir.
5. Tablet ve telefonda Filiz ayrı çalışma alanına, parsel özeti mobil alt panele geçer. Sekiz viewport, hareket tercihi, canlı etkileşim ve mevcut regresyonlar tarayıcıda sınanır.

[tarim2 hareket ve sahne referansı](https://github.com/RumeliFatihi51/tarim2/tree/99dad08144b19ef326a2ddd4678659347c04d45c/src)
