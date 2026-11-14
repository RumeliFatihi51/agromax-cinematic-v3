import { expect, test } from "@playwright/test";

test("sample twin changes water timing and energy costs and opens a parcel draft", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("E-posta adresiniz").fill("upgrade@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).click();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await page.goto("/#twin");
  await page.getByRole("button", { name: "Örnek ikizler", exact: true }).click();
  const gallery = page.getByRole("region", { name: "Örnek dijital ikizler" });
  await expect(gallery.getByText("Su açığı ilk kez 3. günde ayrışıyor.")).toBeVisible();
  await gallery.getByLabel("Plan B sulama günü").selectOption("3");
  await expect(gallery.getByText("İki planın modeldeki su açığı aynı.")).toBeVisible();
  await gallery.getByRole("button", { name: "Pompa ve bütçe" }).click();
  const energy = gallery.getByRole("row", { name: /^Enerji/ });
  const initial = await energy.innerText();
  await gallery.getByLabel(/Elektrik fiyatı/).fill("8");
  await expect(energy).not.toHaveText(initial);
  await gallery.getByRole("button", { name: "3D sahneyi aç" }).click();
  await expect(gallery.getByRole("region", { name: "Temsili tarla etüdü" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Bitki sıralarına yaklaş" })).toBeVisible();
  await gallery.getByRole("button", { name: "Plan B taslağını aç" }).click();
  await expect(page.getByRole("dialog").getByLabel("Dosya adı")).toHaveValue("Pompa ve bütçe · Plan B");
  await expect(page.getByRole("dialog").getByLabel("Enerji birim fiyatı / kWh")).toHaveValue("8");
});
