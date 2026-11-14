import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.use({ launchOptions: { args: ["--enable-webgl", "--enable-unsafe-swiftshader"] } });

test("existing-account owners can start standard parcel analysis without commercial email verification", async ({ page }, info) => {
  const id = (info.project.name === "desktop" ? "a" : "b").repeat(32);
  let existingAccount = true;
  await page.route("**/api/v1/bootstrap", async route => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, user: { ...json.user, emailVerified: false },
      capabilities: { ...json.capabilities, workspaceMode: existingAccount ? "existing-account" : undefined } } });
  });
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill(info.project.name + "@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await page.goto("/#fields?field=" + id);
  const update = page.getByRole("button", { name: "Uydu verilerini güncelle", exact: true });
  await expect(update).toBeEnabled();
  const submitted = page.waitForResponse(response => response.url().endsWith("/records/" + id + "/analysis") &&
    response.request().method() === "POST");
  await update.click();
  expect([200, 202]).toContain((await submitted).status());

  existingAccount = false;
  await page.reload();
  await expect(update).toBeDisabled();
  await expect(page.getByText(/e-posta doğrulaması gerekli/)).toBeVisible();
});

test("3D geometry, numeric Sentinel layers and dated comparisons work through the isolated API", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (!process.env.AGROMAX_VERIFY_LIVE_TERRAIN) {
    await page.route("https://api.mapbox.com/**", route => route.abort());
    await page.route("https://s3.amazonaws.com/elevation-tiles-prod/**", route => route.abort());
  }
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const id = "e".repeat(32);
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill("upgrade@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  const savedObservation = await page.request.post("/api/platform/records", { data: {
    fieldId: id, kind: "observation", name: "EXPLICIT TEST GPS OBSERVATION " + info.project.name,
    payload: { observedAt: "2026-10-31", category: "soil", notes: "Isolated point fixture.", coordinate: [27.5005, 38.5005] },
  } });
  expect(savedObservation.status()).toBe(201);
  const observationId = (await savedObservation.json()).record.id;
  await page.goto("/#twin?field=" + id);
  const twin = page.locator('[data-spatial="twin"]');
  await expect(twin.locator(".maplibregl-canvas")).toBeVisible({ timeout: 25_000 });
  await twin.getByRole("button", { name: "Kuzeye dön" }).click();
  await twin.getByText("Katmanlar", { exact: true }).click();
  await twin.getByRole("checkbox", { name: "Parsel sınırı" }).uncheck();
  await twin.getByRole("checkbox", { name: "Parsel sınırı" }).check();
  await expect(twin.getByRole("checkbox", { name: "Temsili bitki modeli" })).toHaveCount(0);
  await twin.getByText("Katmanlar", { exact: true }).click();
  await twin.getByRole("button", { name: "Arazi eğimi" }).click();
  await twin.getByRole("button", { name: "Genel görünüm" }).click();
  await expect(twin).toContainText(process.env.AGROMAX_VERIFY_LIVE_TERRAIN ? "Mapzen DEM" : "Düz referans yüzeyi", { timeout: 14_000 });
  if (process.env.VITE_MAPBOX_ACCESS_TOKEN)
    await expect(twin.locator(".agromax-mapbox-logo")).toBeVisible({ timeout: 14_000 });
  await twin.getByLabel("Saha gözlemi noktaları").selectOption(observationId);
  await expect(twin).toContainText("Isolated point fixture.");
  await twin.screenshot({ path: info.outputPath("spatial-twin.png") });
  await twin.getByRole("button", { name: "Seçimi temizle" }).click();
  await expect(twin.getByText("SEÇİLEN NOKTA", { exact: true })).toHaveCount(0);
  const studyAsset = page.waitForResponse(response => response.url().endsWith("/spatial-field-study.glb"));
  await twin.getByRole("button", { name: "Temsili tarla etüdü" }).click();
  const study = page.getByRole("region", { name: "Temsili tarla etüdü" });
  expect((await studyAsset).status()).toBe(200);
  const studyCanvas = study.locator("canvas");
  await expect(studyCanvas).toBeVisible();
  await expect(study).toContainText("Bitkiler, eğim ve konumlar örnektir.");
  await expect(page.locator("canvas.spatial-three, .spatial-three canvas")).toHaveCount(1);
  const frame = (await studyCanvas.boundingBox())!;
  await studyCanvas.scrollIntoViewIfNeeded();
  const visible = (await studyCanvas.boundingBox())!;
  await page.mouse.move(visible.x + frame.width / 2, visible.y + frame.height / 2);
  await page.mouse.down();
  await page.evaluate(() => {
    const times: number[] = [];
    (window as any).__studyFrames = new Promise<number[]>(resolve => {
      function sample(time: number) {
        times.push(time);
        if (times.length === 45) resolve(times);
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  await page.mouse.move(visible.x + frame.width * 0.6, visible.y + frame.height * 0.46, { steps: 36 });
  await page.mouse.up();
  const times: number[] = await page.evaluate(() => (window as any).__studyFrames);
  const intervals = times.slice(1).map((time, i) => time - times[i]!).sort((a, b) => a - b);
  const renderer = await studyCanvas.evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
  });
  const profile = JSON.stringify({
    samples: intervals.length, medianMs: intervals[22], p95Ms: intervals[41],
    over33Ms: intervals.filter(interval => interval > 1000 / 30).length,
    renderer, viewport: page.viewportSize(), source: "Chromium requestAnimationFrame during scripted orbit",
  }, null, 2);
  await writeFile(info.outputPath("study-frame-intervals.json"), profile);
  await info.attach("study-frame-intervals", { contentType: "application/json", body: profile });
  await study.screenshot({ path: info.outputPath("spatial-study.png") });
  await study.getByRole("button", { name: "Bitki sıralarına yaklaş" }).click();
  await study.screenshot({ path: info.outputPath("spatial-study-detail.png") });
  await study.getByRole("button", { name: "Parsel modeline dön" }).click();
  await expect(twin.locator(".maplibregl-canvas")).toBeVisible();
  await twin.getByRole("button", { name: "2D" }).click();
  await expect(twin.locator(".maplibregl-canvas")).toBeVisible();

  await page.goto("/#satellite?field=" + id);
  const satellite = page.locator('[data-spatial="satellite"]');
  await expect(satellite.locator(".maplibregl-canvas")).toBeVisible({ timeout: 25_000 });
  await expect(satellite.getByText("EXPLICIT SYNTHETIC BROWSER FIXTURE", { exact: false })).toBeVisible();
  await expect(satellite.getByLabel("Renk skalası")).toBeVisible();
  await satellite.getByText("Katmanlar", { exact: true }).click();
  await satellite.getByRole("checkbox", { name: "Sentinel-2 doğal renk" }).check();
  await expect(satellite.getByText(/Sentinel.2 doğal renk ·/)).toBeVisible();
  await satellite.getByText("Katmanlar", { exact: true }).click();
  await satellite.screenshot({ path: info.outputPath("spatial-satellite.png") });
  const rasterResponse = page.waitForResponse(response =>
    response.url().endsWith("/image") && response.request().postDataJSON().layer === "NDRE");
  await satellite.getByLabel("Analiz katmanı").selectOption("NDRE");
  const response = await rasterResponse;
  expect(response.status()).toBe(200);
  const raster = await response.json();
  expect(raster.values[0]).toBeNull();
  expect(raster.values[1]).toBeGreaterThan(0);
  expect(raster.crs).toBe("EPSG:3857");
  await satellite.getByLabel("Gösterim").selectOption("columns");
  await expect(satellite).toContainText("Sütun yüksekliği indeks ölçeğidir");
  await expect(satellite.getByText("Sütun katmanı açılamadı.", { exact: false })).toHaveCount(0);
  await satellite.screenshot({ path: info.outputPath("spatial-columns.png") });
  await satellite.getByRole("button", { name: "2D" }).click();
  await expect(satellite.getByLabel("Renk skalası")).toBeVisible();
  await satellite.getByRole("button", { name: "3D" }).click();
  await satellite.getByLabel("Gösterim").selectOption("difference");
  await satellite.getByLabel("Karşılaştırma tarihi").selectOption("2026-10-28");
  await expect(satellite.getByLabel("Renk skalası")).toContainText("Güncel − karşılaştırma");
  await satellite.getByLabel("Gözlem tarihi").selectOption("2026-10-28");
  await page.evaluate(id => { location.hash = "twin?field=" + id; }, id);
  await expect(twin.getByLabel("Gözlem tarihi")).toHaveValue("2026-10-28");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  expect(errors).toEqual([]);
});

test("revision-bound prescription zones are saved, validated and selectable in 3D", async ({ page }, info) => {
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill(info.project.name + "@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await page.route("https://api.mapbox.com/**", route => route.abort());
  await page.route("https://s3.amazonaws.com/elevation-tiles-prod/**", route => route.abort());
  const id = (info.project.name === "desktop" ? "a" : "b").repeat(32);
  const otherId = (info.project.name === "desktop" ? "b" : "a").repeat(32);
  expect((await page.request.get("/api/platform/fields/" + otherId + "/spatial")).status()).toBe(404);
  const polygon = { type: "Polygon", coordinates: [[
    [27.5001, 38.5001], [27.5004, 38.5001], [27.5004, 38.5004],
    [27.5001, 38.5004], [27.5001, 38.5001],
  ]] };
  const input = { fieldId: id, kind: "prescription", name: "EXPLICIT TEST REGION PLAN",
    payload: { application: "irrigation", unit: "m3/ha", rate: 40, scope: "Isolated test",
      zones: [{ name: "Güney", rate: 32, geometry: polygon }] } };
  expect((await page.request.post("/api/platform/records", { data: input })).status()).toBe(201);
  expect((await page.request.post("/api/platform/records", { data: {
    ...input, payload: { ...input.payload, zones: [...input.payload.zones, { name: "Çakışan", rate: 8, geometry: polygon }] },
  } })).status()).toBe(400);
  await page.goto("/#prescriptions?field=" + id);
  const model = page.locator('[data-spatial="prescriptions"]');
  await expect(model.locator(".maplibregl-canvas")).toBeVisible();
  await page.getByRole("combobox", { name: "Yönetim bölgesi", exact: true }).selectOption({ label: "Güney · 32 m³/ha" });
  await expect(model).toContainText("Güney · 32 m³/ha · Kullanıcı taslağı");
  await page.goto("/#twin?field=" + id);
  const twin = page.locator('[data-spatial="twin"]');
  await twin.getByText("Katmanlar", { exact: true }).click();
  await twin.getByRole("checkbox", { name: "Reçete bölgeleri" }).check();
  await expect(twin).toContainText("EXPLICIT TEST REGION PLAN · v1 · Kullanıcı reçete taslağı");
  if (info.project.name === "desktop") {
    await page.goto("/#field-studio?field=" + id);
    const studio = page.getByRole("region", { name: "3D Saha Stüdyosu" });
    await studio.getByRole("spinbutton", { name: "Güney oranı" }).fill("41");
    await studio.getByRole("button", { name: "Oranları kaydet" }).click();
    await expect(studio.getByRole("status").filter({ hasText: "Oranlar kaydedildi." })).toBeVisible();
    const bundle = await page.request.get("/api/platform/fields/" + id);
    const { records }: { records: { name: string; version: number; payload: typeof input.payload }[] } = await bundle.json();
    const plan = records.find(record => record.name === input.name);
    if (!plan) throw new Error("Saved prescription missing");
    expect(plan.version).toBe(2);
    expect(plan.payload.zones[0].rate).toBe(41);
  }
});
