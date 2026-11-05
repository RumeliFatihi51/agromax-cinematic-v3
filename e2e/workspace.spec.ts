import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Menüyü aç", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".studio-sidebar")
    .getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) })
    .click();
}
test("menus, operation CRUD, sourced guide, confirmed tasks and private PDF downloads work", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-auth.png`,
    fullPage: true,
  });
  await page
    .getByLabel("E-posta adresiniz")
    .fill(`${info.project.name}@example.invalid`);
  await page
    .getByLabel("Şifreniz", { exact: true })
    .fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".studio-workspace")).toContainText(
    `TEST WORKSPACE ${info.project.name}`,
  );
  await expect(page.locator(".mission-deck")).toBeVisible();
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-overview.png`,
    fullPage: true,
  });
  await expect(
    page
      .locator(".studio-sidebar")
      .getByRole("button", { name: "Uydu analizleri", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "Sezon ve saha");
  await page
    .locator(".business-operation-tabs")
    .getByRole("button", { name: "Sulama", exact: true })
    .click();
  await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="date"]').fill("2026-10-20");
  await dialog.locator('input[name="volumeM3"]').fill("12.5");
  await dialog.locator('textarea[name="notes"]').fill("EXPLICIT BROWSER TEST");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/records/irrigation") &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Kaydı kaydet" }).click();
  expect((await saved).status()).toBe(201);
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Kaydı düzenle", exact: true })
    .click();
  await expect(page.locator('input[name="volumeM3"]')).toHaveValue("12.5");
  await page.locator('input[name="volumeM3"]').fill("14");
  await page.getByRole("button", { name: "Kaydı kaydet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-operations.png`,
    fullPage: true,
  });
  await navigate(page, "Filiz");
  await expect(
    page.getByRole("heading", { name: "Parselin kayıt rehberi" }),
  ).toBeVisible();
  await expect(page.locator(".business-fact").first()).toContainText(
    "EXPLICIT TEST PARCEL",
  );
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-filiz.png`,
    fullPage: true,
  });
  await page.getByText("Görev taslağı", { exact: true }).click();
  const taskForm = page
    .locator("details")
    .filter({ has: page.getByText("Görev taslağı", { exact: true }) });
  await taskForm
    .locator('input[name="name"]')
    .fill("EXPLICIT CONFIRMATION TEST");
  await taskForm.locator('input[name="date"]').fill("2026-11-02");
  const before = await (await page.request.get("/api/records")).json();
  await taskForm.getByRole("button", { name: "Taslağı önizle" }).click();
  await expect(page.locator(".business-proposal")).toBeVisible();
  const pending = await (await page.request.get("/api/records")).json();
  expect(
    pending.filter((r: { kind: string }) => r.kind === "task").length,
  ).toBe(before.filter((r: { kind: string }) => r.kind === "task").length);
  await page.getByRole("button", { name: "Onayla ve kaydet" }).click();
  await expect(page.locator(".business-proposal")).toHaveCount(0);
  await expect
    .poll(async () => {
      const r = await (await page.request.get("/api/records")).json();
      return r.filter((r: { kind: string }) => r.kind === "task").length;
    })
    .toBe(before.filter((r: { kind: string }) => r.kind === "task").length + 1);
  await navigate(page, "Raporlar");
  await expect(page.locator(".business-register")).toBeVisible();
  await page
    .getByRole("button", { name: "Önizle", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("EXPLICIT SYNTHETIC BROWSER FIXTURE", { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PDF indir", exact: true })
    .first()
    .click();
  expect((await download).suggestedFilename()).toMatch(/^agromax-.*\.pdf$/);
  const generated = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/reports") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "PDF raporu hazırla", exact: true })
    .click();
  const generatedResponse = await generated;
  expect(generatedResponse.status()).toBe(202);
  const generatedReport = await generatedResponse.json();
  await expect
    .poll(
      async () => {
        const r = await (
          await page.request.get(`/api/v1/reports/${generatedReport.id}`)
        ).json();
        return r.state;
      },
      {
        timeout: 35000,
        message: "The compiled Workflow must produce and store a real PDF",
      },
    )
    .toBe("completed");
  await navigate(page, "Parseller ve analiz");
  await expect(page.locator(".parcel-map")).toHaveCount(1);
  await page.getByRole("button", { name: "Parsel çiz", exact: true }).click();
  await expect(page.locator(".inline-parcel-editor")).toBeVisible();
  await expect(page.locator(".parcel-map")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Düzenlemeyi iptal et" }).click();
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-map.png`,
    fullPage: true,
  });
  await navigate(page, "Hesap ve işletme");
  await page.getByRole("button", { name: "Oturumlar", exact: true }).click();
  await expect(page.getByText("Bu oturum", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("every workspace menu, responsive screen and record workflow is usable", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("E-posta adresiniz")
    .fill(`${info.project.name}@example.invalid`);
  await page
    .getByLabel("Şifreniz", { exact: true })
    .fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".studio-workspace")).toBeAttached();
  for (const [id, name] of [
    ["fields", "Parseller ve analiz"],
    ["history", "Analiz geçmişi"],
    ["weather", "Hava durumu"],
    ["tasks", "Takvim & görevler"],
    ["finance", "Maliyet yönetimi"],
    ["reports", "Raporlar"],
    ["integrations", "Veri bağlantıları"],
    ["settings", "Hesap ve işletme"],
  ]) {
    await navigate(page, name!);
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(".studio-content h1").first()).toBeVisible();
    await expect(
      page.getByText("Bu alanın yeni araçları hazırlanıyor."),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      `overflow in ${id}`,
    ).toBe(true);
    await page.screenshot({
      path: `data/browser-results/${info.project.name}-${id}.png`,
      fullPage: true,
    });
  }
  await page.goBack();
  await expect(page).toHaveURL(/#integrations$/);
  await page.goForward();
  await expect(page).toHaveURL(/#settings$/);
  await page.reload();
  await expect(page.locator(".studio-content h1")).toHaveText(
    "Hesap ve işletme",
  );
  for (const tab of [
    "Tercihler",
    "Güvenlik",
    "Oturumlar",
    "İşletme",
    "Abonelik",
  ]) {
    await page
      .locator(".business-settings > .weather-period-tabs")
      .getByRole("button", { name: tab, exact: true })
      .click();
    await expect(
      page.locator(".business-settings-section").first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      `settings ${tab}`,
    ).toBe(true);
  }
  await page.getByRole("button", { name: /^Bildirimler:/ }).click();
  await expect(page.locator(".studio-content h1")).toHaveText("Bildirimler");
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-notifications.png`,
    fullPage: true,
  });
  await navigate(page, "Hava durumu");
  await page
    .getByRole("button", { name: "Geçmiş veriler", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Geçmiş hava verileri", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-historical-weather.png`,
    fullPage: true,
  });
  await navigate(page, "Parseller ve analiz");
  await page
    .locator(".view-switch")
    .getByRole("button", { name: "Liste", exact: true })
    .click();
  await expect(page.locator(".field-comparison-table")).toBeVisible();
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-field-list.png`,
    fullPage: true,
  });
  await page.locator(".field-comparison-table .metric-link").first().click();
  await expect(page.locator(".analysis-page")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Özel dönem analizi", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `data/browser-results/${info.project.name}-field-analysis.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Hızlı erişim", exact: true }).click();
  await page.getByLabel("Tarla veya modül ara").fill("Maliyet");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Maliyet yönetimi/ })
    .click();
  await expect(page).toHaveURL(/#finance$/);

  const cases = [
    {
      tab: null,
      kind: "cost",
      values: {
        date: "2026-10-20",
        title: "EXPLICIT COST TEST",
        amountMinor: "123,45",
      },
    },
    {
      tab: "Sezon planı",
      kind: "season",
      values: { name: "EXPLICIT SEASON TEST", sowingDate: "2026-10-20" },
    },
    {
      tab: "Besleme",
      kind: "nutrition",
      values: {
        date: "2026-10-20",
        product: "EXPLICIT INPUT TEST",
        amountKg: "3.5",
      },
    },
    {
      tab: "Koruma",
      kind: "protection",
      values: { date: "2026-10-20", observation: "EXPLICIT OBSERVATION TEST" },
    },
    {
      tab: "Toprak analizi",
      kind: "soil",
      values: {
        date: "2026-10-20",
        laboratory: "EXPLICIT LAB TEST",
        reportReference: "TEST-001",
        method: "EXPLICIT METHOD",
        depthCm: "20",
        "measurement.parameter": "pH",
        "measurement.value": "7.1",
        "measurement.unit": "pH",
      },
    },
    {
      tab: "Değerlendirme",
      kind: "evaluation",
      values: { date: "2026-10-20", observation: "EXPLICIT EVALUATION TEST" },
    },
  ];
  for (const item of cases) {
    if (item.tab) {
      await navigate(page, "Sezon ve saha");
      await page
        .locator(".business-operation-tabs")
        .getByRole("button", { name: item.tab, exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Yeni kayıt", exact: true }).click();
    const dialog = page.getByRole("dialog");
    for (const [name, value] of Object.entries(item.values)) {
      await dialog.locator(`[name="${name}"]`).fill(value!);
    }
    await page.screenshot({
      path: `data/browser-results/${info.project.name}-${item.kind}-form.png`,
      fullPage: true,
    });
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/v1/records/${item.kind}`) &&
        r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Kaydı kaydet", exact: true })
      .click();
    expect((await created).status(), `create ${item.kind}`).toBe(201);
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Kaydı düzenle", exact: true }),
    ).toHaveCount(1);
    await page.getByLabel("Kayıtlarda ara").fill("IMPOSSIBLE-NO-MATCH");
    await expect(page.getByText("Aramana uygun kayıt yok.")).toBeVisible();
    await page.getByRole("button", { name: "Aramayı temizle" }).click();
    await page
      .getByRole("button", { name: "Kaydı kaldır", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Vazgeç", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Kaydı düzenle", exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Kaydı kaldır", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Kaydı kaldır", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Kaydı düzenle", exact: true }),
    ).toHaveCount(0);
  }
  await navigate(page, "Genel bakış");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(page.locator(".mission-deck")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      `overview at ${width}`,
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  await navigate(page, "Sezon ve saha");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
