import { waitUntil } from "@vercel/functions";
import { createApplication } from "./application.js";

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
  } catch (error) {
    console.error("Application initialization failed.", {
      name: typeof error?.name === "string" ? error.name : "unknown",
      code: typeof error?.code === "string" ? error.code : "unknown",
      workspaceEnabled: process.env.AGROMAX_WORKSPACE_ENABLED === "true",
      databaseConfigured: !!process.env.AGROMAX_DATABASE_URL,
      databaseMatches: process.env.AGROMAX_DATABASE_URL === process.env.DATABASE_URL,
    });
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
