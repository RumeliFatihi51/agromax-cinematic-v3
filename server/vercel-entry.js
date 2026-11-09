import { waitUntil } from "@vercel/functions";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

let application;
const previewUsers = new Map();
const reply = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};
async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return null; }
}
async function handleEphemeralPreview(req, res, url) {
  if (url.pathname === "/api/runtime" && req.method === "GET") {
    reply(res, 200, { runtime: "prototype", workspaceEnabled: false, emailConfigured: false, salesEnabled: false });
    return true;
  }
  if (!["/api/login", "/api/register"].includes(url.pathname) || req.method !== "POST") return false;
  const body = await readBody(req), email = String(body?.email || "").trim().toLowerCase(), password = String(body?.password || "");
  if (!/^[^ @]+@[^ @]+\.[^ @]+$/.test(email) || password.length < 12 || password.length > 256) {
    reply(res, 400, { error: "Geçerli e-posta ve en az 12 karakterli şifre gerekli." }); return true;
  }
  let user = previewUsers.get(email);
  if (url.pathname === "/api/register") {
    const name = String(body.name || "").trim();
    if (!name || name.length > 100) { reply(res, 400, { error: "Adınızı girin." }); return true; }
    if (user) { reply(res, 409, { error: "Bu e-posta ile kayıt oluşturulamıyor." }); return true; }
    const salt = randomBytes(16).toString("hex");
    user = { id: randomBytes(16).toString("hex"), name, email, password: `${salt}:${scryptSync(password, salt, 64).toString("hex")}` };
    previewUsers.set(email, user);
  } else {
    if (!user) { reply(res, 401, { error: "E-posta veya şifre hatalı." }); return true; }
    const [salt, hash] = user.password.split(":");
    if (!timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"))) { reply(res, 401, { error: "E-posta veya şifre hatalı." }); return true; }
  }
  res.setHeader("Set-Cookie", `session=${randomBytes(32).toString("hex")}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
  reply(res, 200, { id: user.id, name: user.name, email: user.email });
  return true;
}
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "https://localhost");
    if (process.env.AGROMAX_EPHEMERAL_PREVIEW_DATABASE === "true" && await handleEphemeralPreview(req, res, url)) return;
    const route = req.query?.__agromax_route ?? url.searchParams.get("__agromax_route");
    if (typeof route === "string") { url.pathname = `/api/${route}`; url.searchParams.delete("__agromax_route"); url.searchParams.delete("path"); req.url = url.pathname + url.search; }
    const { createApplication } = await import("./application.js");
    application ??= createApplication({ background: waitUntil }).catch((error) => { application = undefined; throw error; });
    await (await application).handle(req, res);
  } catch (error) {
    console.error("Application initialization failed.", { name: typeof error?.name === "string" ? error.name : "unknown", code: typeof error?.code === "string" ? error.code : "unknown" });
    reply(res, 503, { error: "Sunucu bağlantısı kurulamadı. Tekrar deneyin." });
  }
}
