import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createStore } from "../db/store";
import { user, subscriptions, farmRecords } from "../db/schema";
import { createOrganization, resolveContext } from "../organizations/service";
import { saveField } from "./service";
test("field geometry and versions are computed on the server and area quotas cannot be bypassed by user area values", async () => {
  const store = await createStore({ migrate: true });
  try {
    const actor = {
      id: "field-fixture",
      name: "Explicit quota fixture",
      email: "field@example.invalid",
      emailVerified: true,
    };
    await store.db.insert(user).values(actor);
    const org = await createOrganization(store.db, actor, {
        name: "Isolated field fixture",
      }),
      ctx = await resolveContext(store.db, actor, org.id);
    await store.db.insert(subscriptions).values({
      organizationId: org.id,
      state: "active",
      periodEnd: new Date("2099-01-01T00:00:00Z"),
      limits: { areaM2: 20000, fields: 1 },
    });
    const input = {
      name: "Explicit field",
      area: 0.00001,
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
    };
    const field = await saveField(store.db, ctx, input, true);
    assert.equal(field.version, 1);
    const stored = JSON.parse(
      (await store.db.select().from(farmRecords))[0]!.body,
    );
    assert.ok(stored.area > 1);
    await assert.rejects(() => saveField(store.db, ctx, input, true), /sınırı/);
    const updated = await saveField(
      store.db,
      ctx,
      { name: "Updated fixture", version: 1 },
      true,
      { id: field.id, action: "update" },
    );
    assert.equal(updated.version, 2);
    await assert.rejects(
      () =>
        saveField(store.db, ctx, { name: "Stale fixture", version: 1 }, true, {
          id: field.id,
          action: "update",
        }),
      /değişti/,
    );
    const removed = await saveField(store.db, ctx, { version: 2 }, true, {
      id: field.id,
      action: "delete",
    });
    await store.db
      .update(subscriptions)
      .set({ limits: { areaM2: 1, fields: 1 } })
      .where(eq(subscriptions.organizationId, org.id));
    await assert.rejects(
      () =>
        saveField(store.db, ctx, { version: removed.version }, true, {
          id: field.id,
          action: "restore",
        }),
      /sınırı/,
    );
    await assert.rejects(
      () => saveField(store.db, { ...ctx, role: "viewer" }, input, false),
      /yetkiniz/,
    );
  } finally {
    await store.close();
  }
});
