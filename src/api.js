export class ApiError extends Error {
  constructor(message, status, code = undefined, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
let organizationId = "";
export function setOrganizationId(value) {
  organizationId = value || "";
}
export async function fetchAnalysisImage(fieldId, { date, layer, analysisId, signal }) {
  const response = await fetch("/api/records/" + encodeURIComponent(fieldId) + "/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(organizationId ? { "X-Organization-ID": organizationId } : {}),
    },
    body: JSON.stringify({ date, layer, analysisId }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.error || "Uydu katmanı alınamadı.", response.status);
  }
  const blob = await response.blob();
  signal?.throwIfAborted();
  const bounds = JSON.parse(response.headers.get("X-Image-Bounds"));
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
    throw new ApiError("Uydu katmanının sınırları doğrulanamadı.", 502);
  return {
    bounds, date, layer,
    legend: JSON.parse(decodeURIComponent(response.headers.get("X-Image-Legend") || "null")),
    validPixels: Number(response.headers.get("X-Valid-Pixels")),
    totalPixels: Number(response.headers.get("X-Total-Pixels")),
    interval: JSON.parse(response.headers.get("X-Image-Interval") || "null"),
    url: URL.createObjectURL(blob),
  };
}
/** @param {string} path @param {any} [body] @param {string} [method] @param {{ signal?: AbortSignal, headers?: Record<string,string> }} [options] */
export async function api(path, body, method, { signal, headers = {} } = {}) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(organizationId ? { "X-Organization-ID": organizationId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json().catch(() => {
    throw new ApiError("Sunucu geçerli bir yanıt döndürmedi.", 502);
  });
  if (!r.ok)
    throw new ApiError(
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "İstek tamamlanamadı.",
      r.status,
      data.code,
      data.details,
    );
  return data;
}

function pause(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(
        signal.reason || new DOMException("İstek iptal edildi.", "AbortError"),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 1500);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
/** @param {string} fieldId @param {{signal?:AbortSignal,onJob?:(job:any)=>void,range?:{start:string,split:string,end:string}}} [options] */
export async function requestAnalysis(fieldId, { signal, onJob, range } = {}) {
  const result = await api(
    `records/${fieldId}/analysis`,
    range ? { range } : {},
    "POST",
    {
      signal,
    },
  );
  if (result.analysis) return result;
  let job = result.job;
  if (!job?.id) throw new ApiError("Analiz işlem kaydı alınamadı.", 502);
  onJob?.(job);
  while (["queued", "running"].includes(job.state)) {
    await pause(signal);
    job = (await api(`analyses/${job.id}`, undefined, "GET", { signal })).job;
    if (!job?.state) throw new ApiError("Analiz işlem durumu alınamadı.", 502);
    onJob?.(job);
  }
  if (job.state !== "completed" || !job.analysis)
    throw new ApiError(
      job.error ||
        (job.state === "canceled"
          ? "Analiz iptal edildi."
          : "Analiz tamamlanamadı."),
      422,
    );
  return { analysis: job.analysis, status: result.status, job };
}
