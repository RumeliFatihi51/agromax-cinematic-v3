import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-webgl", "--enable-unsafe-swiftshader"] } });

test("open Sentinel COGs render for an authorized parcel without creating saved analysis records", async ({ page }, info) => {
  test.skip(process.env.AGROMAX_VERIFY_OPEN_SENTINEL !== "true", "Live public Earth Search and S3 opt-in.");
  test.setTimeout(100_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("E-posta adresiniz").fill(info.project.name + "@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  const created = await page.request.post("/api/records", { data: {
    kind: "field", name: "Açık uydu arşivi · izole test parseli",
    geometry: { type: "Polygon", coordinates: [[
      [27.153, 41.114], [27.155, 41.114], [27.155, 41.116], [27.153, 41.116], [27.153, 41.114],
    ]] },
  } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const archive = "/api/platform/fields/" + id + "/spatial";
  const context = await (await page.request.get(archive)).json();
  expect(context.observations).toEqual([]);
  expect((await page.request.get(archive + "/earth-search?month=2025-06&geometry=stale")).status()).toBe(409);
  const otherId = (info.project.name === "desktop" ? "b" : "a").repeat(32);
  expect((await page.request.get("/api/platform/fields/" + otherId +
    "/spatial/earth-search?month=2025-06&geometry=" + context.geometryHash)).status()).toBe(404);
  await page.goto("/#satellite?field=" + id);
  await page.reload();
  const satellite = page.locator('[data-spatial="satellite"]');
  await expect(page.getByLabel("Platform parseli")).toHaveValue(id);
  await satellite.getByRole("combobox", { name: "Veri kaynağı" }).selectOption("earth-search");
  await satellite.getByLabel("Arşiv ayı", { exact: true }).fill("2025-06");
  await satellite.getByRole("combobox", { name: "Gözlem tarihi" }).selectOption("2025-06-30");
  await expect(satellite.locator(".maplibregl-canvas")).toBeVisible();
  await expect(satellite.getByText("NDVI · Sentinel-2 L2A · Earth Search", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(satellite).toContainText("S2C_T35TNF_20250630T090706_L2A");
  await expect(satellite.getByLabel("Renk skalası")).toBeVisible();
  await satellite.getByText("Değer aralıklarına göre alan", { exact: true }).click();
  await expect(satellite.getByLabel("Geçerli alan dağılımı")).toBeVisible();
  await satellite.screenshot({ path: info.outputPath("live-ndvi.png") });
  await satellite.getByRole("combobox", { name: "Analiz katmanı" }).selectOption("WDRVI");
  await expect(satellite.getByText("WDRVI · Sentinel-2 L2A · Earth Search", { exact: true })).toBeVisible({ timeout: 30_000 });
  await satellite.getByRole("combobox", { name: "Gösterim" }).selectOption("columns");
  await expect(satellite.getByLabel("Renk skalası")).toContainText("Sütun yüksekliği indeks ölçeğidir");
  await expect(satellite.getByText("Sütun katmanı açılamadı.", { exact: false })).toHaveCount(0);
  await satellite.getByRole("combobox", { name: "Gösterim" }).selectOption("difference");
  await satellite.getByRole("combobox", { name: "Karşılaştırma tarihi" }).selectOption("2025-06-25");
  await expect(satellite.getByLabel("Renk skalası")).toContainText("Güncel − karşılaştırma", { timeout: 30_000 });
  expect((await (await page.request.get(archive)).json()).observations).toEqual([]);
});
