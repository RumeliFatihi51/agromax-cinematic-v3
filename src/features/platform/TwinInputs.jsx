import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { api } from '../../api';
import { sensorMetrics } from '../../../shared/field-observations';

const formatDate = value => value ? new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium', timeZone: 'Europe/Istanbul',
}).format(new Date(value)) : 'Kayıt yok';
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export default function TwinInputs({ context, records, onNavigate, onField }) {
  const { field, geometryHash, latestAnalysis } = context;
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!field.geometry) return;
    const controller = new AbortController();
    api('weather?fieldId=' + encodeURIComponent(field.id), undefined, 'GET', { signal: controller.signal })
      .then(setWeather).catch(error => { if (!controller.signal.aborted) setWeatherError(error.message); });
    return () => controller.abort();
  }, [field.id, field.geometry, attempt]);
  const current = records.filter(record => record.status !== 'archived' && record.fieldSnapshot.geometryHash === geometryHash);
  const soil = current.filter(record => record.kind === 'observation' && record.payload.category === 'soil');
  const sensorRows = current.filter(record => record.kind === 'observation' && record.payload.sensor)
    .sort((a, b) => b.payload.observedAt.localeCompare(a.payload.observedAt));
  const latestReadings = [...new Map(sensorRows.slice().reverse().map(record =>
    [record.payload.sensor.device + '\0' + record.payload.sensor.metric, record])).values()].reverse();
  const next = weather?.points?.find(point => Date.parse(point.time) >= Date.now());
  const temperature = next?.values?.air_temperature;
  return <section className="px-surface px-section" aria-labelledby="twin-inputs-title">
    <h2 id="twin-inputs-title">Parselin güncel durumu</h2>
    <div className="px-table-wrap"><table>
      <thead><tr><th scope="col">Girdi</th><th scope="col">Son kayıt</th><th scope="col">Kaynak</th></tr></thead>
      <tbody>
        <tr><th scope="row">Ürün ve ekim</th><td>{field.crop || 'Ürün kaydı yok'} · {formatDate(field.sowingDate)}</td><td><button onClick={onField}>Parsel kaydı <ArrowUpRight size={14}/></button></td></tr>
        <tr><th scope="row">Uydu gözlemi</th><td>{latestAnalysis ? formatDate(latestAnalysis.fetchedAt) + ' · ' + latestAnalysis.observationCount + ' gözlem' : 'Güncel sınırla analiz yok'}</td>
          <td><button onClick={() => onNavigate('history', field.id)}>{latestAnalysis?.source || 'Analiz geçmişi'} <ArrowUpRight size={14}/></button></td></tr>
        <tr><th scope="row">Hava tahmini</th><td>{!field.geometry ? 'Parsel sınırı gerekli' : weatherError ? <>
          <span>{weatherError}</span> <button onClick={() => { setWeatherError(''); setAttempt(value => value + 1); }}>Tekrar dene</button>
        </> : !weather ? 'Tahmin alınıyor…' : Number.isFinite(temperature) ? number.format(temperature) + ' °C · ' + formatDate(next.time) : 'Yaklaşan sıcaklık tahmini yok'}</td>
          <td><button onClick={() => onNavigate('weather', field.id)}>{weather?.source || 'Meteoroloji'} <ArrowUpRight size={14}/></button></td></tr>
        <tr><th scope="row">Toprak ve saha</th><td>{soil.length ? soil.length + ' toprak gözlemi' : 'Toprak gözlemi yok'} · {current.filter(record => record.kind === 'investigation').length} saha incelemesi</td>
          <td><button onClick={() => onNavigate('temporal', field.id)}>Arazi hafızası <ArrowUpRight size={14}/></button></td></tr>
        <tr><th scope="row">Yönetim geçmişi</th><td>{current.filter(record => record.kind === 'scenario').length} senaryo · {current.filter(record => record.kind === 'prescription').length} reçete dosyası</td>
          <td><button onClick={() => onNavigate('scenarios', field.id)}>Senaryo laboratuvarı <ArrowUpRight size={14}/></button></td></tr>
        {latestReadings.slice(0, 12).map(record => {
          const { sensor, observedAt } = record.payload, metric = sensorMetrics[sensor.metric];
          return <tr key={record.id}><th scope="row">{metric.label}</th><td>{number.format(sensor.value)} {metric.unit} · {formatDate(observedAt)}</td><td>{sensor.device} · Elle girilen saha kaydı</td></tr>;
        })}
      </tbody>
    </table></div>
    {!latestReadings.length && <p>Bu sınıra bağlı sensör ölçümü kaydedilmemiş.</p>}
  </section>;
}
