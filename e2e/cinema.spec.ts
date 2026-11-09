import { expect, test, type Page } from "@playwright/test";
import { modules } from "../src/features/modules";

async function scene(page: Page, id: string) {
  const art = page.locator(`[data-scene="${id}"] > .workspace-scene-art`);
  await expect(art).toBeVisible();
  await expect(page.locator("main h1:visible").first()).toBeVisible();
  return art;
}

async function checkLayout(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const sidebar = document.querySelector(".studio-sidebar")?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth + 2 &&
      (innerWidth < 1024 || (sidebar && main && main.left + 2 >= sidebar.right));
  })).toBe(true);
}

async function checkMapDock(page: Page) {
  await expect.poll(() => page.locator(".map-workbench .map-control-deck").evaluate((dock) => {
    const controls = [...dock.querySelectorAll(":scope > *")].map((control) => control.getBoundingClientRect());
    return controls.length === 3 && controls.every((a, index) =>
      controls.slice(index + 1).every((b) => a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1),
    );
  })).toBe(true);
}

test("promo films select a lightweight phone cut and keep a poster when motion is unavailable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Checks both video renditions in one browser session.");
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookie) throw new Error("Missing isolated test account cookie");
  await page.context().addCookies(cookie.split("; ").map((pair) => {
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1),
      url: "http://127.0.0.1:5182", httpOnly: true, sameSite: "Lax" as const };
  }));

  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [route, file] of [["overview", "dawn"], ["assistant", "leaf"], ["twin", "relief"], ["satellite", "orbit"], ["weather", "wind"]]) {
    await page.goto(`/?film-check=1#${route}`);
    await expect(page.locator("main h1:visible").first()).toBeVisible();
    const film = page.locator("main .scene-film");
    const video = film.locator("video");
    await expect(video).toHaveAttribute("src", `/visuals/films/tarim2/${file}.mp4`);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    await expect(video).toHaveClass("is-playing");
    expect(await video.evaluate((element: HTMLVideoElement) => element.duration)).toBeLessThanOrEqual(4.1);
    if (route === "overview") {
      await expect.poll(() => page.locator(".dashboard-v3 [data-enter]").evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).opacity === "1"))).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`${route}-film.png`) });
  }
  const weatherFilm = page.locator("main .scene-film");
  await weatherFilm.evaluate((element) => { element.style.display = "none"; });
  await expect.poll(() => weatherFilm.locator("video").evaluate((video: HTMLVideoElement) => video.paused && !video.ended)).toBe(true);
  await weatherFilm.evaluate((element) => { element.style.display = ""; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("main .scene-film video")).toHaveCount(0);
  await expect(page.locator("main .scene-film img")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const requestedFilms: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) requestedFilms.push(new URL(request.url()).pathname);
  });
  await page.goto("/?film-check=2#assistant");
  const phoneFilm = page.locator("main .scene-film");
  const phoneVideo = phoneFilm.locator("video");
  await expect(phoneFilm.locator("img")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(phoneVideo).toHaveAttribute("src", "/visuals/films/tarim2/leaf-mobile.mp4");
  await expect.poll(() => phoneVideo.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  expect(await phoneVideo.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(384);
  expect(requestedFilms.length).toBeGreaterThan(0);
  expect(requestedFilms.every((path) => path.endsWith("/leaf-mobile.mp4"))).toBe(true);
  await page.screenshot({ path: info.outputPath("filiz-phone-film.png") });
  await checkLayout(page);

  await page.route("**/leaf-mobile.mp4", (route) => route.abort());
  await Promise.all([
    page.waitForRequest("**/leaf-mobile.mp4"),
    page.goto("/?film-check=error#assistant"),
  ]);
  await expect(phoneFilm.locator("img")).toBeVisible();
  await expect(phoneVideo).toHaveCount(0);
  await page.unroute("**/leaf-mobile.mp4");

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      value: Object.assign(new EventTarget(), { saveData: true, effectiveType: "4g" }),
    });
  });
  const previousRequests = requestedFilms.length;
  await page.goto("/?film-check=save-data#assistant");
  await expect(phoneFilm.locator("img")).toBeVisible();
  await expect(phoneVideo).toHaveCount(0);
  expect(requestedFilms).toHaveLength(previousRequests);
});

