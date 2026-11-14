import { test, expect } from "@playwright/test";

test("visitors enter directly and can only access their own parcels", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  await expect(page.getByRole("button", { name: "Platforma giriş yap" })).toHaveCount(0);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.guest).toBe(true);
  const field = await page.request.post("/api/records", { data: { kind: "field", name: "Misafir test parseli", geometry: { type: "Polygon", coordinates: [[[27.5,38.5],[27.501,38.5],[27.501,38.501],[27.5,38.501],[27.5,38.5]]] } } });
  expect(field.status(), await field.text()).toBe(201);
  const { id } = await field.json();
  await page.reload();
  await expect(page.locator(".fw-overview-section")).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).id).toBe(me.id);
  expect((await (await page.request.get("/api/records")).json()).some((record: {id: string}) => record.id === id)).toBe(true);
  const separate = await browser.newContext({ baseURL: "http://127.0.0.1:5182" });
  try {
    const other = await (await separate.request.post("/api/guest", { data: {} })).json();
    expect(other.id).not.toBe(me.id);
    expect((await (await separate.request.get("/api/records")).json()).some((record: {id: string}) => record.id === id)).toBe(false);
    expect((await separate.request.get("/api/platform/fields/" + id)).status()).toBe(404);
  } finally { await separate.close(); }
});
