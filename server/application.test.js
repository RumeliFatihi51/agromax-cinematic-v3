// Isolated in-memory API tests; no real accounts or provider requests.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "./application.js";
import { sqliteDatabase } from "./database.js";

test("HTTP accounts, owner boundaries, parser and durable sessions use the shared cloud/local handler", async () => {
  const db = sqliteDatabase(new DatabaseSync(":memory:"));
  const app = await createApplication({ db });
  const server = http.createServer(app.handle);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, cookie, extra = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
  try {
    assert.equal((await request("/api/records")).status, 401);
    assert.equal(
      (
        await request("/api/register", {}, null, {
          Origin: "https://other.invalid",
        })
      ).status,
      403,
    );
    const malformed = await fetch(base + "/api/register", {
      method: "POST",
      body: "{",
    });
    assert.equal(malformed.status, 400);
    const credentials = {
      name: "Explicit test fixture",
      email: "fixture@example.invalid",
      password: "isolated-fixture-password-123",
    };
    const a = await request("/api/register", credentials);
    assert.equal(a.status, 200);
    assert.match(a.cookie, /HttpOnly/);
    assert.equal(
      (
        await request("/api/login", {
          ...credentials,
          password: "wrong-password-123",
        })
      ).status,
      401,
    );
    const b = await request("/api/register", {
      ...credentials,
      email: "other-fixture@example.invalid",
    });
    assert.deepEqual(
      (await request("/api/records", undefined, a.cookie)).data,
      [],
    );
    const field = await request(
      "/api/records",
      { kind: "field", name: "Isolated parcel", area: 3 },
      a.cookie,
    );
    assert.equal(field.status, 201);
    assert.equal(
      (
        await request(
          `/api/records/${field.data.id}/analysis`,
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    // A separate application instance can read the session and records from storage.
    const restarted = await createApplication({ db });
    const otherServer = http.createServer(restarted.handle);
    await new Promise((resolve) => otherServer.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${otherServer.address().port}/api/records`,
        { headers: { Cookie: a.cookie } },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json())[0].id, field.data.id);
    } finally {
      await new Promise((resolve) => otherServer.close(resolve));
      await restarted.analysisService.waitForIdle();
    }
    await request("/api/logout", {}, a.cookie);
    assert.equal((await request("/api/me", undefined, a.cookie)).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.analysisService.waitForIdle();
    await db.close();
  }
});
