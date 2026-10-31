const DAY = 86400000;
const error = (message) => Object.assign(new Error(message), { status: 502 });

// The provider's response-size ceiling varies with the actual observations.
// Split only a confirmed size error; retain every output and the original daily
// grid. Never hide auth, quota, or other upstream errors by retrying them.
export async function boundedStatistics(
  request,
  body,
  { signal, budget = { requests: 0, maximum: 128 } } = {},
) {
  signal?.throwIfAborted();
  if (budget.requests >= budget.maximum)
    throw error(
      "Uydu analizinin servis istek sınırı aşıldı. Kısmi sonuç kaydedilmedi.",
    );
  budget.requests++;
  try {
    return await request(body);
  } catch (e) {
    const sizeError =
      e.providerStatus === 400 &&
      /calculation results are too large/i.test(e.providerDetail || "");
    if (!sizeError) throw e;
    const range = body.aggregation.timeRange;
    const from = Date.parse(range.from),
      to = Date.parse(range.to),
      days = Math.ceil((to - from) / DAY);
    if (!Number.isFinite(from) || !Number.isFinite(to) || days <= 1)
      throw error(
        "Uydu sağlayıcısı tek günlük hesaplamayı da boyut sınırı nedeniyle tamamlayamadı. Eksik sonuç kaydedilmedi.",
      );
    const split = new Date(from + Math.floor(days / 2) * DAY).toISOString();
    const part = (start, end) => ({
      ...body,
      aggregation: { ...body.aggregation, timeRange: { from: start, to: end } },
    });
    const left = await boundedStatistics(request, part(range.from, split), {
      signal,
      budget,
    });
    const right = await boundedStatistics(request, part(split, range.to), {
      signal,
      budget,
    });
    if (
      left.status !== "OK" ||
      right.status !== "OK" ||
      !Array.isArray(left.data) ||
      !Array.isArray(right.data)
    )
      throw error(
        "Bölünmüş uydu isteği eksik yanıt döndürdü. Kısmi sonuç kaydedilmedi.",
      );
    return { status: "OK", data: [...left.data, ...right.data] };
  }
}
