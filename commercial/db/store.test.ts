import test from "node:test";
import assert from "node:assert/strict";
import { createStore, legacyDomainAdapter } from "./store";
import { user, memberships } from "./schema";
import {
  createOrganization,
  resolveContext,
  requirePermission,
} from "../organizations/service";
import { eq } from "drizzle-orm";
test("PostgreSQL migration is idempotent and organization access cannot cross tenants", async () => {
  const store = await createStore({ migrate: true });
  try {
    await store.migrate();
    const actor = {
      id: "fixture-a",
      name: "Explicit test fixture",
      email: "fixture-a@example.invalid",
      emailVerified: true,
    };
    await store.db.insert(user).values(actor);
    await store.db.insert(user).values({
      ...actor,
      id: "fixture-b",
      email: "fixture-b@example.invalid",
    });
    const org = await createOrganization(store.db, actor, {
      name: "Isolated test workspace",
    });
    const ctx = await resolveContext(store.db, actor, org.id);
    assert.equal(ctx.role, "owner");
    await assert.rejects(
      () => resolveContext(store.db, { ...actor, id: "fixture-b" }, org.id),
      (e: unknown) => e instanceof Error && "status" in e && e.status === 404,
    );
    await store.db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.userId, actor.id));
    assert.throws(() =>
      requirePermission({ ...ctx, role: "viewer" }, "field.write"),
    );
    const legacy = legacyDomainAdapter(store);
    await legacy
      .prepare("INSERT INTO records VALUES(?,?,?,?)")
      .run(
        "field-fixture",
        org.id,
        "field",
        JSON.stringify({ name: "Isolated fixture", area: 2 }),
      );
    assert.equal(
      (
        await legacy
          .prepare("SELECT * FROM records WHERE user_id=?")
          .all(org.id)
      ).length,
      1,
    );
    assert.equal(
      (
        await legacy
          .prepare("SELECT * FROM records WHERE user_id=?")
          .all("other-org")
      ).length,
      0,
    );
  } finally {
    await store.close();
  }
});
