import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { openDatabase } from "./database.js";
import handler from "./vercel-entry.js";

const host = "agromax-preview.example";

async function request(path, { body, cookie, origin = `https://${host}`, parsed = false } = {}) {
  const req = Readable.from(body && !parsed ? [JSON.stringify(body)] : []);
  req.url = `/api?__agromax_route=${path}`;
  req.method = body ? "POST" : "GET";
  req.headers = { host, origin, ...(cookie ? { cookie } : {}) };
  if (parsed) {
    req.query = { __agromax_route: path };
    req.body = body;
  }
  const headers = new Headers();
  let data;
  const res = {
    statusCode: 200,
    setHeader: (key, value) => headers.set(key, value),
    end: (value) => { data = JSON.parse(value); },
  };
  await handler(req, res);
  return { status: res.statusCode, headers, data };
}

test("Vercel preview login uses the same session store as authenticated routes", async () => {
  Object.assign(process.env, {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    AGROMAX_EPHEMERAL_PREVIEW_DATABASE: "true",
    AGROMAX_WORKSPACE_ENABLED: "false",
  });
  delete process.env.DATABASE_URL;

  assert.equal((await request("runtime")).status, 200);
  const user = { name: "Preview QA", email: "preview@example.invalid", password: "preview-only-qa-password" };
  assert.equal((await request("register", { body: user, origin: "https://other.example" })).status, 403);
  const registration = await request("register", { body: user, parsed: true });
  assert.equal(registration.status, 200);
  const login = await request("login", { body: user });
  assert.equal(login.status, 200);
  assert.equal(login.data.id, registration.data.id);
  const session = login.headers.get("set-cookie");
  assert.match(session, /; Secure; HttpOnly; SameSite=Strict;/);
  const cookie = session.split(";")[0];
  assert.equal((await request("me", { cookie })).data.id, registration.data.id);
  assert.deepEqual((await request("records", { cookie })).data, []);
  assert.equal((await request("logout", { cookie, body: {} })).status, 200);
  assert.equal((await request("me", { cookie })).status, 401);

  process.env.VERCEL_ENV = "production";
  await assert.rejects(openDatabase(), /Persistent DATABASE_URL is required/);
});
