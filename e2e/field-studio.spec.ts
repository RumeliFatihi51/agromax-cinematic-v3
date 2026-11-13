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
  await expect(preview.locator(".maplibregl-canvas")).toBeVisible({ timeout: 18000 });
  await expect(preview.locator(".scene-live")).toHaveAttribute("data-camera-pitch", info.project.name === "mobile" ? "69" : "76");
  await expect(preview.getByText("Örnek panorama · Gösterim verisi")).toHaveCount(0);
  const liveMap = preview.locator(".spatial-map");
  if (process.env.AGROMAX_VERIFY_MAPBOX === "true") {
    await expect(liveMap).toHaveAttribute("data-basemap", "mapbox");
    await expect(liveMap).toHaveAttribute("data-basemap-loaded", "true", { timeout: 18000 });
    await expect(preview.getByText("Mapbox Satellite", { exact: true })).toBeVisible();
  }
  if (info.project.name === "mobile") await preview.getByRole("button", { name: "Katmanlar ve saha verisi" }).click();
  await preview.getByRole("button", { name: "Kaynaklar", exact: true }).click();
  await preview.getByRole("button", { name: "Örnek panorama", exact: true }).click();
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
  if (info.project.name === "mobile") await studio.getByRole("button", { name: "Katmanlar ve saha verisi" }).click();
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

test("Mapbox Satellite shows a real agricultural area in the Field Studio", async ({ page }, info) => {
  test.skip(process.env.AGROMAX_VERIFY_MAPBOX !== "true", "Live Mapbox token opt-in.");
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("E-posta adresiniz").fill(info.project.name + "@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  const response = await page.request.post("/api/records", { data: {
    kind: "field", name: "Trakya · harita doğrulama parseli",
    geometry: { type: "Polygon", coordinates: [[
      [27.153, 41.114], [27.155, 41.114], [27.155, 41.116], [27.153, 41.116], [27.153, 41.114],
    ]] },
  } });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  const nearby = await page.request.post("/api/records", { data: {
    kind: "field", name: "Trakya · komşu parsel",
    geometry: { type: "Polygon", coordinates: [[
      [27.156, 41.115], [27.158, 41.115], [27.158, 41.117], [27.156, 41.117], [27.156, 41.115],
    ]] },
  } });
  expect(nearby.status()).toBe(201);
  const tile = page.waitForResponse(result => result.ok() &&
    new URL(result.url()).pathname.startsWith("/styles/v1/mapbox/satellite-v9/tiles/512/"));
  await page.goto("/#field-studio?field=" + id);
  await page.reload();
  const studio = page.getByRole("region", { name: "3D Saha Stüdyosu" });
  await expect(studio.getByLabel("Saha stüdyosu parseli")).toHaveValue(id);
  const map = studio.locator('[data-basemap="mapbox"][data-basemap-loaded="true"]');
  await expect(map.locator(".maplibregl-canvas")).toBeVisible({ timeout: 18000 });
  expect((await tile).headers()["content-type"]).toContain("image/jpeg");
  await expect(studio.getByText("Mapbox Satellite", { exact: true })).toBeVisible();
  const scene = studio.locator(".scene-live");
  await expect(scene).toHaveAttribute("data-camera-pitch", info.project.name === "mobile" ? "69" : "76");
  const size = await scene.boundingBox();
  if (info.project.name === "desktop") expect(size!.width / size!.height).toBeGreaterThan(1.7);
  else await expect(studio.getByRole("group", { name: "Saha verisi" })).toBeHidden();
  await expect(studio.getByRole("button", { name: "Trakya · komşu parsel parselini aç" })).toBeVisible();
  await studio.screenshot({ path: info.outputPath("mapbox-panorama.png"), animations: "disabled" });
  await studio.getByRole("button", { name: "Üstten görünüm", exact: true }).click();
  await expect(scene).toHaveAttribute("data-camera-pitch", "0");
  await studio.getByRole("button", { name: "Parsel çevresini göster" }).click();
  await expect(scene).toHaveAttribute("data-camera-pitch", info.project.name === "mobile" ? "69" : "76");
  await studio.getByRole("button", { name: "Yakın inceleme" }).click();
  await expect(studio.locator('[data-inspecting="true"]')).toBeVisible();
  await expect(studio.locator(".scene-inspection")).toContainText("Mapbox Satellite");
  await studio.screenshot({ path: info.outputPath("mapbox-field.png"), animations: "disabled" });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 844, height: 390 });
    await studio.getByRole("button", { name: "Parsel çevresini göster" }).click();
    await expect(scene).toHaveAttribute("data-camera-pitch", "76");
    await studio.screenshot({ path: info.outputPath("mapbox-panorama-landscape.png"), animations: "disabled" });
  }
});
