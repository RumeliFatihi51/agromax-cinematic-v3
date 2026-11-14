import { expect, test } from "@playwright/test";

test("plant catalog, film and photo inspection are usable", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  expect((await page.request.get("/api/v1/plants/inspect")).status()).toBe(401);
  await page.goto("/?account=existing");
  await page.getByLabel("E-posta adresiniz").fill(`${info.project.name}@example.invalid`);
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Menüyü aç" }).click();
  await page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("button", { name: "Bitki Tanıma" }).click();
  await expect(page).toHaveURL(/#plant-studio$/);
  await expect(page.getByRole("heading", { name: "Bitki Tanıma." })).toBeVisible();
  await expect(page.getByText("Fotoğraf incelemesi için görüntü destekli Filiz modeli yapılandırılmalı.")).toBeVisible();
  expect((await page.request.post("/api/v1/plants/inspect", { data: { image: "" } })).status()).toBe(503);
  await page.locator(".plant-studio").screenshot({ path: info.outputPath("bitki-tanima.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Videoyu oynat" }).click();
  await expect(page.getByRole("button", { name: "Videoyu duraklat" })).toBeVisible();
  await page.getByRole("button", { name: "Videoyu duraklat" }).click();
  await expect(page.getByRole("button", { name: "Videoyu oynat" })).toBeVisible();
  await page.getByRole("button", { name: "Fotoğrafla başla" }).click();
  await expect(page.locator("#plant-scan-title")).toBeFocused();
  await expect(page).toHaveURL(/#plant-studio$/);

  const search = page.getByRole("searchbox", { name: "Katalogda ara" });
  await search.fill("bugday");
  await expect(page.getByRole("heading", { name: "Ekmeklik buğday" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Makarnalık buğday/ })).toBeVisible();
  await page.getByRole("button", { name: "Hastalık ve belirtiler" }).click();
  await search.fill("kullemE");
  const powdery = page.locator(".plant-health details").filter({ hasText: "Külleme" });
  await powdery.locator("summary").click();
  await expect(powdery.getByText(/unumsu örtü/)).toBeVisible();
  await powdery.getByRole("button", { name: "Arpa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Arpa", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Tümü", exact: true }).click();
  await search.fill("Lavandula");
  await expect(page.getByRole("heading", { name: "Lavanta", exact: true })).toBeVisible();
  await search.fill("eşleşmeyen-test");
  await expect(page.getByText("Bu aramayla eşleşen yerel bitki profili bulunamadı.")).toBeVisible();
  for (const width of info.project.name === "mobile" ? [360, 390, 768] : [1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator(".plant-studio").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize(info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 960 });

  await page.route("**/api/v1/plants/inspect", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { available: true } });
    const { image } = route.request().postDataJSON();
    expect(image.length).toBeLessThanOrEqual(240_000);
    expect(Buffer.from(image, "base64").subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    return route.fulfill({ json: {
      status: "reviewed", summary: "Yalnızca tarayıcı testi için örnek sonuç.",
      plant: { commonName: "Domates", scientificName: "Solanum lycopersicum", evidence: "Test eşleşmesi", confidence: "possible" },
      observations: ["Test gözlemi."], causes: [],
      care: { traits: "Test özellikleri.", irrigation: "Test sulama.", nutrition: "Test besleme.", soil: "Test toprak." },
      nextPhotos: ["Test çekimi."], model: "explicit-browser-fixture",
    } });
  });
  await page.reload();
  await expect(page.getByText("Fotoğraf incelemesi açık")).toBeVisible();
  const photo = page.getByLabel("Bitki fotoğrafı dosyası");
  await photo.setInputFiles({ name: "not-a-photo.webp", mimeType: "image/webp", buffer: Buffer.from("invalid") });
  await expect(page.getByRole("alert").filter({ hasText: "Fotoğraf açılamadı" })).toBeVisible();
  await photo.setInputFiles("public/visuals/films/tarim2/leaf.webp");
  const result = page.getByRole("article", { name: "Fotoğraf inceleme sonucu" });
  await expect(result.getByText("Yalnızca tarayıcı testi için örnek sonuç.")).toBeVisible();
  await expect(result.getByText("Test sulama.")).toBeVisible();
  await result.getByRole("button", { name: "Katalogdaki Domates kaydını aç" }).click();
  await expect(page.locator("#plant-profile-heading")).toHaveText("Domates");
  await page.getByRole("button", { name: "Fotoğrafı kaldır" }).click();
  await expect(result).toHaveCount(0);
  expect(errors).toEqual([]);
});
