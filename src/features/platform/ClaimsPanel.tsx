import { useEffect, useState } from "react";
import { api } from "../../api";
import type { ClaimEvidence } from "../../../commercial/intelligence/claims";

type Claims = {
  claims: { id: string; analysisId: string; metric: string; geometryVersion: string; evidence: ClaimEvidence }[];
  investigations: { id: string; data: { claimId: string; metric: string; state: string; checks: string[] } }[];
  geometryVersion: string;
};
const warnings = {
  period_lengths_differ: "Dönem süreleri farklı",
  observation_counts_differ: "Gözlem sayıları farklı",
  limited_observations: "En az bir dönemde üçten az geçerli gözlem var",
};
const number = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

export default function ClaimsPanel({ fieldId, page, canWrite }: { fieldId: string; page: string; canWrite: boolean }) {
  const path = `v1/fields/${fieldId}/claims`;
  const [data, setData] = useState<Claims | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api(path, undefined, "GET", { signal: controller.signal })
      .then(setData)
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [path]);

  async function investigate(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`${path}/${id}/investigation`, {});
      setData(await api(path));
      setNotice("Kanıta bağlı saha inceleme taslağı kaydedildi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "İnceleme kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  const investigations = data?.investigations ?? [];
  const claims = data?.claims.filter((claim) =>
    page !== "contradictions" || claim.evidence.warnings.length || claim.geometryVersion !== data.geometryVersion,
  ) ?? [];
  return (
    <section className="px-surface px-section">
      <h2>{page === "investigation" ? "Kanıta bağlı incelemeler" : page === "contradictions" ? "Karşılaştırma uyarıları" : "Kaynaklı gözlem iddiaları"}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Kanıtlar yükleniyor…</p>}
      {page === "investigation" ? (
        <>{data && !investigations.length && <p>Henüz bir gözlem iddiasına bağlı inceleme yok.</p>}
          {investigations.map(({ id, data: draft }) => <article className="business-fact" key={id}>
            <h3>{draft.metric} · Taslak</h3>
            <p>İddia {draft.claimId}</p>
            <ul>{draft.checks.map((check) => <li key={check}>{check}</li>)}</ul>
          </article>)}</>
      ) : (
        <>{data && !claims.length && <p>{page === "contradictions" ? "Karşılaştırma uyarısı bulunamadı." : "Yeni uydu analizinde iki geçerli dönem varsa gözlem iddiası burada görünür."}</p>}
          {claims.map(({ id, metric, analysisId, geometryVersion, evidence }) => (
            <details className="business-fact" key={id}>
              <summary>{metric} · Dönem farkı {number(evidence.delta)}</summary>
              <p>{evidence.source} · {evidence.measurementMethod}</p>
              <p>{evidence.range.from.slice(0, 10)} → {evidence.range.split.slice(0, 10)} → {evidence.range.to.slice(0, 10)}</p>
              <p>Önceki {number(evidence.previous.mean)} ({evidence.previous.observations} gözlem) · Sonraki {number(evidence.current.mean)} ({evidence.current.observations} gözlem)</p>
              <p>Analiz {analysisId} · Sınır {geometryVersion.slice(0, 16)}</p>
              {geometryVersion !== data?.geometryVersion && <p>Önceki parsel sınırı</p>}
              {evidence.warnings.length > 0 && <ul>{evidence.warnings.map((warning) => <li key={warning}>{warnings[warning]}</li>)}</ul>}
              {evidence.anomaly && <p>
                Son geçerli gözlem önceki dönemin medyanından sapıyor. MAD puanı {number(evidence.anomaly.score)} · {evidence.anomaly.baselineCount} referans gözlem.
              </p>}
              <p>Gözlemsel değişim. Müdahale etkisi ayrı saha doğrulaması gerektirir.</p>
              {canWrite && (investigations.some((row) => row.data.claimId === id)
                ? <p>Bu iddia için inceleme taslağı kayıtlı.</p>
                : <button type="button" className="secondary" disabled={busy} onClick={() => investigate(id)}>Saha inceleme taslağı oluştur</button>)}
            </details>
          ))}</>
      )}
    </section>
  );
}
