// All users, email messages and fields are explicit, isolated PostgreSQL fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createStore } from "./db/store";
import { createCommercialApplication } from "./app";
import { memberships, user } from "./db/schema";
const baseURL = "http://localhost:5180";
test("commercial API preserves tenant/role boundaries, exact costs, optimistic locking and real account lifecycle", async () => {
  const store = await createStore({ migrate: true });
  const messages: { to: string; text: string; kind: string }[] = [];
  const app = await createCommercialApplication({
    store,
    baseURL,
    secret: "isolated-fixture-secret-not-for-production-123456789",
    rateLimit: false,
    enforceQuota: false,
    mail: {
      deliver: async (message) => {
        messages.push(message);
      },
    },
  });
  async function request(
    path: string,
    body?: unknown,
    cookie = "",
    method = body === undefined ? "GET" : "POST",
    org = "",
  ) {
    const response = await app.handle(
      new Request(baseURL + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: baseURL,
          Cookie: cookie,
          ...(org ? { "X-Organization-ID": org } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const data = await response.json();
    return {
      response,
      data,
      cookie: response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    };
  }
  try {
    assert.equal((await request("/api/v1/bootstrap")).response.status, 401);
    const credentials = {
      name: "Explicit fixture A",
      email: "a@example.invalid",
      password: "fixture-password-123456",
    };
    const a = await request("/api/register", credentials);
    assert.equal(a.response.status, 200, JSON.stringify(a.data));
    assert.ok(a.cookie);
    assert.equal(messages.length, 1);
    const boot = await request("/api/v1/bootstrap", undefined, a.cookie);
    assert.equal(boot.data.onboardingRequired, true);
    const org = await request(
      "/api/v1/organizations",
      { name: "Isolated workspace A" },
      a.cookie,
    );
    assert.equal(org.response.status, 201);
    const b = await request("/api/register", {
      ...credentials,
      name: "Fixture B",
      email: "b@example.invalid",
    });
    await request(
      "/api/v1/organizations",
      { name: "Isolated workspace B" },
      b.cookie,
    );
    assert.equal(
      (await request("/api/records", undefined, b.cookie, "GET", org.data.id))
        .response.status,
      404,
    );
    const field = await request(
      "/api/records",
      {
        kind: "field",
        name: "Isolated parcel",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [27, 38],
              [27.001, 38],
              [27.001, 38.001],
              [27, 38.001],
              [27, 38],
            ],
          ],
        },
      },
      a.cookie,
    );
    assert.equal(field.response.status, 201, JSON.stringify(field.data));
    const platformInput = {
      fieldId: field.data.id, kind: "scenario", name: "Isolated platform scenario",
      payload: { waterM3: 10, waterUnitCost: 2, fertilizerKg: 0, fertilizerUnitCost: 0, laborHours: 1, laborHourlyCost: 100, otherCost: 0, currency: "TRY", assumptions: "Test" },
    };
    const platformBoot = await request("/api/platform/bootstrap", undefined, a.cookie);
    assert.equal(platformBoot.data.ownership, "organization");
    const platformSaved = await request("/api/platform/records", platformInput, a.cookie);
    assert.equal(platformSaved.response.status, 201, JSON.stringify(platformSaved.data));
    assert.equal(platformSaved.data.record.calculation.totalMinor, 12000);
    assert.equal(platformSaved.data.record.createdBy, a.data.id);
    assert.equal((await request(`/api/platform/records/${platformSaved.data.record.id}`, undefined, b.cookie)).response.status, 404);
    const cost = {
      fieldId: field.data.id,
      date: "2026-11-01",
      category: "seed",
      title: "Isolated cost fixture",
      amountMinor: 101,
      currency: "TRY",
    };
    const saved = await request("/api/v1/records/cost", cost, a.cookie);
    assert.equal(saved.response.status, 201, JSON.stringify(saved.data));
    await request(
      "/api/v1/records/cost",
      { ...cost, amountMinor: 202, currency: "EUR" },
      a.cookie,
    );
    const summary = await request("/api/v1/costs/summary", undefined, a.cookie);
    assert.deepEqual(summary.data.totals, [
      { currency: "EUR", amountMinor: 202 },
      { currency: "TRY", amountMinor: 101 },
    ]);
    assert.equal(summary.data.exchangeConversion, null);
    assert.equal(
      (
        await request(
          `/api/v1/records/cost/${saved.data.id}`,
          { version: 999, data: cost },
          a.cookie,
          "PATCH",
        )
      ).response.status,
      409,
    );
    assert.equal(
      (
        await request(
          "/api/v1/records/cost",
          { ...cost, fieldId: "other-field" },
          b.cookie,
        )
      ).response.status,
      404,
    );
    await store.db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.userId, a.data.id));
    assert.equal((await request("/api/platform/records", platformInput, a.cookie)).response.status, 403);
    assert.equal((await request(`/api/platform/fields/${field.data.id}`, undefined, a.cookie)).response.status, 200);
    assert.equal(
      (await request("/api/v1/records/cost", cost, a.cookie)).response.status,
      403,
    );
    assert.equal(
      (
        await request(
          "/api/records",
          { kind: "field", name: "Denied", area: 1 },
          a.cookie,
        )
      ).response.status,
      403,
    );
    assert.equal(
      (await request("/api/records", undefined, a.cookie)).data.length,
      1,
    );
    const crossOrigin = await app.handle(
      new Request(baseURL + "/api/v1/records/cost", {
        method: "POST",
        headers: {
          Origin: "https://other.invalid",
          Cookie: a.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cost),
      }),
    );
    assert.equal(crossOrigin.status, 403);
    const verifyURL = messages
      .find((m) => m.to === credentials.email && m.kind === "verification")!
      .text.match(/https?:\/\/[^\s]+/)![0];
    const verification = await app.handle(new Request(verifyURL));
    assert.ok([200, 302].includes(verification.status));
    const [verified] = await store.db
      .select()
      .from(user)
      .where(eq(user.id, a.data.id));
    assert.equal(verified!.emailVerified, true);
    assert.equal(
      (
        await request(
          "/api/auth/request-password-reset",
          { email: credentials.email, redirectTo: baseURL },
          a.cookie,
        )
      ).response.status,
      200,
    );
    const resetURL = messages
      .find((m) => m.kind === "password_reset")!
      .text.match(/https?:\/\/[^\s]+/)![0];
    const resetToken = new URL(resetURL).pathname.split("/").pop()!;
    const reset = await request("/api/auth/reset-password", {
      token: resetToken,
      newPassword: "new-fixture-password-123456",
    });
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data));
    assert.equal(
      (await request("/api/me", undefined, a.cookie)).response.status,
      401,
    );
    assert.equal(
      (await request("/api/login", credentials)).response.status,
      401,
    );
    const signedIn = await request("/api/login", {
      ...credentials,
      password: "new-fixture-password-123456",
    });
    assert.equal(signedIn.response.status, 200);
    await request("/api/logout", {}, signedIn.cookie);
    assert.equal(
      (await request("/api/me", undefined, signedIn.cookie)).response.status,
      401,
    );
  } finally {
    await app.legacy.jobs.waitForIdle();
    await store.close();
  }
});
test("unconfigured email is a real unavailable state and never claims delivery or creates a user", async () => {
  const store = await createStore({ migrate: true });
  try {
    const app = await createCommercialApplication({
      store,
      baseURL,
      secret: "isolated-fixture-secret-not-for-production-123456789",
      rateLimit: false,
    });
    const response = await app.handle(
      new Request(baseURL + "/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Fixture",
          email: "unconfigured@example.invalid",
          password: "fixture-password-123456",
        }),
      }),
    );
    assert.equal(response.status, 503);
    assert.equal((await store.db.select().from(user)).length, 0);
  } finally {
    await store.close();
  }
});
