import { z } from "zod";
import { localDate } from "../../shared/contracts/commercial";
import { comparisonRange } from "../../server/satellite.js";
export const customRangeInput = z
  .object({ start: localDate, split: localDate, end: localDate })
  .strict()
  .refine(
    (v) =>
      v.start < v.split &&
      v.split <= v.end &&
      Date.parse(v.end) - Date.parse(v.start) <= 92 * 86400000,
    "İlk dönem bölme tarihinden önce olmalı; toplam aralık en fazla 93 gündür.",
  );
export function analysisWindow(input?: unknown, now = new Date()) {
  if (input === undefined)
    return {
      range: comparisonRange(now),
      scope: "calendar" as const,
      selectionKey: `calendar:${comparisonRange(now).from}/${comparisonRange(now).split}`,
    };
  const data = customRangeInput.parse(input);
  if (
    data.split > now.toISOString().slice(0, 10) ||
    data.end > now.toISOString().slice(0, 10)
  )
    throw new Error("Analiz tarihleri gelecekte olamaz.");
  return {
    scope: "custom" as const,
    selectionKey: JSON.stringify(data),
    range: {
      from: data.start + "T00:00:00Z",
      split: data.split + "T00:00:00Z",
      to: new Date(
        Math.min(Date.parse(data.end) + 86400000, now.getTime()),
      ).toISOString(),
      currentLabel: "Seçilen ikinci dönem",
      previousLabel: "Seçilen ilk dönem",
    },
  };
}
