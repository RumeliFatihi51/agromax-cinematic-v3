import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store";
import { createOrganization, resolveContext } from "../organizations/service";
import { user } from "../db/schema";
import { plantRoutes } from "./api";
import { DomainError } from "../core/errors";

// Small, plain JPEG for validating the upload transport, with a synthetic provider response.
const jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABkAGQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAIE/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AhwEMYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//Z";
test("plant inspection sends a validated image and enforces an organization rate limit", async () => {
  const baseURL = "http://127.0.0.1:5180";
  const store = await createStore({ migrate: true });
  const actor = { id: "explicit-plant-test", name: "Plant fixture", email: "plant@example.invalid", emailVerified: true };
  const path = "/api/v1/plants/inspect";
  const url = new URL(path, baseURL);
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    AGROMAX_FILIZ_ENABLED: "true",
    AGROMAX_FILIZ_PROVIDER: "gemini",
    AGROMAX_FILIZ_MODEL: "gemini-2.5-flash",
    GOOGLE_GENERATIVE_AI_API_KEY: "explicit-plant-provider-fixture",
  })) {
    originalEnv.set(key, process.env[key]);
    process.env[key] = value;
  }
  let calls = 0;
  try {
    await store.db.insert(user).values(actor);
    const organization = await createOrganization(store.db, actor, { name: "Isolated plant workspace" });
    const context = await resolveContext(store.db, actor, organization.id);
    const fixture = {
      status: "reviewed", summary: "Explicit fixture for plant photo tests.",
      plant: { commonName: "Domates", scientificName: "Solanum lycopersicum", evidence: "Fixture", confidence: "possible" },
      observations: ["Fixture observation."], causes: [], care: null, nextPhotos: [],
    };
    globalThis.fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(target.hostname, "generativelanguage.googleapis.com");
      assert.match(target.pathname, /gemini-2\.5-flash:generateContent$/);
      const sent = JSON.parse(String(init?.body)).contents.flatMap((message: { parts: unknown[] }) => message.parts);
      assert.ok(sent.some((part: { inlineData?: { mimeType: string; data: string } }) =>
        part.inlineData?.mimeType === "image/jpeg" && part.inlineData.data === jpeg));
      calls++;
      return Response.json({
        candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(fixture) }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 42, totalTokenCount: 92 },
      });
    };
    const route = (image: string, role = context.role, method = "POST") => plantRoutes({
      db: store.db, context: { ...context, role }, body: { image },
      options: { store, baseURL, secret: "isolated-fixture-only" },
      request: new Request(url, { method }), url, path, method,
    });
    assert.equal((await (await route("", context.role, "GET"))?.json()).available, true);
    assert.equal((await (await route("", "viewer", "GET"))?.json()).available, false);
    const hasCode = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
    await assert.rejects(route(jpeg, "viewer"), hasCode("FORBIDDEN"));
    await assert.rejects(route(Buffer.from("plain text, no JPEG").toString("base64")), hasCode("INVALID_IMAGE"));
    const oversized = Buffer.from(jpeg, "base64");
    const frame = oversized.indexOf(Buffer.from([0xff, 0xc0]));
    assert.ok(frame > 0);
    oversized.writeUInt16BE(1281, frame + 7);
    await assert.rejects(route(oversized.toString("base64")), hasCode("INVALID_IMAGE"));
    assert.equal(calls, 0);
    const response = await route(jpeg);
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("cache-control"), "private, no-store");
    assert.equal((await response?.json()).plant.commonName, "Domates");
    const burst = await Promise.allSettled(Array.from({ length: 8 }, () => route(jpeg)));
    assert.equal(burst.filter(item => item.status === "fulfilled").length, 7);
    assert.ok(burst.some(item => item.status === "rejected" && hasCode("PLANT_SCAN_LIMIT")(item.reason)));
    assert.equal(calls, 8);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await store.close();
  }
});
