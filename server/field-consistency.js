import { validateGeometry } from '../shared/geometry.js';
import { parseDraft } from '../shared/platform-contracts.js';
import { availableMetrics } from '../shared/metrics.js';
import { openSentinelMetrics, openSentinelProvider } from '../shared/open-sentinel.js';
import { validateManagementZones } from './management-zones.js';

export function fieldConsistency(field, hash, jobs, analyses, records) {
  const issues = [];
  const add = (code, level, title, detail, action, reference) => {
    issues.push({ code, level, title, detail, action, reference });
  };
  let validGeometry = false;
  if (field.geometry) {
    try {
      validateGeometry(field.geometry);
      validGeometry = true;
    } catch (error) {
      add('boundary_invalid', 'critical', 'Parsel sınırı geçersiz', error.message, 'fields', field.id);
    }
  }

  const [latest] = analyses;
  if (latest) {
    const { analysis, id } = latest;
    const { from, split, to } = analysis.range || {};
    const start = Date.parse(from), middle = Date.parse(split), end = Date.parse(to);
    if (!(start < middle && middle < end)) {
      add('date_conflict', 'critical', 'Analiz dönemleri geçersiz', 'Başlangıç, dönem ayrımı ve bitiş tarihlerini geçmişten kontrol edin.', 'history', id);
    }
    if (analyses.slice(1).some(({ analysis: older }) => older.method !== analysis.method || older.provider !== analysis.provider)) {
      add('method_changed', 'review', 'Farklı analiz yöntemleri var', 'Dönemleri karşılaştırmadan önce sağlayıcıyı, yöntem sürümünü ve çözünürlüğü kontrol edin.', 'history', id);
    }
    const expected = analysis.provider === openSentinelProvider ? openSentinelMetrics :
      ['cdse', 'sentinelhub'].includes(analysis.provider) ? availableMetrics(analysis.provider) : null;
    if (expected && Array.isArray(analysis.availableMetrics)) {
      const declared = new Set(analysis.availableMetrics);
      const supported = new Set(expected.map(metric => metric.id));
      const incompatible = [...declared].filter(metric => !supported.has(metric));
      if (incompatible.length) {
        add('sensor_metric_mismatch', 'critical', 'Sensörle uyumsuz katman kaydı', incompatible.join(', '), 'history', id);
      }
      const missing = [...new Set(expected.filter(metric => declared.has(metric.id))
        .flatMap(metric => metric.bands || []))].filter(band => supported.has(band) && !declared.has(band));
      if (missing.length) {
        add('missing_bands', 'review', 'Analiz katmanlarının girdi bantları eksik', missing.join(', '), 'history', id);
      }
    }
    if ((analysis.observations || []).some(day => Date.parse(day.from) >= Date.parse(day.to) ||
        Date.parse(day.from) < start || Date.parse(day.to) > end)) {
      add('observation_date_conflict', 'critical', 'Dönem dışında uydu gözlemi var', 'Gözlem tarihlerini ve seçilen analiz aralığını karşılaştırın.', 'history', id);
    }
  }

  if (jobs[0]?.state === 'failed') {
    add('analysis_failed', 'review', 'Son analiz tamamlanamadı', 'İşlem hatasını açıp yeniden deneme koşullarını kontrol edin.', 'history', jobs[0].id);
  }
  const outdated = records.filter(record => record.status !== 'archived' && record.fieldSnapshot?.geometryHash !== hash);
  if (outdated.length) {
    add('outdated_files', 'review', 'Eski parsel sınırına bağlı çalışma dosyaları var',
      `${outdated.length} dosyayı güncel sınırla kullanmadan önce yeniden inceleyin.`, 'twin');
  }
  for (const record of records) {
    if (record.kind !== 'prescription' || record.status === 'archived' || record.fieldSnapshot?.geometryHash !== hash) continue;
    try {
      parseDraft({ fieldId: field.id, kind: record.kind, name: record.name, payload: record.payload });
      if (validGeometry) validateManagementZones(record.payload.zones, field.geometry);
    } catch {
      add('prescription_invalid', 'critical', 'Reçete miktarı, birimi veya bölgesi geçersiz',
        `“${record.name}” dosyasındaki uygulamayı ve bölge sınırlarını kontrol edin.`, 'prescriptions', record.id);
    }
  }
  return issues;
}
