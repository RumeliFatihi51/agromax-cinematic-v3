export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export async function api(path, body, method, { signal } = {}) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json().catch(() => {
    throw new ApiError("Sunucu geçerli bir yanıt döndürmedi.", 502);
  });
  if (!r.ok)
    throw new ApiError(
      typeof data.error === "string" ? data.error : "İstek tamamlanamadı.",
      r.status,
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
export async function requestAnalysis(fieldId, { signal, onJob } = {}) {
  const result = await api(`records/${fieldId}/analysis`, {}, "POST", {
    signal,
  });
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