test("every route and subview has a responsive Manrope scene", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Captures desktop, tablet and phone widths in a single authenticated session.");
  test.setTimeout(230_000);
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookie) throw new Error("Missing isolated test account cookie");
  await page.context().addCookies(cookie.split("; ").map((pair) => {
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1),
      url: "http://127.0.0.1:5182", httpOnly: true, sameSite: "Lax" as const };
  }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const routeOverrides: Record<string, string> = { operations: "operations-seasons" };

  async function capture(name: string, width: number) {
    await page.evaluate(() => document.fonts.ready);
    await checkLayout(page);
    await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: "disabled" });
  }
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const [id] of modules) {
      await page.goto(`/?scene-audit=${width}#${id}`);
      if (id === "overview") await expect(page.locator(".dashboard-v3 h1")).toBeVisible();
      else await scene(page, id === "fields" ? (width === 390 ? "fields-map" : "fields-atlas") : routeOverrides[id] || id);
      if (id === "twin") await expect(page.locator(".px-twin-visual .parcel-map")).toBeVisible();
      await capture(id, width);
    }
    await page.goto(`/?scene-audit=${width}#operations`);
    for (const [name, id] of [["Sulama", "irrigation"], ["Besleme", "nutrition"], ["Koruma", "protection"],
      ["Toprak analizi", "soil"], ["Değerlendirme", "evaluations"]]) {
      await page.locator(".business-operation-tabs").getByRole("button", { name, exact: true }).click();
      await scene(page, `operations-${id}`);
      await capture(`operations-${id}`, width);
    }
    await page.goto(`/?scene-audit=${width}#settings`);
    for (const [name, id] of [["Tercihler", "preferences"], ["Güvenlik", "security"], ["Oturumlar", "sessions"], ["İşletme", "team"], ["Abonelik", "billing"]]) {
      await page.locator(".business-settings .weather-period-tabs").getByRole("button", { name, exact: true }).click();
      await scene(page, `settings-${id}`);
      await capture(`settings-${id}`, width);
    }
    await page.goto(`/?scene-audit=${width}#weather`);
    await page.getByRole("button", { name: "Geçmiş veriler" }).click();
    await scene(page, "weather-history");
    await capture("weather-history", width);
    await page.goto(`/?scene-audit=${width}#fields`);
    for (const [name, id] of [["Atlas", "atlas"], ["Harita", "map"], ["Liste", "list"]]) {
      await page.locator(".view-switch").getByRole("button", { name, exact: true }).click();
      await scene(page, `fields-${id}`);
      if (id !== "list") await checkMapDock(page);
      if (id === "atlas") {
        await expect(page.locator(".parcel-atlas-layout .parcel-map")).toBeVisible();
        await expect(page.locator(".parcel-atlas-layout .field-comparison-table")).toBeVisible();
      }
      await capture(`fields-${id}`, width);
    }
    await page.locator(".field-comparison-table .metric-link").first().click();
    await expect(page.locator("[data-scene=field-detail] .analysis-page")).toBeVisible();
    await capture("field-detail", width);
    await page.goto(`/?scene-audit=${width}#reports`);
    await page.getByRole("button", { name: "Önizle", exact: true }).first().click();
    await expect(page.locator("[data-scene=report-preview] .report-paper")).toBeVisible();
    await page.locator(".report-paper").scrollIntoViewIfNeeded();
    await capture("report-preview", width);
  }
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    for (const [id] of modules) {
      await page.goto(`/?scene-audit=${width}#${id}`);
      await expect(page.locator("main h1:visible").first()).toBeVisible();
      await capture(id, width);
    }
  }
  expect(modules).toHaveLength(26);
  const typography = await page.evaluate(async () => {
    await document.fonts.load("750 26px Manrope", "ÇĞİÖŞÜ çğıöşü 1234567890");
    return {
      font: getComputedStyle(document.querySelector("main h1")!).fontFamily,
      faces: [...document.fonts].filter(({ family, status }) => family === "Manrope" && status === "loaded").length,
    };
  });
  expect(typography.font).toContain("Manrope");
  expect(typography.faces).toBe(1);

  for (const width of [360]) {
    await page.setViewportSize({ width, height: 850 });
    for (const [id] of modules) {
      await page.goto(`/?scene-audit=${width}#${id}`);
      await expect(page.locator("main h1:visible").first()).toBeVisible();
      await checkLayout(page);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const motionExamples = [
    ["satellite", "scan"], ["assistant", "mask"], ["platform", "panels"], ["temporal", "shift"],
    ["weather", "drift"], ["intelligence", "focus"], ["contradictions", "split"],
    ["investigation", "unfold"], ["history", "stack"], ["economics", "scale"], ["twin", "trace"],
  ];
  for (const [id, motion] of motionExamples) {
    await page.goto(`/?scene-motion=1#${id}`);
    const art = await scene(page, id);
    await expect(art).toHaveAttribute("data-motion", motion);
    for (const [name, time] of [["start", 0], ["middle", 125], ["end", 260]] as const) {
      const animationCount = await art.evaluate((node, currentTime) => {
        const animations = node.getAnimations({ subtree: true });
        for (const animation of animations) {
          animation.pause();
          animation.currentTime = currentTime;
        }
        return animations.length;
      }, time);
      expect(animationCount).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath(`${id}-motion-${name}.png`) });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const lastArt = await scene(page, "twin");
  await expect.poll(() => lastArt.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?scene-cuts=1#operations");
  await scene(page, "operations-seasons");
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (this.matches("main h1, .cinema-route-cut")) animation.pause();
      return animation;
    };
  });
  const irrigation = page.locator(".business-operation-tabs").getByRole("button", { name: "Sulama", exact: true });
  await irrigation.focus();
  await irrigation.press("Enter");
  await expect(irrigation).toBeFocused();
  await scene(page, "operations-irrigation");
  const title = page.locator("main h1:visible").first();
  for (const [name, time] of [["start", 0], ["middle", 115], ["end", 234]] as const) {
    const sampled = await title.evaluate((element, currentTime) => {
      const [animation] = element.getAnimations();
      if (!animation) return false;
      animation.currentTime = currentTime;
      return true;
    }, time);
    expect(sampled).toBe(true);
    await page.screenshot({ path: info.outputPath(`irrigation-title-${name}.png`) });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => title.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const breadcrumb = page.locator(".studio-breadcrumb strong");
  await page.getByRole("button", { name: "Agromax ana ekran" }).click();
  await expect(breadcrumb).toHaveText("Genel bakış");
  const curtain = page.locator(".cinema-route-cut");
  await expect.poll(() => curtain.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation) return null;
    animation.currentTime = 180;
    return animation.effect?.getTiming().duration;
  })).toBe(420);
  await page.screenshot({ path: info.outputPath("green-curtain.png") });
  await page.goBack();
  await expect(breadcrumb).toHaveText("Sezon ve saha");
  expect(errors).toEqual([]);
});

