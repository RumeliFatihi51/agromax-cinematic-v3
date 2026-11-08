import { test, expect } from "@playwright/test";

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

  const widths = [360, 375, 390, 768, 1024, 1440, 1920];
  for (const screen of ["overview", "fields", "assistant"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/#${screen}`);
    if (screen === "fields") {
      await page.locator(".view-switch").getByRole("button", { name: "Liste", exact: true }).click();
      await page.locator(".field-comparison-table .metric-link").first().click();
      await expect(page.locator(".analysis-page")).toBeVisible();
    } else {
      await expect(page.locator(".studio-content h1")).toBeVisible();
    }
    if (screen === "assistant")
      await expect(page.getByText(/s2-period-change-v1/)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), { message: `${screen} at ${width}` }).toBe(true);
      await page.screenshot({ path: info.outputPath(`${screen}-${width}.png`), animations: "disabled" });
    }
  }
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
