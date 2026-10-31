# Arayüz yapısı

Yeni arayüz çalışma alanı, ana ekran, görev panosu ve ortak diyaloglar olarak ayrıldı:

- `src/App.jsx`: oturum, kayıtlar ve ekran geçişleri. Kayıt yüklenmeden sayılar gösterilmez; hata durumunda yeniden deneme sunulur.
- `src/components/AppShell.jsx`: daraltılabilir masaüstü menüsü, mobil menü, üst bar ve profil/çıkış işlemleri.
- `src/components/QuickSearch.jsx`: Ctrl+K ile kullanıcının kendi tarlaları ve modülleri arasında arama.
- `src/components/useDialogFocus.js`: diyalog odağı, Tab döngüsü, Escape ile kapatma ve odağı geri verme.
- `src/features/overview/Dashboard.jsx`: gerçek tarla/görev kayıtlarından özet, uydu alanı ve sonraki işler.
- `src/features/tasks/TaskBoard.jsx`: bekleyen/tamamlanan/tüm görev filtreleri.
- `src/features/tasks/TaskModal.jsx`: tarih ve görev adıyla yeni kayıt.
- `src/styles/studio.css`: yeni çalışma alanının görünümü ve ekran genişliğine göre düzenleri. Eski temel/harita stilleri altında uyumluluk katmanı olarak kalır; yeni çalışma alanı `studio-` ad alanını kullanır.

Harita, arama, parsel çizimi ve kaydetme mevcut modüllerde korunur. Mobil haritada tarla listesi başlangıçta daraltılır; başlıktaki okla açılır. Uydu/veri bağlantıları tamamlanmamışsa hayalî indeks veya hava sonucu gösterilmez.

Parsel oluşturma açık haritada yapılır: hem ana ekranın uydu alanı hem tarla çalışma alanı kendi mevcut `ParcelMap` örneğini korur. `FieldEditor` yalnızca kayıt formudur; harita oluşturmaz. Çizim moduna giriş/çıkış `editSession` ile mevcut Leaflet örneğinde yönetilir. Aranan konum, yakınlaştırma ve altlık seçimi yeniden başlatılmaz. Kaydetme sonrası analiz ekranına otomatik geçilmez; kullanıcı haritada kalır. Liste/analiz geçişinde tarla haritası gizlenir, bileşeni kaldırılmaz. Kayıt değişimlerinde tüm parsellere otomatik yeniden odaklanma yalnızca ilk yüklemeyle sınırlandırılır.

Tema: açık zemin, koyu orman yeşili menü, beyaz yüzeyler, limon rengi aktif gezinme; alan, parsel ve görev kartlarında kum, mavi ve lavanta vurgular. Yerel Manrope fontu kullanılır; Google Fonts isteği kaldırılmıştır.

Görsel bileşenler ve yeni düzen:

- `src/components/ui/WorkspaceUI.jsx`: ortak sayfa başlığı, özet kartı, bölüm başlığı ve boş durum bileşenleri.
- `src/styles/workspace.css`: renk değişkenleri, ortak bileşenler, menü, giriş ekranı ve responsive kurallar.
- `src/features/overview/overview.css`: yalnızca ana ekranın kartları, harita yerleşimi, görev ve tarla listeleri.
- Ana ekranın dört özeti yalnızca oturum sahibinin yüklenen kayıtlarından hesaplanır. Uydu indeksi, verim tahmini veya hava durumu örnek sayıları kullanılmaz.
- Ana ekrandaki harita artık konum aramasını gösterir; büyük tanıtım metni haritanın üstünü kapatmaz. Tam ekran düğmesi mevcut harita elemanını Fullscreen API ile genişletir; desteklenmezse gerçek hata mesajı gösterilir.
- Giriş ekranı mevcut optimize edilmiş marka illüstrasyonu ve SVG logo ile devam eder. İllüstrasyonun gerçek uydu görüntüsü olmadığı açıkça belirtilir.
- Mobil menüde Escape, Tab odağı döngüsü, kapanışta odağı geri verme ve arka plan kaydırma kilidi bulunur. Ana içeriğe geçiş bağlantısı ve azaltılmış hareket tercihi desteklenir.

Doğrulama: üretim derlemesi ve mevcut sunucu testleri çalıştırılır. Giriş, menü ve ortak başlık bileşenleri React sunucu render işlemiyle kontrol edilir; bu işlem kullanıcı veya parsel kaydı oluşturmaz. Tarayıcı erişim sunucusu kullanılamadığında masaüstü/mobil görsel kontrol tamamlanmış sayılmaz.