test("Filiz source reveal and empty workspace are truthful", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One isolated browser fixture for state transitions.");
  const cookie = process.env.AGROMAX_BROWSER_UPGRADE_COOKIE;
  if (!cookie) throw new Error("Missing isolated test account cookie");
  await page.context().addCookies(cookie.split("; ").map((pair) => {
    const separator = pair.indexOf("=");
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1),
      url: "http://127.0.0.1:5182", httpOnly: true, sameSite: "Lax" as const };
  }));
  await page.route("**/api/v1/assistant/status", (route) => route.fulfill({ json: { modelAvailable: true, reason: null } }));
  await page.route("**/api/v1/assistant/ask", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ consent: true, question: "Çiğ ölçümü var mı?" });
    await route.fulfill({ json: { introduction: "EXPLICIT TEST ANSWER",
      facts: [{ id: "explicit-fixture", text: "EXPLICIT TEST FACT", source: "record:explicit-browser-fixture", kind: "calculated" }],
      limitations: "EXPLICIT TEST LIMITATION" } });
  });
  await page.goto("/#assistant");
  await page.getByRole("button", { name: "Son gözlemleri özetle" }).click();
  await expect(page.getByRole("textbox", { name: "Sorun" })).toBeFocused();
  await page.getByRole("textbox", { name: "Sorun" }).fill("Çiğ ölçümü var mı?");
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: "Kaynaklı yanıt al" }).click();
  const conversation = page.getByRole("log", { name: "Filiz sohbeti" });
  await expect(conversation.locator(".filiz-chat-question")).toContainText("Çiğ ölçümü var mı?");
  await expect(conversation.locator(".filiz-answer")).toContainText("record:explicit-browser-fixture");
  await expect(page.getByRole("textbox", { name: "Sorun" })).toHaveValue("");
  await page.screenshot({ path: info.outputPath("filiz-sourced-answer.png") });
  await page.route("**/api/v1/assistant/facts?*", (route) => route.fulfill({
    status: 503, json: { error: "EXPLICIT SOURCE LOAD ERROR" },
  }));
  await page.goto("/?source-error=1#assistant");
  await expect(page.locator(".filiz-source-drawer").getByRole("alert")).toContainText("EXPLICIT SOURCE LOAD ERROR");
  await expect(page.getByText("Kaynaklar yükleniyor…")).toHaveCount(0);
  await page.unroute("**/api/v1/assistant/facts?*");

  await page.route("**/api/satellite/status", (route) => route.fulfill({ json: { configured: false, provider: "cdse" } }));
  await page.goto("/?provider-test=1#fields");
  await expect(page.getByRole("button", { name: "Tüm analizleri güncelle" })).toBeDisabled();
  await page.locator(".field-comparison-table .metric-link").first().click();
  const fieldURL = new URL(page.url());
  expect(new URLSearchParams(fieldURL.hash.split("?")[1]).get("field")).toBeTruthy();
  await expect(page.getByRole("button", { name: "Uydu verilerini güncelle" })).toBeDisabled();
  await page.getByRole("button", { name: "NDMI", exact: true }).click();
  await expect(page).toHaveURL(/metric=NDMI/);
  await page.reload();
  await expect(page.locator("#analysis-trend-title")).toContainText("NDMI");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Parsellerim", exact: true })).toBeVisible();
  await page.unroute("**/api/satellite/status");

  const longName = "ÇiğÖlçümüŞubat".repeat(9);
  await page.route("**/api/records", async (route) => {
    const response = await route.fetch();
    const records = await response.json();
    await route.fulfill({ response, json: records.map((record: { kind: string }) =>
      record.kind === "field" ? { ...record, name: longName } : record,
    ) });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/?scene-long-name=1#fields");
  await page.locator(".view-switch").getByRole("button", { name: "Liste", exact: true }).click();
  await page.locator(".field-comparison-table .metric-link").first().click();
  await expect(page.locator(".analysis-heading h1")).toHaveText(longName);
  await checkLayout(page);
  await page.screenshot({ path: info.outputPath("long-parcel-360.png") });
  await page.unroute("**/api/records");

  await page.route("**/api/records", (route) => route.fulfill({ json: [] }));
  await page.goto("/?scene-empty=1#overview");
  await expect(page.getByRole("button", { name: "İlk parselinizi çizin" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("overview-empty.png") });
  await page.goto("/?scene-empty=2#fields");
  await page.locator(".map-workbench").getByRole("button", { name: "Parsellere odaklan" }).click();
  await expect(page.locator(".map-notice")).toContainText("önce bir parsel sınırı çizin");
});

test("touch controls open the parcel map and the Filiz source drawer", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Uses the touch-enabled browser project.");
  await page.goto("/");
  await expect(page.locator(".observation-auth-scene img")).toBeVisible();
  const portalVideo = page.locator(".observation-auth-scene video");
  await expect.poll(() => portalVideo.evaluate((video: HTMLVideoElement) => video.loop && video.currentTime > 0)).toBe(true);
  await portalVideo.evaluate((video: HTMLVideoElement) => { video.currentTime = video.duration - 0.15; });
  await expect.poll(() => portalVideo.evaluate((video: HTMLVideoElement) => !video.paused && video.currentTime < 2)).toBe(true);
  await page.getByRole("button", { name: "Videoyu duraklat" }).tap();
  await expect.poll(() => portalVideo.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await page.getByRole("button", { name: "Videoyu oynat" }).tap();
  await expect(page.locator(".observation-auth-inscription h1")).toHaveCSS("color", "rgb(243, 244, 233)");
  await expect(page.locator(".observation-auth-form h2")).toHaveCSS("color", "rgb(243, 244, 233)");
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "Yeni bir bakış aç." })).toBeVisible();
  await page.getByRole("button", { name: "Giriş yap", exact: true }).tap();
  await page.getByLabel("E-posta adresiniz").fill("mobile@example.invalid");
  await page.getByLabel("Şifreniz", { exact: true }).fill("browser-fixture-password-123");
  await page.getByRole("button", { name: "Platforma giriş yap" }).tap();
  await page.locator(".canopy-mobile-dock").getByRole("button", { name: "Parseller" }).tap();
  await expect(page.locator("[data-scene=fields-map] .parcel-map")).toBeVisible();
  await page.locator(".view-switch").getByRole("button", { name: "Atlas" }).tap();
  await expect(page.locator("[data-scene=fields-atlas]")).toBeVisible();
  await checkMapDock(page);
  await page.route("**/api/places/search", (route) => route.fulfill({
    json: { results: [{ id: "explicit-browser-fixture", name: "EXPLICIT TEST LOCATION", lat: 39.1, lng: 34.9 }] },
  }));
  const map = page.locator(".map-workbench");
  await map.getByRole("button", { name: "Harita", exact: true }).tap();
  await expect(map.getByRole("button", { name: "Harita", exact: true })).toHaveAttribute("aria-pressed", "true");
  await map.getByRole("textbox", { name: "Haritada yer ara" }).fill("Test konumu");
  await map.getByRole("button", { name: "Ara", exact: true }).tap();
  await map.getByRole("button", { name: /EXPLICIT TEST LOCATION/ }).tap();
  await expect(map.getByRole("textbox", { name: "Haritada yer ara" })).toHaveValue("EXPLICIT TEST LOCATION");
  await page.locator(".canopy-mobile-dock").getByRole("button", { name: "Filiz" }).tap();
  await expect.poll(() => page.locator(".filiz-stage").evaluate((stage) => {
    const frame = stage.getBoundingClientRect();
    const status = stage.querySelector(".filiz-stage-status")?.getBoundingClientRect();
    return !!status && status.bottom <= frame.bottom && status.right <= frame.right;
  })).toBe(true);
  const sources = page.locator(".filiz-source-drawer");
  const toggle = sources.locator("summary");
  await expect(sources).toHaveAttribute("open", "");
  await toggle.tap();
  await expect(sources).not.toHaveAttribute("open", "");
  await toggle.tap();
  await expect(sources.locator(".business-fact").first()).toBeVisible();
  await page.getByRole("button", { name: "Menüyü aç" }).tap();
  await page.locator(".platform-nav-group summary").filter({ hasText: "Operasyon ve uygulama" }).tap();
  await page.getByRole("button", { name: "Sezon ve saha", exact: true }).tap();
  const operations = page.locator(".business-operation-tabs");
  const evaluation = operations.getByRole("button", { name: "Değerlendirme", exact: true });
  await evaluation.tap();
  await expect(evaluation).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-scene=operations-evaluations]")).toBeVisible();
  await checkLayout(page);
  await page.goto("/#scenarios");
  const editorArt = await scene(page, "scenarios");
  await expect(editorArt.locator("img")).toBeVisible();
  await expect(editorArt.locator("video")).toHaveCount(0);
});
