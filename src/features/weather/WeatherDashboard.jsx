import { useEffect, useState } from "react";
import {
  ArrowRight,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";
import { api } from "../../api";
import "./weather.css";

import { labels, units, number, time, condition } from "./weather-format";
import { Metric, TemperatureChart } from "./WeatherWidgets";
export default function WeatherDashboard({ fields, onNavigate }) {
  const [fieldId, setFieldId] = useState(""),
    [forecast, setForecast] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0),
    [selectedTime, setSelectedTime] = useState(""),
    [hours, setHours] = useState(1),
    [clock, setClock] = useState(Date.now());
  const drawn = fields.filter((f) => f.geometry),
    activeId = drawn.some((f) => f.id === fieldId)
      ? fieldId
      : drawn[0]?.id || "";
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setForecast(null);
    setError("");
    setSelectedTime("");
    if (!activeId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api(`weather?fieldId=${encodeURIComponent(activeId)}`, undefined, "GET", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted && result.fieldId === activeId) {
          setForecast(result);
          setClock(Date.now());
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeId, reload]);
  const data = forecast?.fieldId === activeId ? forecast : null;
  const points = data?.points.filter((p) => Date.parse(p.time) >= clock) || [];
  const selected = points.find((p) => p.time === selectedTime) || points[0];
  const period =
    selected?.periods.find((p) => p.hours === hours) || selected?.periods[0];
  const weather = condition(period?.symbol),
    WeatherIcon = weather.Icon;
  const nextDay = points.length
    ? points.filter((p) => Date.parse(p.time) <= clock + 24 * 3600000)
    : [];
  const instantKeys = [
    ...new Set(points.flatMap((p) => Object.keys(p.values))),
  ];
  return (
    <div className="weather-workspace">
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">TARLANIN ÜZERİNDEKİ GÖKYÜZÜ</span>
          <h1>Havayı bil, gününü planla.</h1>
          <p>
            Parselinin konumuna ait tarihli tahminler, tek bir çalışma alanında.
          </p>
        </div>
        <span className="weather-source-tag">
          <CloudSun size={16} /> MET Norway
        </span>
      </div>
      <div className="weather-toolbar">
        <label>
          <MapPin size={18} />
          <span className="sr-only">Meteoroloji için parsel seç</span>
          <select
            value={activeId}
            onChange={(e) => setFieldId(e.target.value)}
            disabled={!drawn.length}
          >
            {!drawn.length && <option value="">Önce parsel sınırı ekle</option>}
            {drawn.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <span>Tüm saatler Türkiye saati · UTC+3</span>
        <button
          className="secondary"
          disabled={loading || !activeId}
          onClick={() => setReload((n) => n + 1)}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Güncelle
        </button>
      </div>
      {!activeId ? (
        <section className="weather-empty">
          <MapPin size={35} />
          <h2>Tahmini, kendi tarlan için aç.</h2>
          <p>
            Konumu belli bir tahmin için haritada parsel sınırını çiz. Yalnızca
            alanı girilmiş tarlalarda konum varsaymıyoruz.
          </p>
          <button className="primary" onClick={() => onNavigate("fields")}>
            Tarlalarıma git <ArrowRight size={17} />
          </button>
        </section>
      ) : loading ? (
        <section className="weather-loading" role="status">
          <LoaderCircle className="spin" size={27} />
          <h2>Gökyüzünün bilgisi geliyor.</h2>
          <p>Parsel konumun için kaynaktaki tahmin sorgulanıyor.</p>
        </section>
      ) : error ? (
        <section className="weather-empty weather-error" role="alert">
          <Cloud size={34} />
          <h2>Tahmin şu an alınamadı.</h2>
          <p>{error}</p>
          <button className="secondary" onClick={() => setReload((n) => n + 1)}>
            Yeniden dene
          </button>
        </section>
      ) : data && selected ? (
        <>
          <div className="weather-top-grid">
            <section className="weather-hero">
              <div className="weather-hero-top">
                <span>MODEL TAHMİNİ</span>
                <WeatherIcon size={58} strokeWidth={1.4} />
              </div>
              <p>{data.fieldName}</p>
              <div className="weather-temperature">
                {number(selected.values.air_temperature)}
                <span>°C</span>
              </div>
              <h2>{weather.label}</h2>
              <div className="weather-hero-time">
                <span>{time(selected.time)}</span>
                <label>
                  <span className="sr-only">Tahmin zamanını seç</span>
                  <select
                    value={selected.time}
                    onChange={(e) => setSelectedTime(e.target.value)}
                  >
                    {points.map((p) => (
                      <option key={p.time} value={p.time}>
                        {time(p.time)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <small>Hava sıcaklığı tahmini · yerinde ölçüm değildir</small>
            </section>
            <section className="weather-trend">
              <div className="weather-section-title">
                <div>
                  <span>ÖNÜMÜZDEKİ 24 SAAT</span>
                  <h2>Sıcaklığın seyri</h2>
                </div>
                <Thermometer size={23} />
              </div>
              <TemperatureChart points={nextDay} />
              <p className="weather-quiet">
                Çizgi, sağlayıcının mevcut tahmin noktalarını birleştirir.
                Ayrıntıları aşağıdaki tabloda inceleyebilirsin.
              </p>
            </section>
          </div>
          <div className="weather-metric-row">
            <Metric
              Icon={Droplets}
              label="Bağıl nem"
              value={selected.values.relative_humidity}
              unit="%"
              tone="blue"
            />
            <Metric
              Icon={Wind}
              label="Rüzgâr hızı"
              value={selected.values.wind_speed}
              unit="m/sn"
              tone="mint"
            />
            <Metric
              Icon={Gauge}
              label="Deniz seviyesi basıncı"
              value={selected.values.air_pressure_at_sea_level}
              unit="hPa"
              tone="violet"
            />
            <Metric
              Icon={Cloud}
              label="Bulutluluk"
              value={selected.values.cloud_area_fraction}
              unit="%"
              tone="peach"
            />
          </div>
          <div className="weather-middle-grid">
            <section className="weather-period">
              <div className="weather-section-title">
                <div>
                  <span>SEÇİLİ SAATTEN SONRA</span>
                  <h2>Yağışa yakından bak</h2>
                </div>
                <CloudRain size={25} />
              </div>
              <div className="weather-period-tabs" aria-label="Tahmin dönemi">
                {selected.periods.map((p) => (
                  <button
                    key={p.hours}
                    className={period?.hours === p.hours ? "active" : ""}
                    aria-pressed={period?.hours === p.hours}
                    onClick={() => setHours(p.hours)}
                  >
                    Sonraki {p.hours} saat
                  </button>
                ))}
              </div>
              {period ? (
                <>
                  <div className="weather-rain">
                    <strong>
                      {number(period.values.precipitation_amount)}{" "}
                      <small>
                        {Number.isFinite(period.values.precipitation_amount)
                          ? "mm"
                          : ""}
                      </small>
                    </strong>
                    <p>
                      {time(period.from)} – {time(period.to)}
                    </p>
                  </div>
                  <p className="weather-quiet">
                    Seçili dönemin toplam yağış tahmini. Eksik yağış bilgisi
                    sıfır olarak gösterilmez.
                  </p>
                  <dl className="weather-period-details">
                    {Object.entries(period.values)
                      .filter(([key]) => key !== "precipitation_amount")
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{labels[key] || key}</dt>
                          <dd>
                            {number(value)}{" "}
                            {Number.isFinite(value)
                              ? (units[data.units[key]] ?? data.units[key])
                              : ""}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </>
              ) : (
                <p>Bu tahmin noktası için ileri dönem özeti bulunmuyor.</p>
              )}
            </section>
            <section className="weather-provenance">
              <span className="weather-provenance-icon">
                <MapPin size={24} />
              </span>
              <span className="studio-kicker">
                VERİNİN NEREDEN GELDİĞİNİ BİL
              </span>
              <h2>
                Kaynağı açık.
                <br />
                Zamanı belli.
              </h2>
              <dl>
                <div>
                  <dt>Sağlayıcı güncellemesi</dt>
                  <dd>{time(data.updatedAt, { year: "numeric" })}</dd>
                </div>
                <div>
                  <dt>Son kaynak kontrolü</dt>
                  <dd>{time(data.checkedAt)}</dd>
                </div>
                <div>
                  <dt>Tahmin noktası</dt>
                  <dd>
                    {data.point.lat.toFixed(4)}, {data.point.lon.toFixed(4)}
                  </dd>
                </div>
                {Number.isFinite(data.modelElevationM) && (
                  <div>
                    <dt>Model noktasının yüksekliği</dt>
                    <dd>{number(data.modelElevationM)} m</dd>
                  </div>
                )}
              </dl>
              <p>
                {data.pointMethod} Model ızgarasındaki tahmin, tarlanın
                tamamında aynı koşulların oluşacağını garanti etmez.
              </p>
            </section>
          </div>
          <section className="weather-all-data">
            <div className="weather-section-title">
              <div>
                <span>MEVCUT TÜM ANLIK DEĞİŞKENLER</span>
                <h2>Tahmin defteri</h2>
              </div>
              <span>{points.length} zaman noktası</span>
            </div>
            <p className="weather-quiet">
              Sağlayıcının saatlik ve daha seyrek tahminleri birlikte
              listelenir. Satıra tıklayarak o zamanın dönem verilerini yukarıda
              açabilirsin. “—” geçerli değer bulunmadığını belirtir.
            </p>
            <div
              className="weather-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Meteoroloji tahmin tablosu"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tahmin zamanı</th>
                    {instantKeys.map((key) => (
                      <th scope="col" key={key}>
                        {labels[key] || key}
                        <small>
                          {units[data.units[key]] ?? data.units[key]}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr
                      key={p.time}
                      className={selected.time === p.time ? "selected" : ""}
                    >
                      <th scope="row">
                        <button
                          onClick={() => setSelectedTime(p.time)}
                          aria-pressed={selected.time === p.time}
                        >
                          {time(p.time)}
                        </button>
                      </th>
                      {instantKeys.map((key) => (
                        <td key={key}>{number(p.values[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <footer className="weather-attribution">
            Veri:{" "}
            <a href={data.sourceUrl} target="_blank" rel="noreferrer">
              MET Norway
            </a>{" "}
            ·{" "}
            <a href={data.licenseUrl} target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>{" "}
            · Agromax gösterim için dönüştürür; istasyon gözlemi veya resmî
            meteorolojik uyarı olarak sunulmaz. Sulama ve ilaçlama kararlarında
            saha koşullarını ayrıca değerlendir.
          </footer>
        </>
      ) : data ? (
        <section className="weather-empty">
          <CloudSun size={34} />
          <h2>Bu tahminin geçerli saatleri sona erdi.</h2>
          <p>Yeni tahmin noktalarını almak için güncelle.</p>
          <button className="secondary" onClick={() => setReload((n) => n + 1)}>
            Tahmini güncelle
          </button>
        </section>
      ) : null}
    </div>
  );
}
