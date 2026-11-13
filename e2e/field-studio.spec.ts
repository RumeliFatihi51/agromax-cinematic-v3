import { expect, test } from "@playwright/test";
import { indices as availableIndexDefinitions } from "../shared/metrics.js";

test.use({ launchOptions: { args: ["--enable-webgl", "--enable-unsafe-swiftshader"] } });

test("signature studio keeps indices, tasks and atlas navigation on the real parcel", async ({ page }, info) => {
  test.setTimeout(85_000);
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  const esri: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().includes("arcgisonline.com")) esri.push(request.url()); });
  await page.goto("/");
  await page.getByLabel("E-posta adresiniz").fill("upgrade@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();

  const id = "e".repeat(32);
  const neighboringName = "Kuzey tarlası " + info.project.name;
  const neighborResponse = await page.request.post("/api/records", { data: {
    kind: "field", name: neighboringName, crop: "Buğday",
    geometry: { type: "Polygon", coordinates: [[
      [27.504, 38.501], [27.505, 38.501], [27.505, 38.502], [27.504, 38.502], [27.504, 38.501],
    ]] },
  } });
  expect(neighborResponse.status()).toBe(201);
  const { id: neighborId } = await neighborResponse.json();
  await page.route("**/api/platform/fields/" + neighborId + "/spatial", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, observations: [
      { date: "2026-10-31", provider: "cdse", method: "s2-l2a-v3", metrics: { NDVI: 0.51, NDMI: 0.13 }, source: "EXPLICIT SYNTHETIC COMPARISON FIXTURE" },
      { date: "2026-10-28", provider: "sentinelhub", method: "s2-l2a-v3", metrics: { NDVI: 0.7 }, source: "EXPLICIT SYNTHETIC COMPARISON FIXTURE" },
    ] } });
  });
  await page.goto("/#field-studio");
  await page.reload();
  const preview = page.getByRole("region", { name: "3D Saha Stüdyosu" });
  await expect(preview.getByText("Örnek panorama · Gösterim verisi")).toBeVisible();
  await expect(preview.locator(".scene-card")).toHaveCount(5);
  await expect(preview.getByRole("button", { name: "Örnek indeks parselleri" })).toHaveCount(1);
  await preview.screenshot({ path: info.outputPath("studio-reference.png"), animations: "disabled" });
  await preview.getByRole("button", { name: "Sonraki büyüme evresi" }).click();
  await expect(preview.getByText("Sapa kalkma", { exact: true })).toBeVisible();
  const total = preview.locator('[data-slot="zones"] .scene-zone-labels').last();
  const initialTotal = await total.textContent();
  await preview.getByRole("spinbutton", { name: "Yüksek canlılık oranı" }).fill("99");
  await expect(total).not.toHaveText(initialTotal || "");
  await preview.getByRole("button", { name: "Önce görünümüne geç" }).click();
  await expect(preview.locator(".scene-reference")).toHaveAttribute("data-before", "true");
  await preview.getByRole("button", { name: "Canlı parsellerim" }).click();
  const studio = page.getByRole("region", { name: "3D Saha Stüdyosu" });
  await expect(studio.locator(".maplibregl-canvas")).toBeVisible({ timeout: 18000 });
  const parcels = studio.getByLabel("Saha stüdyosu parseli");
  await parcels.selectOption(id);
  await expect(parcels).toHaveValue(id);
  const canvas = await studio.locator(".maplibregl-canvas").elementHandle();
  await studio.getByRole("button", { name: "Parsel çevresini göster" }).click();
  const neighbor = studio.getByRole("button", { name: neighboringName + " parselini aç" });
  await expect(neighbor).toBeVisible();
  await studio.getByRole("button", { name: "Parselleri kıyasla" }).click();
  await expect(neighbor).toContainText("NDVI 0,51");
  await studio.getByRole("combobox", { name: "Karşılaştırma indeksi" }).selectOption("NDMI");
  await expect(neighbor).toContainText("NDMI 0,13");
  await studio.getByRole("combobox", { name: "Parsel karşılaştırma tarihi" }).selectOption("2026-10-28");
  await expect(neighbor).toContainText("Eşleşen ölçüm yok");
  await studio.getByRole("combobox", { name: "Parsel karşılaştırma tarihi" }).selectOption("2026-10-31");
  await studio.getByRole("combobox", { name: "Karşılaştırma indeksi" }).selectOption("NDVI");
  await expect(neighbor).toContainText("NDVI 0,51");
  await studio.screenshot({ path: info.outputPath("studio-landscape.png"), animations: "disabled" });
  await neighbor.click();
  await expect(parcels).toHaveValue(neighborId);
  expect(await studio.locator(".maplibregl-canvas").evaluate((element, original) => element === original, canvas)).toBe(true);
  await parcels.selectOption(id);
  await studio.getByRole("button", { name: "İndeks yüzeyi", exact: true }).click();
  const indices = studio.getByLabel("İndeks", { exact: true });
  await expect(indices).toHaveValue("NDVI");
  await expect(indices.locator("optgroup").first().locator("option")).toHaveCount(availableIndexDefinitions.length);
  const ndmi = page.waitForResponse(response => response.url().endsWith("/image") &&
    response.request().method() === "POST" && response.request().postDataJSON().layer === "NDMI");
  await indices.selectOption("NDMI");
  expect((await ndmi).ok()).toBe(true);
  await expect(studio.locator(".field-studio-legend")).toBeVisible();
  await studio.getByRole("button", { name: "3D sütun", exact: true }).click();
  await expect(studio.getByText("Sütun yüksekliği indeks ölçeğini gösterir.")).toBeVisible();
  await studio.getByRole("button", { name: "Değer", exact: true }).click();
  await expect(studio.getByRole("complementary", { name: "İndeks ve nokta okuması" })).toContainText("NDMI");
  await studio.getByRole("button", { name: "Paneli kapat" }).click();
  await studio.getByRole("button", { name: "Tarih farkı", exact: true }).click();
  await expect(studio.getByRole("complementary", { name: "Tarihler arası değişim" })).toContainText("Parsel ortalaması farkı");
  await studio.getByRole("button", { name: "Paneli kapat" }).click();
  await studio.getByRole("button", { name: "Görev", exact: true }).click();
  await studio.getByRole("button", { name: "Görev oluştur" }).click();
  const task = page.getByRole("dialog");
  await expect(task.getByLabel("Parsel (isteğe bağlı)")).toHaveValue(id);
  await task.getByLabel("Görev adı").fill("3D saha kontrolü " + info.project.name);
  await task.getByLabel("Planlanan tarih").fill("2026-11-13");
  await task.getByRole("button", { name: "Görevi planla" }).click();
  await expect(studio.getByRole("complementary", { name: "Saha faaliyetleri" }).getByText("3D saha kontrolü " + info.project.name)).toBeVisible();
  await studio.getByRole("button", { name: "Paneli kapat" }).click();
  await studio.getByRole("button", { name: "Doğal renk", exact: true }).click();
  await expect(studio.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await studio.screenshot({ path: info.outputPath("studio.png"), animations: "disabled" });

  await page.goto("/#platform?field=" + id);
  const atlas = page.getByRole("region", { name: "Üç boyutlu arazi atlası" });
  await expect(atlas.locator(".maplibregl-canvas")).toBeVisible();
  await atlas.getByRole("button", { name: "3D Saha Stüdyosu" }).click();
  await expect(studio.locator(".maplibregl-canvas")).toBeVisible();
  expect(esri).toEqual([]);
  expect(errors).toEqual([]);
});
