import { waitUntil } from "@vercel/functions";

let application;

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://localhost");
    const route = req.query?.__agromax_route ?? url.searchParams.get("__agromax_route");
    if (typeof route === "string") {
      url.pathname = `/api/${route}`;
      url.searchParams.delete("__agromax_route");
      url.searchParams.delete("path");
      req.url = url.pathname + url.search;
    }
    const { createApplication } = await import("./application.js");
    application ??= createApplication({ background: waitUntil }).catch((error) => {
      application = undefined;
      throw error;
    });
    await (await application).handle(req, res);
  } catch (error) {
    console.error("Application initialization failed.", {
      name: typeof error?.name === "string" ? error.name : "unknown",
      code: typeof error?.code === "string" ? error.code : "unknown",
    });
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "Sunucu bağlantısı kurulamadı. Tekrar deneyin." }));
  }
}
