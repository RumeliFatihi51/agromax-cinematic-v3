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
  const [selectedId, setSelectedId] = useState("");
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
  const selected = claims.find((claim) => claim.id === selectedId) || claims[0];
  return (
    <section className="px-surface px-section claim-workbench" data-claim-view={page}>
      <h2>{page === "investigation" ? "Kanıta bağlı incelemeler" : page === "contradictions" ? "Karşılaştırma uyarıları" : "Kaynaklı gözlem iddiaları"}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Kanıtlar yükleniyor…</p>}
      {page === "investigation" ? (
        <>{data && !investigations.length && <p>Henüz bir gözlem iddiasına bağlı inceleme yok.</p>}
          {investigations.map(({ id, data: draft }) => <article className="business-fact claim-investigation" key={id}>
            <h3>{draft.metric} · Taslak</h3>
            <p>İddia {draft.claimId}</p>
            <ol>{draft.checks.map((check) => <li key={check}>{check}</li>)}</ol>
          </article>)}</>
      ) : (
        <>{data && !claims.length && <p>{page === "contradictions" ? "Karşılaştırma uyarısı bulunamadı." : "Yeni uydu analizinde iki geçerli dönem varsa gözlem iddiası burada görünür."}</p>}
          {selected && <div className="claim-split">
            <ul className="claim-index" aria-label="Gözlem iddiaları">
              {claims.map(({ id, metric, evidence }) => (
                <li key={id}><button type="button" aria-pressed={id === selected.id} onClick={() => setSelectedId(id)}>
                  <strong>{metric} · Dönem farkı {number(evidence.delta)}</strong>
                  <span>{evidence.range.to.slice(0, 10)} · {evidence.warnings.length} uyarı</span>
                </button></li>
              ))}
            </ul>
            <article className="claim-source" key={selected.id} aria-label="Seçili iddianın kaynağı">
              <h3>{selected.metric} · Ölçüm ve kaynak</h3>
              <p>{selected.evidence.source} · {selected.evidence.measurementMethod}</p>
              <div className="claim-periods">
                <div><small>Önceki dönem</small><strong>{number(selected.evidence.previous.mean)}</strong>
                  <span>{selected.evidence.range.from.slice(0, 10)} – {selected.evidence.range.split.slice(0, 10)} · {selected.evidence.previous.observations} gözlem</span></div>
                <div><small>Güncel dönem</small><strong>{number(selected.evidence.current.mean)}</strong>
                  <span>{selected.evidence.range.split.slice(0, 10)} – {selected.evidence.range.to.slice(0, 10)} · {selected.evidence.current.observations} gözlem</span></div>
              </div>
              <p>Analiz <code title={selected.analysisId}>{selected.analysisId.slice(0, 8)}</code> · Sınır <code title={selected.geometryVersion}>{selected.geometryVersion.slice(0, 16)}</code></p>
              {selected.geometryVersion !== data?.geometryVersion && <p className="claim-warning">Önceki parsel sınırı</p>}
              {selected.evidence.warnings.length > 0 && <ul>{selected.evidence.warnings.map((warning) => <li key={warning}>{warnings[warning]}</li>)}</ul>}
              {selected.evidence.anomaly && <p>Son geçerli gözlem önceki dönemin medyanından sapıyor. MAD puanı {number(selected.evidence.anomaly.score)} · {selected.evidence.anomaly.baselineCount} referans gözlem.</p>}
              <p>Gözlemsel değişim. Müdahale etkisi ayrı saha doğrulaması gerektirir.</p>
              {canWrite && (investigations.some((row) => row.data.claimId === selected.id)
                ? <p>Bu iddia için inceleme taslağı kayıtlı.</p>
                : <button type="button" className="secondary" disabled={busy} onClick={() => investigate(selected.id)}>Saha inceleme taslağı oluştur</button>)}
            </article>
          </div>}</>
      )}
    </section>
  );
}
