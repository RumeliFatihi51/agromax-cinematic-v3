# İlk veri bağlantıları

31 Ekim 2026 durumu: Esri uydu altlığı ve Photon yer araması etkin; Copernicus ve NASA/Earthdata gerçek servis istekleriyle doğrulandı. Anahtarlar kaynak koda veya tarayıcıya koyulmaz; sunucu ortam değişkenleri kullanılır. Güncel kapsam ve eksikler için [uydu belgesini](SATELLITE.md) ve [doğrulama kaydını](VERIFICATION.md) okuyun.

1. **Copernicus Data Space / Sentinel Hub**: Sentinel-2 görüntülerine erişim için OAuth client ID ve client secret. Önce tarla GeoJSON sınırı ve tarih aralığı gerekli. NDVI, NDRE ve su göstergeleri ilgili bantlar ve kalite maskeleriyle ayrı doğrulanacak. Sentinel-1 SAR ileri aşamada değerlendirilecek; radar doğrudan toprak nem ölçümü diye sunulmayacak.
2. **Meteoroloji**: MET Norway Locationforecast 2.0 `complete` kullanılır; API anahtarı gerektirmez. Veriler CC BY 4.0 atfıyla kullanılır. Sunucu tanımlayıcı User-Agent gönderir, koordinatları dört ondalığa indirger, PostgreSQL/SQLite önbelleğinde `Expires`, `Last-Modified` ve 304 yeniden doğrulamasına uyar. Çoklu instance sorguları lease ile ayrılır; 429 sonrasında kalıcı bekleme uygulanır. Sahiplik kontrolünden sonra çizilmiş parselin bbox orta noktası sorgulanır. Sıcaklık, nem, rüzgâr, basınç, bulut/sis, çiy noktası, açık gökyüzü UV ve sağlayıcının sunduğu diğer sayısal değişkenler korunur. Yağışın 1/6/12 saatlik dönemleri ayrı tutulur; çakışan dönemler toplanmaz. Sonuçlar model tahminidir; resmî uyarı veya istasyon ölçümü değildir. İleri toprak/ET₀/historik ihtiyaçlarında Open-Meteo ticari planı ayrıca değerlendirilebilir; ücretsiz barındırılan Open-Meteo API'si ticari kullanıma uygun plan yerine kullanılmaz.
3. **Harita**: Tarla çizimi ve GeoJSON içe/dışa aktarma uygulandı. Esri World Imagery uydu altlığı ve Photon yer araması var; ticari yüksek trafik için lisans/kapasiteye uygun tile ve geocoding hizmeti ayrıca seçilmeli.
4. **Saha doğrulaması**: Gerçek tarla sınırları, ürün/ekim tarihi, toprak ve yaprak analizi, varsa sensör verisi. Bu bilgiler olmadan agronomik reçete üretilemez.

Sulama ekranı için ürün/ekim tarihi, kök derinliği, toprak su tutma özellikleri ve sulama yöntemi/debisi gerekir. Sensör varsa üretici erişimi ayrıca bağlanır. Bitki besleme için gerçek toprak/yaprak analizi gerekir; spektral indeks tek başına gübre dozu oluşturmaz. Maliyet/görev/rapor ekranlarının temel kayıt işlevleri dış API olmadan geliştirilebilir. Filiz'in dil modeliyle konuşması için seçilecek sağlayıcı erişimi ayrıca gerekir; mevcut Filiz kurallı özet kullanır.

Resmî belgeler, 31 Ekim 2026 tarihinde kontrol edildi:

- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/UserGuides/BeginnersGuide.html
- https://open-meteo.com/en/pricing
- https://www.usgs.gov/centers/eros/science/usgs-eros-archive-sentinel-2
- https://docs.api.met.no/doc/License
- https://docs.api.met.no/doc/TermsOfService
- https://docs.api.met.no/doc/ForecastJSON
