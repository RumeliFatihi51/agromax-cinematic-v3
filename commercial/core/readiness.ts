import { releaseGates } from "../db/schema";
import type { CommercialDb } from "../db/store";
export const requiredGates = {
  identity: "Hesap ve erişim güvenliği",
  data_quality: "Bağımsız uydu/veri doğrulaması",
  agronomy: "Ürün/bölge saha doğrulaması",
  payments: "Sağlayıcı ve ödeme doğrulaması",
  legal: "Şirket, mali ve veri koruma incelemesi",
  licenses: "Ticari veri/lisans erişimi",
  browser: "Mobil ve tarayıcı kabulü",
  capacity: "200 müşteri yük testi",
  budget: "100 USD bütçe testi",
  recovery: "Yedekten dönüş tatbikatı",
  support: "Destek ve olay müdahalesi",
} as const;
export async function readiness(db: CommercialDb) {
  const rows = await db.select().from(releaseGates);
  const gates = Object.entries(requiredGates).map(([key, name]) => {
    const row = rows.find((r) => r.key === key);
    const verified =
      row?.state === "verified" &&
      !!row.evidence &&
      Object.keys(row.evidence).length > 0 &&
      !!row.reviewedBy;
    return {
      key,
      name,
      state: verified
        ? "verified"
        : row?.state === "failed"
          ? "failed"
          : "not_verified",
      checkedAt: row?.checkedAt || null,
    };
  });
  return {
    salesEnabled:
      gates.every((g) => g.state === "verified") &&
      process.env.AGROMAX_SALES_ENABLED === "true",
    gates,
  };
}
