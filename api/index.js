import { waitUntil } from "@vercel/functions";
import { createApplication } from "../server/application.js";

let application;
export default async function handler(req, res) {
  try {
    // Vercel's destination is a single function; retain the public API route.
    const url = new URL(req.url, "https://localhost");
    const route =
      req.query?.__agromax_route ?? url.searchParams.get("__agromax_route");
    if (typeof route === "string") {
      url.pathname = `/api/${route}`;
      url.searchParams.delete("__agromax_route");
      url.searchParams.delete("path");
      req.url = url.pathname + url.search;
    }
    application ??= createApplication({ background: waitUntil }).catch(
      (error) => {
        application = undefined;
        throw error;
      },
    );
    await (await application).handle(req, res);
  } catch {
    console.error("Application initialization failed.");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: "Sunucu bağlantısı kurulamadı. Tekrar deneyin.",
      }),
    );
  }
}
