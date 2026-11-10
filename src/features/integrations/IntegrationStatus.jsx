import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Satellite,
  Map,
  CloudSun,
  ScanLine,
  Globe,
  RefreshCw,
} from "lucide-react";
import { api } from "../../api";
import StatusIndicator from "../../components/ui/StatusIndicator";
import {
  indices,
  availableMetrics,
  availableQualityBands,
} from "../../../shared/metrics";
export default function IntegrationStatus({ status }) {
  const [error, setError] = useState(""),
    [nasa, setNasa] = useState(null),
    [checking, setChecking] = useState(false);
  useEffect(() => {
    api("nasa/status")
      .then(setNasa)
      .catch((e) => setError(e.message));
  }, []);
  async function verifyNasa() {
    setChecking(true);
    setError("");
    try {
      setNasa(await api("nasa/verify", {}));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }
  const labels = {
    verified: "Canlı erişim doğrulandı",
    missing_configuration: "Yapılandırma eksik",
    not_verified: "Yapılandırıldı · Doğrulama bekliyor",
    unauthorized: "Erişim kabul edilmedi",
    rate_limited: "Servis hız sınırı",
    unavailable: "Erişim doğrulanamadı",
  };
  return (
    <>
      <section className="intro-note">
        <ShieldCheck />
        <div>
          <h2>Verinizin nereden geldiği belli.</h2>
          <p>
            Kimlik bilgileri yalnızca sunucuda kullanılır. “Yapılandırıldı”
            ifadesi canlı erişimin doğrulandığı anlamına gelmez.
          </p>
        </div>
      </section>
      {error && <p className="error">{error}</p>}
      <div className="integration-register px-table-wrap" tabIndex={0} role="region" aria-label="Veri sağlayıcıları tablosu">
        <table>
          <caption>Veri sağlayıcıları</caption>
          <thead><tr><th scope="col">Sağlayıcı</th><th scope="col">Kapsam</th><th scope="col">Durum</th></tr></thead>
          <tbody>
        {[
          [
            Satellite,
            status?.source || "Copernicus Data Space",
            status === null
              ? "Bağlantı durumu yükleniyor"
              : status.unavailable
                ? "Bağlantı durumu alınamadı"
                : status.health?.lastError
                ? "Son istek başarısız"
                : status.health?.lastSuccessAt
                  ? "Gerçek servis yanıtı alındı"
                  : status.configured
                    ? status.provider === "earth-search" ? "Açık arşiv · Parsel analizine hazır" : "Yapılandırıldı · Bu oturumda istek bekleniyor"
                    : "Sunucu yapılandırması eksik",
            status?.provider === "earth-search"
              ? "Sentinel‑2 açık arşivinden NDVI, NDRE, NDMI, NDWI, EVI ve WDRVI. Sonuçlar parselin analiz geçmişine kaydedilir."
              : `${indices.length} optik indeks, 12 spektral bant, AOT ve dört gözlem açısı. CDSE bu koleksiyonda WVP/CLP/CLM sağlamaz; desteklenmeyen ürünlerden sonuç üretilmez. ${status?.health?.lastSuccessAt ? "Son başarılı servis yanıtı: " + new Date(status.health.lastSuccessAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : "Kimlik bilgilerinin varlığı tek başına canlı erişim kanıtı değildir."}`,
          ],
          [
            Map,
            "Parsel haritası",
            "Etkin · Esri World Imagery",
            "Çizim, köşe düzenleme, kesme, taşıma, döndürme ve GeoJSON işlemleri. Ticari ölçek için harita sunucusu kapasitesi ayrıca planlanmalı.",
          ],
          [
            CloudSun,
            "Meteoroloji",
            "MET Norway · Anahtar gerektirmez",
            "Parsel konumuna göre model tahminleri: sıcaklık, yağış, nem, rüzgâr ve sağlayıcının diğer değişkenleri. Canlı sorgu Hava durumu ekranından yapılır; her yanıtta kaynak ve güncelleme zamanı gösterilir. İstasyon gözlemi değildir.",
          ],
          [
            ScanLine,
            "Radar, termal ve hava fotoğrafları",
            "Ayrı entegrasyon gerekli",
            "Sentinel-1 SAR, Landsat termal ve drone görüntüleri optik Sentinel-2 paketinden ayrı işlenecek.",
          ],
        ].map(([Icon, title, label, text]) => (
          <tr key={title}>
            <th scope="row"><span><Icon size={20} aria-hidden="true" />{title}</span></th>
            <td>{text}</td>
            <td><span className="tag">{label}</span></td>
          </tr>
        ))}
          </tbody>
        </table>
      </div>
      <section className="panel integration-catalog nasa-connections">
        <div className="workspace-section-heading">
          <div>
            <span className="workspace-eyebrow">
              AYRI KİMLİKLER, AYRI VERİ KAYNAKLARI
            </span>
            <h2>NASA & Earthdata</h2>
          </div>
          <button
            className="secondary"
            onClick={verifyNasa}
            disabled={
              checking ||
              !nasa ||
              !Object.values(nasa).some((s) => s.configured)
            }
          >
            <RefreshCw size={16} className={checking ? "spin" : ""} />
            {checking
              ? "Gerçek erişim kontrol ediliyor…"
              : "Bağlantıları doğrula"}
          </button>
        </div>
        <div className="nasa-connection-grid">
          {["nasa", "earthdata"].map((id) => {
            const source = nasa?.[id];
            return (
              <article key={id}>
                <Globe size={20} />
                <h3>
                  {source?.label ||
                    (id === "nasa" ? "NASA Open APIs" : "NASA Earthdata · HLS")}
                </h3>
                <StatusIndicator
                  tone={
                    source?.state === "verified"
                      ? "success"
                      : source?.state === "unauthorized"
                        ? "error"
                        : "neutral"
                  }
                >
                  {source
                    ? labels[source.state] || source.state
                    : "Durum yükleniyor…"}
                </StatusIndicator>
                <p>
                  {source?.detail ||
                    (source?.configured
                      ? "Anahtarın bulunması veri erişiminin doğrulandığı anlamına gelmez."
                      : "Bu bağlantı için sunucu kimliği gerekir.")}
                </p>
                {source?.checkedAt && (
                  <small>
                    Son kontrol:{" "}
                    {new Date(source.checkedAt).toLocaleString("tr-TR", {
                      timeZone: "Europe/Istanbul",
                    })}
                  </small>
                )}
                {source?.evidence?.collection && (
                  <small>
                    Kontrol kaynağı: {source.evidence.collection} ·{" "}
                    {source.evidence.granuleId}
                  </small>
                )}
              </article>
            );
          })}
        </div>
        <p>
          Earthdata kontrolü gerçek bir korumalı HLS bant dosyasına erişimi
          sınar. HLS parsel analizi ve NASA meteoroloji akışı henüz bu ekrana
          bağlanmadı. Mevcut indeksler Copernicus Sentinel-2 sonuçlarıdır.
        </p>
      </section>
      <section className="panel integration-catalog">
        <h2>Optik analiz kapsamı</h2>
        <p>{indices.map((m) => m.id).join(" · ")}</p>
        <h3>Ham / yardımcı bantlar</h3>
        <p>
          {availableMetrics(status?.provider || "cdse")
            .filter((m) => !indices.includes(m))
            .map((m) => m.id)
            .join(" · ")}
        </p>
        <h3>Kalite verileri</h3>
        <p>
          {availableQualityBands(status?.provider || "cdse").join(" · ")} ·
          Bulut/gölge/kar maskesi, geçerli piksel oranı ve çekim katalog kaydı.
        </p>
        <p>
          Yeterli kaliteli veri bulunmazsa sonuç boş bırakılır. “Tüm veri” sabit
          ve sınırsız bir liste değildir; her yeni koleksiyon lisansı, bantları
          ve doğrulama yöntemiyle ayrı eklenir.
        </p>
      </section>
    </>
  );
}
