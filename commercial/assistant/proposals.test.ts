import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store";
import { user, farmRecords } from "../db/schema";
import { createOrganization, resolveContext } from "../organizations/service";
import { createProposal, decideProposal, answerQuestion } from "./service";
import { calculate } from "../calculations/service";
test("assistant drafts never mutate records before confirmation, duplicate confirmations are idempotent and absent validation cannot produce numbers", async () => {
  const store = await createStore({ migrate: true });
  try {
    const actor = {
      id: "assistant-fixture",
      name: "Explicit fixture",
      email: "assistant@example.invalid",
      emailVerified: true,
    };
    await store.db.insert(user).values(actor);
    const org = await createOrganization(store.db, actor, {
        name: "Isolated assistant fixture",
      }),
      ctx = await resolveContext(store.db, actor, org.id);
    await store.db.insert(farmRecords).values({
      id: "fixture-field",
      organizationId: org.id,
      kind: "field",
      body: JSON.stringify({ name: "Explicit field fixture", area: 1 }),
    });
    const draft = await createProposal(store.db, ctx, {
      kind: "task",
      payload: {
        fieldId: "fixture-field",
        name: "Explicit confirmation fixture",
        date: "2026-11-02",
      },
    });
    assert.equal((await store.db.select().from(farmRecords)).length, 1);
    const first = await decideProposal(store.db, ctx, draft.id, true, false);
    const second = await decideProposal(store.db, ctx, draft.id, true, false);
    assert.equal(first.resultId, second.resultId);
    assert.equal((await store.db.select().from(farmRecords)).length, 2);
    await assert.rejects(
      () =>
        createProposal(
          store.db,
          { ...ctx, role: "viewer" },
          {
            kind: "task",
            payload: {
              fieldId: "fixture-field",
              name: "Forbidden",
              date: "2026-11-02",
            },
          },
        ),
      /yetkiniz/,
    );
    await assert.rejects(
      () =>
        answerQuestion(
          store.db,
          ctx,
          {
            fieldId: "fixture-field",
            question: "Fixture",
            locale: "tr",
            consent: true,
          },
          "fixture-key",
          undefined,
          false,
        ),
      /henüz etkinleştirilmedi/,
    );
    const result = await calculate(store.db, ctx, {
      kind: "irrigation",
      fieldId: "fixture-field",
      seasonId: "missing-season",
      inputs: {},
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.result, null);
    assert.ok(result.issues.length > 0);
  } finally {
    await store.close();
  }
});
