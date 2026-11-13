import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { terrainFixture } from "./terrain-fixture";

const evidence = process.env.AGROMAX_TERRAIN_EVIDENCE;
const real = process.env.AGROMAX_DRONE_SAMPLE_DIR;
const gpu = process.env.AGROMAX_TERRAIN_GPU;
test.use({
  ...(gpu ? { channel: "chrome" } : {}),
  launchOptions: { args: gpu ? ["--enable-gpu", "--use-angle=d3d11"] : ["--enable-webgl", "--enable-unsafe-swiftshader"] },
  ...(evidence ? { video: "on" } : {}),
});

async function login(page: Page, account: string) {
  await page.goto("/");
  await page.getByLabel("E-posta adresiniz").fill(account + "@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
}

test("paired scenarios share the terrain and select the same date; drone layers stay private and aligned", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const mobile = info.project.name === "mobile";
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: evidence || gpu ? "no-preference" : "reduce" });
  if (!real) {
    await page.route("https://api.mapbox.com/**", route => route.abort());
    await page.route("https://s3.amazonaws.com/elevation-tiles-prod/**", route => route.abort());
  }
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await login(page, info.project.name);
  let fieldId = (mobile ? "b" : "a").repeat(32);
  let source = "Açıkça etiketlenmiş test rasterı";
  let capturedOn = "2026-09-01";
  let files = { ortho: terrainFixture(), dtm: terrainFixture({ dtm: true }) };
  if (real) {
    const sample = JSON.parse(await readFile(resolve(real, "sample.json"), "utf8"));
    const response = await page.request.post("/api/records", { data: {
      kind: "field", name: "Beesby · drone doğrulama parseli", crop: "Buğday", geometry: sample.geometry,
    } });
    expect(response.status()).toBe(201);
    fieldId = (await response.json()).id;
    source = sample.source;
    capturedOn = sample.capturedOn;
    files = {
      ortho: await readFile(resolve(real, "ortho.tif")),
      dtm: await readFile(resolve(real, "dtm.tif")),
    };
  }
  const path = "/api/v1/fields/" + fieldId;
  const saved = await page.request.post(path + "/water-balance", { data: {
    scope: "trakya-winter-wheat", weatherSource: "İzole QA · model meteorolojisi", soilSource: "İzole QA · model toprağı",
    sowingDate: "2026-02-01", systemEfficiency: 0.84, baseTemperatureC: 2,
    soil: { fieldCapacity: 0.32, wiltingPoint: 0.14, rootDepthM: 0.9, initialDepletionMm: 92, depletionFraction: 0.50 },
    days: Array.from({ length: 21 }, (_, day) => ({
      date: "2026-03-" + String(day + 1).padStart(2, "0"), et0Mm: 3.5 + (day % 4) * 0.3,
      effectiveRainMm: day === 11 ? 11 : day === 17 ? 5 : 0, cropCoefficient: 1.1, meanTempC: 15,
    })),
    scenarios: [
      { name: "İki geniş sulama", irrigation: [{ date: "2026-03-06", grossMm: 45 }, { date: "2026-03-15", grossMm: 45 }] },
      { name: "Üç kademeli sulama", irrigation: [{ date: "2026-03-03", grossMm: 25 }, { date: "2026-03-09", grossMm: 25 }, { date: "2026-03-16", grossMm: 25 }] },
    ],
    waterCostMinorPerM3: 200, maxVolumeM3: 20000, maxCostMinor: 4000000,
  } });
  expect(saved.status()).toBe(201);
  const model = await saved.json();
  const { geometryVersion } = model;
  const datasetPath = path + "/terrain-datasets";
  await page.goto("/#scenarios?field=" + fieldId);
  if (real) await page.reload();
  const comparison = page.getByRole("region", { name: "Su dengesi senaryolarının 3D karşılaştırması" });
  await expect(comparison.locator(".maplibregl-canvas")).toBeVisible({ timeout: 15_000 });
  await expect(comparison.locator(".maplibregl-canvas")).toHaveCount(1);
  const panels = comparison.locator(".water-compare-panel");
  const a = (await panels.nth(0).boundingBox())!, b = (await panels.nth(1).boundingBox())!;
  expect(mobile ? b.y > a.y && b.x === a.x : b.x > a.x && b.y === a.y).toBe(true);
  await expect(comparison).toContainText("İlk fark 3 Mar");
  const slider = comparison.getByRole("slider", { name: "Model günü" });
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /21 Mar/);
  for (let i = 0; i < 2; i++) {
    const final = model.run.data.result.scenarios[i].days.at(-1).depletionMm;
    await expect(panels.nth(i)).toContainText(final.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " mm");
  }
  const chart = comparison.getByRole("img", { name: /günlük su açığı/ });
  const chartBounds = (await chart.boundingBox())!;
  await chart.click({ position: { x: chartBounds.width * 0.45, y: chartBounds.height * 0.36 } });
  await expect(slider).not.toHaveAttribute("aria-valuetext", /21 Mar/);
  await comparison.getByRole("button", { name: "Arazi eğimi" }).click();
  if (real && process.env.VITE_MAPBOX_ACCESS_TOKEN) await expect(comparison.locator(".agromax-mapbox-logo").first()).toBeVisible({ timeout: 14_000 });
  await comparison.getByRole("button", { name: "Genel görünüm" }).click();
  if (evidence) await comparison.screenshot({ path: info.outputPath("senaryo-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });

  async function init(ortho: Buffer, dtm?: Buffer) {
    const response = await page.request.post(datasetPath, { data: {
      geometryVersion, capturedOn, source, ortho: { name: "ortho.tif", bytes: ortho.length },
      ...(dtm ? { dtm: { name: "dtm.tif", bytes: dtm.length } } : {}),
    } });
    expect(response.status()).toBe(201);
    return response.json();
  }
  expect((await page.request.post(datasetPath, { data: {
    geometryVersion: "0".repeat(64), capturedOn, source, ortho: { name: "ortho.tif", bytes: files.ortho.length },
  } })).status()).toBe(409);
  const partial = await init(terrainFixture());
  expect((await page.request.put(partial.uploads[0].url, { data: Buffer.alloc(20) })).status()).toBe(422);
  expect((await page.request.post(datasetPath + "/" + partial.dataset.id + "/finish", { data: {} })).status()).toBe(409);
  for (const [fixture, message] of [
    [terrainFixture({ invalidCrs: true }), "WGS84"],
    [terrainFixture({ transparent: true }), real ? "kesişmiyor" : "geçerli raster pikseli"],
  ] as const) {
    const item = await init(fixture);
    expect((await page.request.put(item.uploads[0].url, { data: fixture })).ok()).toBe(true);
    const rejected = await page.request.post(datasetPath + "/" + item.dataset.id + "/finish", { data: {} });
    const { dataset } = await rejected.json();
    expect(dataset.state).toBe("failed");
    expect(dataset.error).toContain(message);
  }
  await page.goto("/#twin?field=" + fieldId);
  const twin = page.getByRole("region", { name: "Parsel modeli ve kaynakları" });
  await twin.getByText("Drone ortomozaik ve arazi modeli", { exact: true }).click();
  await twin.getByLabel("Çekim tarihi").fill(capturedOn);
  await twin.getByLabel("Görüntü kaynağı", { exact: true }).fill(source);
  await twin.getByLabel("RGB ortomozaik").setInputFiles(real ? resolve(real, "ortho.tif")
    : { name: "ortho.tif", mimeType: "image/tiff", buffer: files.ortho });
  await twin.getByLabel("Arazi modeli (DTM, metre)").setInputFiles(real ? resolve(real, "dtm.tif")
    : { name: "dtm.tif", mimeType: "image/tiff", buffer: files.dtm });
  await twin.getByRole("button", { name: "Yükle ve doğrula" }).click();
  const imagery = twin.getByLabel("3D arazi görüntüsü");
  await expect(imagery).toBeVisible({ timeout: 35_000 });
  const selected = await imagery.inputValue();
  await expect(twin.getByText(/Drone ortomozaik ·/)).toBeVisible();
  await expect(twin.getByText(/Drone DTM · görüntüleme aralığı/)).toBeVisible();
  const readyResponse = await page.request.get(datasetPath + "/" + selected);
  const ready = (await readyResponse.json()).dataset;
  expect(ready.layers.ortho.coverage).toBeGreaterThan(0.9);
  expect(ready.layers.dtm.coverage).toBeGreaterThan(real ? 0.8 : 0.9);
  if (real) expect(ready.layers.dtm.coverage).toBeLessThan(1);
  expect(ready.layers.ortho.nativeResolutionM).toBeGreaterThan(0);
  await imagery.selectOption("satellite");
  await expect(twin.getByText(/Drone ortomozaik ·/)).toHaveCount(0);
  await imagery.selectOption(selected);
  await expect(twin.getByText(/Drone ortomozaik ·/)).toBeVisible();
  await twin.locator(".spatial-drone-details summary").click();
  await twin.getByRole("button", { name: "Arazi eğimi" }).click();
  await twin.getByRole("button", { name: "Genel görünüm" }).click();
  if (evidence) await twin.screenshot({ path: info.outputPath("dijital-ikiz-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });
  const separate = await browser.newContext();
  try {
    const outsider = await separate.newPage();
    await login(outsider, mobile ? "desktop" : "mobile");
    expect((await outsider.request.get(datasetPath + "/" + selected + "/layers/ortho")).status()).toBe(404);
  } finally { await separate.close(); }
  expect(failures).toEqual([]);

  async function measure(canvas: ReturnType<Page["locator"]>) {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const renderer = await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    });
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(125, box.height / 2));
    await page.mouse.down();
    const frames = page.evaluate(() => new Promise<number[]>(done => {
      const times: number[] = [];
      function next(time: number) {
        times.push(time);
        if (times.length >= 80) done(times.slice(1).map((value, index) => value - times[index]));
        else requestAnimationFrame(next);
      }
      requestAnimationFrame(next);
    }));
    for (let i = 0; i < 27; i++)
      await page.mouse.move(box.x + box.width / 2 + Math.sin(i / 5) * box.width * 0.27, box.y + Math.min(125, box.height / 2), { steps: 3 });
    await page.mouse.up();
    const intervals = (await frames).sort((a, b) => a - b);
    return { renderer, p95Ms: intervals[Math.ceil(intervals.length * .95) - 1], frameCount: intervals.length };
  }

  let twinPerformance;
  if (gpu) {
    if (mobile) await twin.getByRole("button", { name: "Kamera hareketi" }).click();
    twinPerformance = await measure(twin.locator("canvas"));
  }
  await page.goto("/#scenarios?field=" + fieldId);
  await expect(comparison.getByLabel("Ortak arazi kaynağı")).toHaveValue(selected);
  await expect(comparison.locator(".spatial-scenario-source")).toContainText("Drone ortomozaik");
  if (evidence) await comparison.screenshot({ path: info.outputPath("senaryo-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });
  if (gpu) {
    if (mobile) await comparison.getByRole("button", { name: "Kamera hareketi" }).click();
    const comparisonPerformance = await measure(comparison.locator(".maplibregl-canvas"));
    const cdp = await browser.newBrowserCDPSession();
    const hardware = await cdp.send("SystemInfo.getInfo");
    await cdp.detach();
    await writeFile(info.outputPath("gpu-performance.json"), JSON.stringify({
      gpu: hardware.gpu, twin: twinPerformance, comparison: comparisonPerformance,
    }, null, 2));
  }
  if (!real && !gpu && !mobile) {
    const lost = await comparison.locator(".maplibregl-canvas").evaluate((element: HTMLCanvasElement) => {
      const extension = element.getContext("webgl2")?.getExtension("WEBGL_lose_context");
      extension?.loseContext();
      return !!extension;
    });
    if (lost) {
      await expect(comparison.getByText("3D açılamadı. Ortak parsel 2D haritada gösteriliyor.")).toBeVisible();
      await expect(comparison.getByRole("table")).toBeVisible();
    }
  }
  if (real && evidence) {
    await page.goto("/#field-studio?field=" + fieldId);
    const studio = page.getByRole("region", { name: "3D Saha Stüdyosu" });
    await expect(studio.locator(".maplibregl-canvas")).toBeVisible();
    await expect(studio.getByText(/Drone ortomozaik ·/)).toBeVisible({ timeout: 15_000 });
    await expect(studio.locator('[data-terrain="drone"]')).toBeVisible({ timeout: 15_000 });
    await studio.screenshot({ path: info.outputPath("saha-studyosu-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });
    const inspect = studio.getByRole("button", { name: "Yakın inceleme", exact: true });
    await inspect.click();
    await expect(inspect).toHaveAttribute("aria-pressed", "true");
    await expect(studio.getByText(/^[\d,]+ m örnekleme$/)).toBeVisible();
    await expect(studio.getByText("Drone ortomozaik · Drone yükseklik modeli")).toBeVisible();
    await expect(studio.locator(".scene-card").first()).toBeHidden();
    const cameraBounds = await studio.getByRole("group", { name: "Harita kamerası" }).boundingBox();
    const toolbarBounds = await studio.getByRole("group", { name: "3D katman görünümü" }).boundingBox();
    expect(cameraBounds && toolbarBounds && cameraBounds.y + cameraBounds.height <= toolbarBounds.y).toBe(true);
    await studio.screenshot({ path: info.outputPath("drone-inceleme-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });
    await inspect.click();
    await expect(inspect).toHaveAttribute("aria-pressed", "false");
    await page.goto("/#platform?field=" + fieldId);
    const atlas = page.getByRole("region", { name: "Üç boyutlu arazi atlası" });
    await expect(atlas).toContainText("Drone ortomozaik");
    await atlas.screenshot({ path: info.outputPath("arazi-atlasi-" + (mobile ? "390" : "1440") + ".png"), animations: "disabled" });
  }
});
