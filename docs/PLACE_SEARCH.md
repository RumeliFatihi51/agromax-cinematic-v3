# Haritada yer arama

Uydu çalışma alanı, parsel düzenleyici ve analiz haritasındaki arama kutusu; yer/adres metnini Photon'a gönderir. Arama yalnızca Enter veya Ara düğmesiyle başlatılır; yazarken otomatik sorgu yapılmaz. Kullanıcının harita merkezi sonuç sıralamasını destekler, sonuçları Türkiye ile sınırlamaz.

Sonuçlar gerçek sağlayıcı yanıtından gelir. Seçilen sonucun sınır kutusu varsa harita o bölgeyi gösterir; yoksa koordinata yakınlaşır. Mor işaret arama sonucudur, kayıtlı tarla değildir; parsel geometrisini ve tarla verilerini değiştirmez. Kayıtlı parsel sınırları limon yeşilidir.

`server/places.js` sağlayıcı, doğrulama, sınırlama ve bir saatlik (en fazla 200 sorgu) bellek önbelleğini yönetir. Aynı uygulama sürecinden saniyede en fazla bir yeni sorgu gönderilir. Hizmet hatası veya sonuç bulunamaması açık gösterilir; koordinat uydurulmaz. Oturum açılmadan arama servisi kullanılamaz. Tarayıcıya servis anahtarı gönderilmez.

`GEOCODING_URL` ortam değişkeniyle Photon uyumlu uç nokta değiştirilebilir. Varsayılan `https://photon.komoot.io/api/` herkese açık demo hizmetidir; makul proje trafiğine izin verir, süreklilik garantisi vermez ve yoğun kullanımı sınırlar. Ticari büyümeden önce kendi Photon sunucusu veya uygun hizmet planı seçilmelidir. Bu sürüm için ek API anahtarı gerekmez.

Arama metni ve harita merkezi sorgu sırasında sağlayıcıya iletilir. OpenStreetMap/Photon atfı sonuç panelinde gösterilir. Kalıcı arama geçmişi oluşturulmaz; kısa süreli önbellek sunucu belleğindedir.

Kaynaklar:

- https://github.com/komoot/photon
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
