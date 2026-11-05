import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { createStore, type SqlClient } from "./store";
import { importLegacy } from "./import-legacy";
import { createIdentity, verifyMigratedPassword } from "../auth/service";
import { user } from "./schema";
test("legacy import preserves identifiers and exact records, keeps passwords valid and does not forge verification or sessions", async () => {
  const store = await createStore({ migrate: true });
  const password = "isolated-legacy-password-123",
    salt = "00000000000000000000000000000000",
    digest = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const records = {
    id: "legacy-field-fixture",
    user_id: "legacy-owner-fixture",
    kind: "field",
    body: JSON.stringify({
      name: "Explicit migration fixture",
      area: 2,
      areaSource: "user",
    }),
  };
  const source: SqlClient = {
    query: async (sql) => ({
      rows: sql.includes("FROM users")
        ? [
            {
              id: "legacy-owner-fixture",
              name: "Fixture",
              email: "legacy@example.invalid",
              password: digest,
            },
          ]
        : sql.includes("FROM records")
          ? [records]
          : [],
    }),
  };
  try {
    const first = await importLegacy(store, source);
    assert.equal(first.exactRecordsVerified, true);
    assert.equal((await importLegacy(store, source)).alreadyImported, true);
    const [person] = await store.db.select().from(user);
    assert.equal(person!.id, "legacy-owner-fixture");
    assert.equal(person!.emailVerified, false);
    assert.equal(
      await verifyMigratedPassword({
        hash: "legacy-scrypt:" + digest,
        password,
      }),
      true,
    );
    const identity = createIdentity(store, {
      baseURL: "http://localhost:5180",
      secret: "isolated-test-secret-never-used-in-production-12345",
      rateLimit: false,
    });
    const signedIn = await identity.auth.handler(
      new Request("http://localhost:5180/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: person!.email, password }),
      }),
    );
    assert.equal(signedIn.status, 200);
  } finally {
    await store.close();
  }
});
