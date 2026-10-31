# İlk veri bağlantıları

Parsel haritası OpenStreetMap üzerinden etkin. Copernicus Data Space adaptörü ve client ID yapılandırıldı; eşleşen client secret eksik olduğu için canlı uydu erişimi doğrulanmadı. Anahtarlar kaynak koda veya tarayıcıya koyulmaz; sunucu ortam değişkenleri kullanılır. Güncel kapsam ve eksikler için [uydu belgesini](SATELLITE.md) okuyun.

1. **Copernicus Data Space / Sentinel Hub**: Sentinel-2 görüntülerine erişim için OAuth client ID ve client secret. Önce tarla GeoJSON sınırı ve tarih aralığı gerekli. NDVI, NDRE ve su göstergeleri ilgili bantlar ve kalite maskeleriyle ayrı doğrulanacak. Sentinel-1 SAR ileri aşamada değerlendirilecek; radar doğrudan toprak nem ölçümü diye sunulmayacak.
2. **Meteoroloji**: Ticari kullanıma uygun sağlayıcı erişimi. Open-Meteo ticari aboneliği adaydır; müşteri API anahtarı ve kullanım planı gerekir. Konum ve zaman dilimi her kayda eklenmeli. Tahmin ile gözlem ayrı tutulmalı.
3. **Harita**: Tarla çizimi ve GeoJSON içe/dışa aktarma uygulandı. Mevcut OSM altlığı API anahtarı istemez; ticari yüksek trafik için uygun tile servisi veya kendi sunucusu seçilmeli.
4. **Saha doğrulaması**: Gerçek tarla sınırları, ürün/ekim tarihi, toprak ve yaprak analizi, varsa sensör verisi. Bu bilgiler olmadan agronomik reçete üretilemez.

Resmî belgeler, 30 Ekim 2026 tarihinde kontrol edildi:

- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/UserGuides/BeginnersGuide.html
- https://open-meteo.com/en/pricing
- https://www.usgs.gov/centers/eros/science/usgs-eros-archive-sentinel-2
