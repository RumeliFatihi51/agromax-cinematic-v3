import { expect, test } from "@playwright/test";

test("NASA layers and catalog are separate from existing parcel analysis", async ({ page }) => {
  await page.route("**/api/platform/nasa/layers", route => route.fulfill({
    json: { latest: { smap: "2026-10-30" }, checkedAt: "2026-10-31T01:00:00Z" },
  }));
  await page.route("**/nasa-scenes?*", route => route.fulfill({ json: { scenes: [] } }));
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill("upgrade@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await page.goto("/#satellite");
  const sources = page.getByRole("table", { name: "Uydu kaynakları" });
  await expect(sources.getByRole("rowheader", { name: /ECOSTRESS · Yüzey sıcaklığı/ })).toBeVisible();
  await expect(sources.getByRole("rowheader", { name: /EMIT · Yüzey yansıtımı/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ek uydu gözlemleri" })).toHaveCount(0);
  await sources.getByRole("button", { name: /SMAP · Yüzey toprak nemi · İncele/ }).click();
  const nasa = page.getByRole("region", { name: "Ek uydu gözlemleri" });
  await expect(nasa.locator(".nasa-map")).toBeVisible();
  await expect(nasa.getByText("Bölgesel görsel katman.")).toBeVisible();
  await nasa.getByLabel("Karşılaştırma tarihi").fill("2026-10-22");
  await nasa.getByRole("button", { name: "Karşılaştırma tarihini göster" }).click();
  await expect(nasa.getByText(/Görüntü tarihi 2026-10-22/)).toBeVisible();
  await nasa.getByLabel("NASA ürünü").selectOption("nisar");
  await expect(nasa.getByText("Bu parseli kapsayan katalog kaydı bulunamadı.")).toBeVisible();
});
