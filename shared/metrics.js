// Reflectance inputs, not digital numbers. NDWI means McFeeters here; NDMI means Gao.
// Method references and collection limits: docs/SATELLITE.md.
const metric = (id, label, group, formula, description, resolution = 20) => ({
  id,
  label,
  group,
  formula,
  description,
  resolution,
  bands: [
    ...new Set([...formula.matchAll(/s\.([A-Za-z0-9]+)/g)].map((m) => m[1])),
  ],
  unit:
    group === "Gözlem geometrisi" ? "derece" : id === "WVP" ? "cm" : "birimsiz",
});
export const indices = [
  metric(
    "NDVI",
    "Bitki canlılığı",
    "Bitki gelişimi",
    "(s.B08-s.B04)/(s.B08+s.B04)",
    "Yeşil bitki örtüsünün spektral göstergesi; doğrudan sağlık teşhisi değildir.",
    10,
  ),
  metric(
    "GNDVI",
    "Yeşil NDVI",
    "Bitki gelişimi",
    "(s.B08-s.B03)/(s.B08+s.B03)",
    "Yeşil ve yakın kızılötesi bantların farkı.",
    10,
  ),
  metric(
    "EVI",
    "Geliştirilmiş bitki indeksi",
    "Bitki gelişimi",
    "2.5*(s.B08-s.B04)/(s.B08+6*s.B04-7.5*s.B02+1)",
    "Arka plan ve atmosfer etkilerine yönelik düzeltme içeren gösterge.",
    10,
  ),
  metric(
    "EVI2",
    "İki bantlı EVI",
    "Bitki gelişimi",
    "2.5*(s.B08-s.B04)/(s.B08+2.4*s.B04+1)",
    "Mavi bant olmadan iki bantlı bitki indeksi.",
    10,
  ),
  metric(
    "SAVI",
    "Toprak ayarlı bitki indeksi",
    "Toprak ve örtü",
    "1.5*(s.B08-s.B04)/(s.B08+s.B04+0.5)",
    "L=0,5 sabitiyle hesaplanır; ürün ve örtüye göre yorum gerekir.",
    10,
  ),
  metric(
    "MSAVI2",
    "Değiştirilmiş SAVI",
    "Toprak ve örtü",
    "(2*s.B08+1-Math.sqrt(Math.pow(2*s.B08+1,2)-8*(s.B08-s.B04)))/2",
    "Seyrek örtüde toprak arka plan etkisini azaltmayı amaçlar.",
    10,
  ),
  metric(
    "OSAVI",
    "Optimize SAVI",
    "Toprak ve örtü",
    "1.16*(s.B08-s.B04)/(s.B08+s.B04+0.16)",
    "0,16 toprak düzeltme sabiti kullanır.",
    10,
  ),
  metric(
    "NDRE",
    "Kırmızı kenar indeksi",
    "Klorofil göstergeleri",
    "(s.B8A-s.B05)/(s.B8A+s.B05)",
    "B8A ve B05 ile kırmızı kenar farkı; doğrudan azot miktarı değildir.",
  ),
  metric(
    "NDRE2",
    "Kırmızı kenar B06",
    "Klorofil göstergeleri",
    "(s.B8A-s.B06)/(s.B8A+s.B06)",
    "B8A ve B06 bantlarıyla NDRE varyantı.",
  ),
  metric(
    "NDRE3",
    "Kırmızı kenar B07",
    "Klorofil göstergeleri",
    "(s.B8A-s.B07)/(s.B8A+s.B07)",
    "B8A ve B07 bantlarıyla NDRE varyantı.",
  ),
  metric(
    "GCI",
    "Yeşil klorofil indeksi",
    "Klorofil göstergeleri",
    "s.B08/s.B03-1",
    "Klorofille ilişkili spektral gösterge; laboratuvar ölçümü değildir.",
    10,
  ),
  metric(
    "RECI",
    "Kırmızı kenar klorofil indeksi",
    "Klorofil göstergeleri",
    "s.B8A/s.B05-1",
    "Kırmızı kenar ve NIR oranı; bitki besleme reçetesi üretmez.",
  ),
  metric(
    "NDMI",
    "Nem göstergesi",
    "Su ve nem",
    "(s.B08-s.B11)/(s.B08+s.B11)",
    "Örtünün su içeriğiyle ilişkili gösterge; toprak nem yüzdesi değildir.",
  ),
  metric(
    "NDWI",
    "Yüzey suyu göstergesi",
    "Su ve nem",
    "(s.B03-s.B08)/(s.B03+s.B08)",
    "McFeeters tanımı: yeşil ve NIR. NDMI ile aynı gösterge değildir.",
    10,
  ),
  metric(
    "MNDWI",
    "Değiştirilmiş su indeksi",
    "Su ve nem",
    "(s.B03-s.B11)/(s.B03+s.B11)",
    "Yeşil ve SWIR1 bantlarıyla yüzey suyu göstergesi.",
  ),
  metric(
    "NBR",
    "NIR / SWIR2 farkı",
    "Yüzey değişimi",
    "(s.B08-s.B12)/(s.B08+s.B12)",
    "Yanık alan çalışmalarında kullanılır; tek başına hasar tespiti değildir.",
  ),
  metric(
    "NBR2",
    "SWIR fark indeksi",
    "Yüzey değişimi",
    "(s.B11-s.B12)/(s.B11+s.B12)",
    "İki SWIR bandının normalize farkı.",
  ),
  metric(
    "NDSI",
    "Kar göstergesi",
    "Yüzey değişimi",
    "(s.B03-s.B11)/(s.B03+s.B11)",
    "MNDWI ile aynı bant formülü; yorum ve maske amacı farklıdır. Bu analizde kar pikselleri dışlanır.",
  ),
  metric(
    "BSI",
    "Çıplak toprak indeksi",
    "Toprak ve örtü",
    "((s.B11+s.B04)-(s.B08+s.B02))/((s.B11+s.B04)+(s.B08+s.B02))",
    "Çıplak yüzeyin spektral göstergesi; toprak bileşimi ölçümü değildir.",
  ),
  metric(
    "PSRI",
    "Yaşlanma göstergesi",
    "Bitki gelişimi",
    "(s.B04-s.B02)/s.B06",
    "Pigment değişimine yönelik gösterge; fenoloji ve saha kontrolüyle yorumlanır.",
  ),
  metric(
    "SIPI",
    "Pigment oran göstergesi",
    "Klorofil göstergeleri",
    "(s.B08-s.B02)/(s.B08-s.B04)",
    "Pigmentlerle ilişkili oran; düşük paydalarda kararsız olabilir.",
    10,
  ),
  metric(
    "ARVI",
    "Atmosfer dirençli bitki indeksi",
    "Bitki gelişimi",
    "(s.B08-(2*s.B04-s.B02))/(s.B08+(2*s.B04-s.B02))",
    "Mavi bantla atmosferik düzeltme terimi içerir.",
    10,
  ),
  metric(
    "VARI",
    "Görünür bant bitki indeksi",
    "Bitki gelişimi",
    "(s.B03-s.B04)/(s.B03+s.B04-s.B02)",
    "Yalnızca görünür bantları kullanır; NIR tabanlı ölçümün yerini almaz.",
    10,
  ),
];
export const bands = [
  "B01",
  "B02",
  "B03",
  "B04",
  "B05",
  "B06",
  "B07",
  "B08",
  "B8A",
  "B09",
  "B11",
  "B12",
].map((id) =>
  metric(
    id,
    "Yüzey yansıtımı",
    "Spektral bantlar",
    `s.${id}`,
    "Atmosferik düzeltmeli L2A yüzey yansıtımı; birimsiz.",
    ["B01", "B09"].includes(id)
      ? 60
      : ["B02", "B03", "B04", "B08"].includes(id)
        ? 10
        : 20,
  ),
);
export const ancillary = [
  metric(
    "AOT",
    "Aerosol optik kalınlığı",
    "Atmosfer",
    "s.AOT",
    "Atmosferik yardımcı veri, bitki indeksi değildir.",
    10,
  ),
  metric(
    "WVP",
    "Su buharı sütunu",
    "Atmosfer",
    "s.WVP",
    "Santimetre su eşdeğeri; bitki su ihtiyacı değildir.",
    10,
  ),
];
export const metrics = [...indices, ...bands, ...ancillary];
export const qualityBands = ["SCL", "CLD", "SNW", "CLP", "CLM", "dataMask"];
export const observationAngles = [
  ["sunAzimuthAngles", "Güneş azimut açısı"],
  ["sunZenithAngles", "Güneş zenit açısı"],
  ["viewAzimuthMean", "Ortalama bakış azimut açısı"],
  ["viewZenithMean", "Ortalama bakış zenit açısı"],
].map(([id, label]) =>
  metric(
    id,
    label,
    "Gözlem geometrisi",
    `s.${id}`,
    "Sağlayıcının derece cinsinden gözlem açısı; bitki indeksi değildir.",
    5000,
  ),
);
// Provider-specific availability is explicit. An unsupported product is never
// replaced by a different band (B09 is not a water vapour column measurement).
export function availableMetrics(provider = "cdse") {
  return [
    ...metrics.filter((m) => provider !== "cdse" || m.id !== "WVP"),
    ...observationAngles,
  ];
}
export function availableQualityBands(provider = "cdse") {
  return qualityBands.filter(
    (id) => provider !== "cdse" || !["CLP", "CLM"].includes(id),
  );
}
export function metricAvailability(id, provider = "cdse") {
  return provider === "cdse" && id === "WVP"
    ? "Copernicus Data Space Sentinel-2 L2A bu ürün katmanını sunmuyor."
    : null;
}
export const unavailable = [
  [
    "Sentinel-1 SAR",
    "VV/VH, radar değişimi",
    "Ayrı SAR işleme ve doğrulama gerekli; optik paket içermez.",
  ],
  [
    "Termal yüzey sıcaklığı",
    "Landsat 8/9 veya uygun termal kaynak",
    "Sentinel-2 termal bant taşımaz.",
  ],
  [
    "Toprak nemi, ET0, su ihtiyacı",
    "Meteoroloji + sensör/model",
    "NDMI doğrudan toprak nemi ya da sulama miktarı değildir.",
  ],
  [
    "Hastalık, verim, gübre reçetesi",
    "Ürün bilgisi + saha doğrulaması",
    "Spektral göstergeler tek başına teşhis veya reçete üretemez.",
  ],
];
