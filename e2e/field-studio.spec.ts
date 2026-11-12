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
  await page.goto("/#field-studio?field=" + id);
  const studio = page.getByRole("region", { name: "3D Saha Stüdyosu" });
  await expect(studio.locator(".maplibregl-canvas")).toBeVisible({ timeout: 18000 });
  await expect(studio.getByLabel("Saha stüdyosu parseli")).toHaveValue(id);
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
  await expect(studio.getByText("3D saha kontrolü " + info.project.name)).toBeVisible();
  await studio.getByRole("button", { name: "Paneli kapat" }).click();
  await studio.getByRole("button", { name: "Doğal renk", exact: true }).click();
  await expect(studio.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await studio.screenshot({ path: info.outputPath("studio.png"), animations: "disabled" });

  await page.goto("/#platform?field=" + id);
  const atlas = page.getByRole("region", { name: "Üç boyutlu arazi atlası" });
  await expect(atlas.locator(".maplibregl-canvas")).toBeVisible();
  await atlas.getByRole("button", { name: "3D Saha Stüdyosu" }).click();
  await expect(studio).toBeVisible();
  expect(esri).toEqual([]);
  expect(errors).toEqual([]);
});
