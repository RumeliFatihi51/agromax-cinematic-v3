import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import type { ReportSnapshot } from "./service";
import { metrics, observationAngles } from "../../shared/metrics.js";

export async function renderReport(
  snapshot: ReportSnapshot,
  options: { font?: Uint8Array; image?: Uint8Array } = {},
) {
  const font =
    options.font || (await readFile("public/fonts/Manrope-Report.ttf"));
  // PDFKit accepts a font Buffer at construction; @types/pdfkit still declares this option as string.
  // Supplying it immediately avoids loading package-relative Helvetica assets in server bundles.
  const document = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    font: Buffer.from(font) as unknown as string,
    info: {
      Title: `Agromax - ${snapshot.field.name}`,
      Author: "Agromax",
      CreationDate: new Date(snapshot.createdAt),
      ModDate: new Date(snapshot.createdAt),
    },
  });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const tr = snapshot.locale === "tr",
    t = (a: string, b: string) => (tr ? a : b);
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? new Intl.NumberFormat(tr ? "tr-TR" : "en-GB", {
          maximumFractionDigits: 5,
        }).format(value)
      : t("Veri yok", "No data");
  const text = (value: string, size = 10, color = "#334e46") =>
    document
      .fontSize(size)
      .fillColor(color)
      .text(value, { width: 503, lineGap: 4 });
  const heading = (title: string) => {
    if (document.y > 680) document.addPage();
    document.moveDown(0.7);
    text(title, 16, "#087d5a");
    document.moveDown(0.4);
  };
  const line = (value: string) => {
    if (document.y > 718) document.addPage();
    text(value);
    document.moveDown(0.3);
  };
  text("agromax.", 31, "#087d5a");
  text(
    t("PARSEL VE UYDU ANALİZ RAPORU", "PARCEL AND SATELLITE ANALYSIS REPORT"),
    10,
  );
  document.moveDown();
  text(snapshot.field.name, 22);
  text(snapshot.organizationName, 11);
  line(`${t("Rapor tarihi", "Report date")}: ${snapshot.createdAt}`);
  line(`${t("Kaynak", "Source")}: ${snapshot.analysis.source}`);
  line(
    `${t("Analiz / yöntem", "Analysis / method")}: ${snapshot.analysisId} / ${snapshot.analysis.method}`,
  );
  line(
    `${t("Geometri sürümü", "Geometry version")}: ${snapshot.geometryVersion}`,
  );
  line(
    `${t("Dönem", "Period")}: ${snapshot.analysis.range.from} - ${snapshot.analysis.range.to}`,
  );
  if (snapshot.field.area !== undefined)
    line(
      `${t("Kaydedilmiş parsel alanı (dekar)", "Recorded parcel area (decare)")}: ${number(snapshot.field.area)}`,
    );
  heading(t("Parsel sınırı", "Parcel boundary"));
  const geometry = snapshot.field.geometry;
  if (geometry) {
    const polygons =
      geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [geometry.coordinates as number[][][]];
    const points = polygons.flat(2),
      xs = points.map((p) => p[0]!),
      ys = points.map((p) => p[1]!);
    const west = Math.min(...xs),
      east = Math.max(...xs),
      south = Math.min(...ys),
      north = Math.max(...ys),
      latitude = (((north + south) / 2) * Math.PI) / 180;
    const spanX = (east - west) * Math.cos(latitude),
      spanY = north - south;
    const factor = Math.min(
        455 / Math.max(spanX, 1e-10),
        150 / Math.max(spanY, 1e-10),
      ),
      top = document.y,
      left = 60 + (455 - spanX * factor) / 2;
    document.save().strokeColor("#087d5a").fillColor("#d3f3df").lineWidth(1.3);
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach((p, i) => {
          const x = left + (p[0]! - west) * Math.cos(latitude) * factor,
            y = top + (north - p[1]!) * factor;
          if (i === 0) document.moveTo(x, y);
          else document.lineTo(x, y);
        });
        document.closePath();
      }
      document.fillAndStroke("even-odd");
    }
    document.restore();
    document.y = top + 170;
    text(
      t(
        "Analiz kaydının WGS84 parsel geometrisi; ölçekli kadastro belgesi değildir.",
        "WGS84 parcel geometry from the analysis record; not a cadastral survey.",
      ),
      8,
    );
  }
  if (options.image) {
    heading(t("Uydu görünümü", "Satellite view"));
    const top = document.y;
    document.image(Buffer.from(options.image), 46, top, {
      fit: [503, 210],
      align: "center",
    });
    document.y = top + 220;
  }
  heading(t("NDVI zaman serisi", "NDVI time series"));
  const series = snapshot.analysis.observations.filter(
    (o) => o.stats.NDVI && o.stats.NDVI.coverage >= 0.7,
  );
  if (series.length > 1) {
    const values = series.map((o) => o.stats.NDVI!.mean),
      min = Math.min(...values),
      max = Math.max(...values),
      top = document.y + 10;
    document
      .save()
      .strokeColor("#d8e6df")
      .moveTo(65, top)
      .lineTo(65, top + 100)
      .lineTo(545, top + 100)
      .stroke();
    document.strokeColor("#08976a").lineWidth(1.5);
    const firstTime = Date.parse(series[0]!.from),
      lastTime = Date.parse(series.at(-1)!.from);
    series.forEach((o, i) => {
      const x =
          65 +
          ((Date.parse(o.from) - firstTime) / (lastTime - firstTime)) * 480,
        y =
          top +
          100 -
          (max === min ? 0.5 : (o.stats.NDVI!.mean - min) / (max - min)) * 100;
      if (!i) document.moveTo(x, y);
      else document.lineTo(x, y);
    });
    document.stroke().restore();
    document.y = top + 108;
    text(
      `${number(min)} - ${number(max)} | ${series[0]!.from.slice(0, 10)} - ${series.at(-1)!.from.slice(0, 10)}`,
      8,
    );
  } else
    line(
      t(
        "Grafik için en az iki yeterli kapsamalı gözlem gerekiyor.",
        "At least two observations with sufficient coverage are required.",
      ),
    );
  document.addPage();
  heading(t("Gösterge karşılaştırması", "Metric comparison"));
  text(
    t(
      "Önceki dönem / güncel dönem / mutlak fark / birim",
      "Previous period / current period / absolute difference / unit",
    ),
    9,
  );
  for (const metric of [...metrics, ...observationAngles]) {
    const v = snapshot.analysis.comparison[metric.id];
    if (!v) continue;
    line(
      `${metric.id}: ${number(v.previous?.mean)} / ${number(v.current?.mean)} / ${number(v.delta)} / ${metric.unit}`,
    );
  }
  heading(t("Verinin sınırları", "Data limitations"));
  line(
    `${t("İşlem çözünürlüğü (m)", "Processing resolution (m)")}: ${number(snapshot.analysis.resolution)}`,
  );
  line(
    snapshot.analysis.mask ||
      t("Maske bilgisi kayıtlı değil.", "Mask metadata unavailable."),
  );
  line(
    snapshot.analysis.aggregation ||
      t(
        "Birleştirme yöntemi kayıtlı değil.",
        "Aggregation metadata unavailable.",
      ),
  );
  line(
    t(
      "Uydu indeksleri spektral hesaplamalardır; doğrudan toprak nemi, gübre dozu, hastalık teşhisi veya verim ölçümü değildir.",
      "Satellite indices are spectral calculations; they are not direct soil moisture, fertilizer dosage, disease diagnosis or yield measurements.",
    ),
  );
  heading(t("Saha ve uygulama kayıtları", "Field and application records"));
  if (!snapshot.records.length)
    line(
      t(
        "Rapor anında kayıt bulunmuyor.",
        "No records at the time of this snapshot.",
      ),
    );
  for (const record of snapshot.records) {
    line(
      `${record.kind} | ${record.id} | ${t("Sürüm", "Version")} ${record.version} | ${t("Kullanıcı beyanı", "User statement")}`,
    );
    const labels: Record<string, [string, string]> = {
      date: ["Tarih", "Date"],
      title: ["Açıklama", "Description"],
      category: ["Kategori", "Category"],
      currency: ["Para birimi", "Currency"],
      notes: ["Notlar", "Notes"],
      state: ["Durum", "State"],
      product: ["Ürün", "Product"],
      amountKg: ["Miktar (kg)", "Amount (kg)"],
      volumeM3: ["Su miktarı (m³)", "Water volume (m³)"],
      durationHours: ["Süre (saat)", "Duration (hours)"],
      method: ["Yöntem", "Method"],
      observation: ["Gözlem", "Observation"],
      amount: ["Miktar", "Amount"],
      unit: ["Birim", "Unit"],
      labelReference: ["Etiket kaynağı", "Label reference"],
      name: ["Ad", "Name"],
      crop: ["Ürün", "Crop"],
      cropName: ["Ürün adı", "Crop name"],
      sowingDate: ["Ekim tarihi", "Sowing date"],
      harvestDate: ["Hasat tarihi", "Harvest date"],
      countryCode: ["Ülke", "Country"],
      labName: ["Laboratuvar", "Laboratory"],
      reportDate: ["Rapor tarihi", "Report date"],
      samplingDepthCm: ["Örnek derinliği (cm)", "Sample depth (cm)"],
      measurements: ["Ölçümler", "Measurements"],
      conclusion: ["Değerlendirme", "Evaluation"],
      nitrogenPercent: ["Azot (%)", "Nitrogen (%)"],
      phosphorusPercent: ["Fosfor (%)", "Phosphorus (%)"],
      potassiumPercent: ["Potasyum (%)", "Potassium (%)"],
    };
    if (
      typeof record.data.amountMinor === "number" &&
      typeof record.data.currency === "string"
    )
      line(
        `${t("Tutar", "Amount")}: ${new Intl.NumberFormat(tr ? "tr-TR" : "en-GB", { style: "currency", currency: record.data.currency }).format(record.data.amountMinor / 100)}`,
      );
    for (const [key, value] of Object.entries(record.data))
      if (labels[key] && value !== "")
        line(
          `${t(...labels[key]!)}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? t("Veri yok", "No data"))}`,
        );
  }
  const pages = document.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    document.switchToPage(i);
    document
      .fontSize(8)
      .fillColor("#70857c")
      .text(
        `agromax.  |  ${snapshot.analysis.method}  |  ${i + 1} / ${pages.count}`,
        46,
        796,
        { lineBreak: false },
      );
  }
  document.end();
  return result;
}
