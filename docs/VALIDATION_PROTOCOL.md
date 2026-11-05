# Ürün/bölge doğrulama protokolü

Durum: saha verisi ve doğrulama ortağı henüz yok. Bu belge bilimsel başarı iddiası değildir. İlk kapsam: buğday ve mısır; Türkiye ve seçilecek ilk AB bölgesi.

## Her yöntem için zorunlu dosya

- Yöntem/sürüm, yayın/kaynak, hedef ülke/bölge, ürün ve yetişme dönemi.
- Girdi tanımı, birim, örnekleme yöntemi, zaman, konum, belirsizlik ve kaynağın ölçüm/tahmin/beyan ayrımı.
- Uygunluk koşulları ve hesaplamayı engelleyen eksik/geçersiz girdiler.
- Bağımsız referans yöntemi; test edilecek hata ölçütleri ve kabul sınırları **sonuçlar görülmeden önce** uzman tarafından yazılır.
- İzinli saha kayıtları; geliştirme/kalibrasyon ile bağımsız test parselleri ayrıdır.
- Gerçek test raporu, başarısız örnekler, geçerli kullanım sınırı, uzman incelemesi ve tekrar değerlendirme tarihi.

## Sulama

FAO-56 referans ET₀ ve ürün su dengesi aşamaları ayrı doğrulanır. Gerekli meteoroloji, ürün katsayısı/dönemi, toprak su tutma ve başlangıç su durumu, etkin yağış, kök derinliği ve sistem verimi/debisi açıklanır. Model meteorolojisi tarla sensörü ölçümü diye sunulmaz. Eksik zorunlu girdi veya geçersiz ürün/bölge eşleşmesi miktar üretmez. Denklem doğruluğu saha tahmin doğruluğu yerine geçmez.

Kaynak: https://www.fao.org/4/x0490e/x0490e0a.htm

## Besleme

Laboratuvar yöntemi, sonuç birimi, örnek derinliği/tarihi ve ürün/bölge referansı gerekir. Birim dönüşümü ve gübre bileşim hesabı, besin ihtiyacının belirlenmesinden ayrıdır. Kullanıcı beyanı veya hesap girdisi laboratuvar ölçümü olarak işaretlenmez. NDVI/NDMI tek başına gübre dozu üretmez.

## Koruma

Gözlem ve uygulama kayıtları gerçek kullanıcı girdileridir. Ürün/ülke/ruhsatlı etiket ve sürüm doğrulanmadan uygulama dozu önerilmez. Etiket üzerinden alan/miktar hesabı hastalık teşhisi veya ilaç seçimi değildir. Kaynakların erişilebilir olması API/toplu yeniden dağıtım izni anlamına gelmez.

- https://bku.tarimorman.gov.tr/Arama/Index
- https://food.ec.europa.eu/plants/pesticides/authorisation-plant-protection-products_en

## Uydu

İzinli gerçek parsellerde geometri, tarihler, bant doğal çözünürlüğü, örnekleme, maske, NoData, piksel sayımı, formül ve dönem istatistikleri bağımsız işleme çıktısıyla karşılaştırılır. Eşik ve toleranslar karşılaştırma öncesi sabitlenir. Boş/az kaliteli veri, geometri değişimi ve farklı gözlem sıklığı ayrıca sınanır. Başarılı HTTP yanıtı bilimsel geçerlilik değildir.

## Aktivasyon

Bir yöntemin deterministik birim testlerinin geçmesi yalnızca yazılım hesabını doğrular. Saha/referans kanıtı yoksa otomatik agronomik yönlendirme etkinleştirilmez. Filiz bu kontrolü aşamaz. RGB'den multispektral tahmin ayrı araştırma konusudur; fiziksel NIR ölçümü gibi sunulmaz.
