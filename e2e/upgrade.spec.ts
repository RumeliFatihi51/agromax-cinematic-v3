import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("water-balance persistence, linked evidence, and reference screens", async ({ page }, info) => {
  test.setTimeout(120_000);
  test.skip(info.project.name !== "desktop", "The reference screens are exercised at all widths in the desktop project.");
  const cookies = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookies) throw new Error("Expected isolated browser login cookie.");
  await page.context().addCookies(cookies.split("; ").map((pair) => {
    const separator = pair.indexOf("=");
    return {
      name: pair.slice(0, separator), value: pair.slice(separator + 1),
      url: "http://127.0.0.1:5182", httpOnly: true, sameSite: "Lax" as const,
    };
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/#twin");
  const balance = page.locator(".water-balance");
  await expect(balance).toBeVisible();
  await balance.getByText("Yeni su dengesi çalıştır", { exact: true }).click();
  const values = {
    weatherSource: "EXPLICIT SYNTHETIC WEATHER FIXTURE",
    soilSource: "EXPLICIT SYNTHETIC SOIL FIXTURE",
    sowingDate: "2026-01-01",
    fieldCapacity: "0.3",
    wiltingPoint: "0.15",
    rootDepthM: "1",
    initialDepletionMm: "120",
    depletionFraction: "0.5",
    systemEfficiency: "0.8",
    baseTemperatureC: "2",
    waterCost: "2",
    maxVolumeM3: "10000",
    maxCost: "10000",
    days: "2026-01-02,4,0,1,10\n2026-01-03,4,0,1,10",
    alternative: "2026-01-02,100",
  };
  for (const [name, value] of Object.entries(values))
    await balance.locator(`[name="${name}"]`).fill(value);
  await balance.getByRole("checkbox").check();
  await balance.getByRole("button", { name: "Senaryoları hesapla ve kaydet" }).click();
  await expect(balance.getByText("Girilen takvimler arasında en az stres ve suyla: Alternatif.")).toBeVisible();
  await page.reload();
  await expect(balance.getByRole("rowheader", { name: "Alternatif" })).toBeVisible();
  await expect(balance.getByRole("img", { name: /günlük su açığı/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Parsel modeli ve kaynakları" })).toContainText("FAO-56");
  await page.screenshot({ path: info.outputPath("twin-1440.png"), animations: "disabled" });
  await page.goto("/#scenarios");
  const comparison = balance.getByRole("region", { name: "Su dengesi senaryolarının 3D karşılaştırması" });
  await expect(comparison.getByRole("img", { name: /günlük su açığı/ })).toBeVisible();
  await expect(comparison.getByLabel("Plan A")).toHaveValue("0");
  await expect(comparison.getByLabel("Plan B")).toHaveValue("1");
  await expect(comparison.locator(".water-compare-panel")).toHaveCount(2);
  await comparison.getByRole("slider", { name: "Model günü" }).press("End");
  await expect(comparison.getByRole("slider", { name: "Model günü" })).toHaveAttribute("aria-valuetext", /3 Oca/);
  await expect(comparison.locator("canvas")).toHaveCount(1);
  if (process.env.AGROMAX_VERIFY_LIVE_TERRAIN)
    await expect(comparison.getByRole("link", { name: "Mapzen yüksekliği" })).toBeVisible({ timeout: 14000 });
  await comparison.screenshot({ path: info.outputPath("spatial-decision.png"), animations: "disabled" });
  await balance.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("scenarios-1440.png"), animations: "disabled" });

  await page.goto("/#evidence");
  await page.getByText(/^NDVI · Dönem farkı/).click();
  await page.getByRole("button", { name: "Saha inceleme taslağı oluştur" }).click();
  await expect(page.getByText("Kanıta bağlı saha inceleme taslağı kaydedildi.")).toBeVisible();
  await page.goto("/#investigation");
  await expect(page.getByRole("heading", { name: "NDVI · Taslak" })).toBeVisible();

  const parcel = await page.request.post("/api/records", { data: {
    kind: "field", name: "EXPLICIT SATELLITE PIPELINE PARCEL",
    geometry: { type: "Polygon", coordinates: [[[26.5, 41], [26.501, 41], [26.501, 41.001], [26.5, 41]]] },
  } });
  expect(parcel.status()).toBe(201);
  const { id: pipelineFieldId } = await parcel.json();
  const analysisRequest = { range: { start: "2026-01-01", split: "2026-01-02", end: "2026-01-02" } };
  const analysis = await page.request.post(`/api/records/${pipelineFieldId}/analysis`, {
    data: analysisRequest, headers: { "Idempotency-Key": "explicit-compiled-pipeline-test" },
  });
  expect(analysis.status()).toBe(202);
  const { job } = await analysis.json();
  await expect.poll(async () =>
    (await (await page.request.get(`/api/analyses/${job.id}`)).json()).job.state,
    { timeout: 30_000 },
  ).toBe("completed");
  const replay = await page.request.post(`/api/records/${pipelineFieldId}/analysis`, {
    data: analysisRequest, headers: { "Idempotency-Key": "explicit-compiled-pipeline-test" },
  });
  expect((await replay.json()).job.id).toBe(job.id);
  const published = await (await page.request.get(`/api/v1/fields/${pipelineFieldId}/claims`)).json();
  expect(published.claims.some((claim: { analysisId: string }) => claim.analysisId === job.id)).toBe(true);
  const notifications = await page.request.get("/api/notifications");
  expect(await notifications.text()).toContain(job.id);

  const revised = await page.request.patch(`/api/records/${pipelineFieldId}`, { data: {
    version: 1,
    geometry: { type: "Polygon", coordinates: [[[26.5, 41], [26.502, 41], [26.502, 41.002], [26.5, 41]]] },
  } });
  expect(revised.status()).toBe(200);
  await page.goto("/?temporal=1#temporal");
  const temporal = page.locator(".temporal-studio");
  const historicalRaster = page.waitForResponse((response) =>
    response.url().endsWith(`/api/records/${pipelineFieldId}/image`) && response.request().method() === "POST",
  );
  await page.getByLabel("Platform parseli").selectOption(pipelineFieldId);
  await expect(temporal.getByText("Bu analiz, kaydedildiği eski parsel sınırıyla gösteriliyor.")).toBeVisible();
  await expect(temporal.getByRole("list", { name: "Kayıtlı analiz işlemleri" })
    .getByRole("button", { pressed: true })).toContainText("Eski sınır");
  const archivedResponse = await historicalRaster;
  expect(archivedResponse.ok()).toBe(true);
  expect(archivedResponse.request().postDataJSON().analysisId).toBe(job.id);
  expect(JSON.parse(archivedResponse.headers()["x-image-bounds"]!)[2]).toBeCloseTo(26.501, 5);

  await page.getByLabel("Platform parseli").selectOption("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  const scene = temporal.getByRole("region", { name: "Uydu gözlem haritası" });
  await expect(scene.locator(".satellite-scene-meta strong")).toContainText("NDVI");
  await scene.getByLabel("Uydu görüntü katmanı").selectOption("NDRE");
  await scene.getByLabel("Çekim tarihi").selectOption("2026-10-28");
  await expect(scene.locator(".satellite-scene-meta strong")).toContainText("NDRE · 28");
  await expect(temporal.locator(".observation-plot-selection")).toContainText("2026-10-28");
  await page.screenshot({ path: info.outputPath("temporal-1440.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  expect((await scene.locator(".parcel-map").boundingBox())!.y).toBeLessThan(775);
  await page.screenshot({ path: info.outputPath("temporal-390.png"), animations: "disabled" });

  const viewports = [[360, 800], [390, 844], [768, 1024], [1024, 768],
    [1280, 800], [1440, 900], [1600, 900], [1672, 941], [1920, 1080]];
  for (const screen of ["overview", "fields", "assistant"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/#${screen}`);
    if (screen === "fields") {
      await page.locator(".view-switch").getByRole("button", { name: "Liste", exact: true }).click();
      await page.locator(".field-comparison-table .metric-link").first().click();
      await expect(page.locator(".analysis-page")).toBeVisible();
      await expect(page.locator(".analysis-page").getByRole("search", { name: "Haritada yer ara" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", {
        level: 1, name: screen === "overview" ? "Arazilerinizdeki güncel durum" : "Filiz",
      })).toBeVisible();
    }
    if (screen === "assistant") {
      const drawer = page.locator(".filiz-source-drawer");
      await drawer.locator("summary").click();
      await expect(page.getByText(/s2-period-change-v1/)).toBeVisible();
      await drawer.locator("summary").click();
    }
    if (screen === "overview") {
      await expect(page.locator(".dashboard-layer-info strong")).toContainText("NDVI · 2026-10-31");
      const ndre = page.getByRole("button", { name: "NDRE", exact: true });
      await ndre.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".dashboard-layer-info strong")).toContainText("NDRE · 2026-10-31");
      await page.getByRole("button", { name: "Zaman Serisi", exact: true }).click();
      await page.getByLabel("Uydu çekimi").selectOption("2026-10-28");
      await expect(page.locator(".dashboard-layer-info strong")).toContainText("NDRE · 2026-10-28");
      await page.getByRole("button", { name: "Durum", exact: true }).click();
      await page.route("**/api/records/*/image", (route) => route.fulfill({
        status: 503, json: { error: "EXPLICIT RASTER UNAVAILABLE FIXTURE" },
      }), { times: 1 });
      await page.getByRole("button", { name: "NDMI", exact: true }).click();
      await expect(page.getByText("EXPLICIT RASTER UNAVAILABLE FIXTURE")).toBeVisible();
      await expect(page.locator(".dashboard-layer-info strong")).toContainText("NDRE · 2026-10-28");
      await page.getByRole("button", { name: "NDRE", exact: true }).click();
      await expect(page.getByText("EXPLICIT RASTER UNAVAILABLE FIXTURE")).toHaveCount(0);
    }
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), { message: `${screen} at ${width}` }).toBe(true);
      await page.screenshot({ path: info.outputPath(`${screen}-${width}.png`), animations: "disabled" });
      if (screen === "overview" && width === 1672) {
        const layout = await page.evaluate(() => Object.fromEntries(
          [".studio-sidebar", ".dashboard-hero", ".dashboard-stats", ".dashboard-map",
            ".dashboard-parcel", ".dashboard-filiz", ".dashboard-modules"].map((selector) => {
            const rect = document.querySelector(selector)!.getBoundingClientRect();
            return [selector, { x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height }];
          }),
        ));
        expect(Math.abs(layout[".studio-sidebar"]!.width - 261)).toBeLessThan(6);
        expect(Math.abs(layout[".dashboard-hero"]!.height - 255)).toBeLessThan(10);
        expect(Math.abs(layout[".dashboard-filiz"]!.x - 1327)).toBeLessThan(8);
        expect(Math.abs(layout[".dashboard-filiz"]!.width - 337)).toBeLessThan(8);
        expect(Math.abs(layout[".dashboard-stats"]!.y - 235)).toBeLessThan(10);
        expect(Math.abs(layout[".dashboard-map"]!.y - 362)).toBeLessThan(10);
        expect(Math.abs(layout[".dashboard-modules"]!.y - 753)).toBeLessThan(10);
        await writeFile(info.outputPath("reference-layout-1672.json"), JSON.stringify(layout, null, 2));
      }
    }
    if (screen === "overview") {
      await page.setViewportSize({ width: 390, height: 844 });
      const open = page.getByRole("button", { name: "Analizi göster" });
      await open.click();
      const sheet = page.getByRole("dialog", { name: "Parsel analizi" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Analizi kapat" })).toBeFocused();
      await page.screenshot({ path: info.outputPath("overview-390-parcel-sheet.png") });
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(open).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue();
  }, { times: 1 });
  await page.goto("/?motion=1#overview");
  const loader = page.locator(".earth-loader");
  await expect(loader).toBeVisible();
  await page.screenshot({ path: info.outputPath("motion-01-earth-loader.png") });
  const motionLine = page.locator(".motion-line > span").last();
  await expect.poll(() => motionLine.evaluate((node) => node.style.transform)).not.toBe("");
  await page.screenshot({ path: info.outputPath("motion-02-reveal.png") });
  await expect(motionLine).toHaveCSS("transform", "none");
  await page.screenshot({ path: info.outputPath("motion-03-settled.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#access");
  const fieldId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  await page.getByLabel("Çevrimdışı parsel").selectOption(fieldId);
  await page.getByRole("button", { name: "Bu cihazda sakla" }).click();
  await expect(page.getByText("Çevrimdışı parsel kopyası bu tarayıcıda hazır.")).toBeVisible();
  await page.context().setOffline(true);
  await page.goto("/?test-offline=1");
  await expect(page.getByRole("heading", { name: "Çevrimdışı saha" })).toBeVisible();
  const note = "EXPLICIT OFFLINE TEST NOTE";
  await page.getByLabel("Gözlem").fill(note);
  await page.getByRole("button", { name: "Taslağı bu cihazda kaydet" }).click();
  await expect(page.getByText("1 eşitlenmemiş saha notu")).toBeVisible();
  await page.context().setOffline(false);
  const mutation = await page.request.patch(`/api/records/${fieldId}`, {
    data: { version: 1, name: "EXPLICIT TEST PARCEL upgrade · v2" },
  });
  expect(mutation.status()).toBe(200);
  await page.getByRole("link", { name: "Bağlantı geldiğinde AgroMax’ı aç" }).click();
  await page.getByRole("button", { name: "Saha notlarını eşitle" }).click();
  await expect(page.getByRole("heading", { name: "Parsel sürümü değişti" })).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await page.getByRole("button", { name: "Güncel parsel sürümüyle kaydet" }).click();
  await expect(page.getByText("Saha notları değerlendirme kayıtlarına eşitlendi.")).toBeVisible();
  const saved = await page.request.get(`/api/v1/records/evaluation?fieldId=${fieldId}`);
  expect(await saved.text()).toContain(note);
  const evidence = await (await page.request.get(`/api/v1/fields/${fieldId}/evidence-bundle`)).json();
  expect(evidence.schema).toBe("agromax.evidence-bundle.v2");
  expect(evidence.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(evidence.claims).toHaveLength(1);
  expect(evidence.reportFiles[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(evidence.measurementsAndInterventions)).toContain(note);
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page.getByRole("button", { name: "Platforma giriş yap" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("agromax-offline-v1"))).toBeNull();
  expect(failures).toEqual([]);
});
