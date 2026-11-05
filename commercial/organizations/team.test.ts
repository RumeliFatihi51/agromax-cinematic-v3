import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createStore } from "../db/store";
import { user, invitations } from "../db/schema";
import { createOrganization, resolveContext } from "./service";
import { inviteMember, acceptInvitation, changeMember } from "./team";
test("team invitations require the matching verified account, enforce roles, and preserve a final owner", async () => {
  const store = await createStore({ migrate: true });
  try {
    const owner = {
        id: "owner-fixture",
        name: "Owner fixture",
        email: "owner@example.invalid",
        emailVerified: true,
      },
      worker = {
        ...owner,
        id: "worker-fixture",
        email: "worker@example.invalid",
      };
    await store.db.insert(user).values([owner, worker]);
    const org = await createOrganization(store.db, owner, {
        name: "Isolated team fixture",
      }),
      ctx = await resolveContext(store.db, owner, org.id);
    const invite = await inviteMember(store.db, ctx, {
      email: worker.email,
      role: "worker",
    });
    const [stored] = await store.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invite.id));
    assert.notEqual(stored!.tokenHash, invite.token);
    await assert.rejects(
      () => acceptInvitation(store.db, owner, { token: invite.token }),
      /bulunamadı/,
    );
    await assert.rejects(
      () =>
        acceptInvitation(
          store.db,
          { ...worker, emailVerified: false },
          { token: invite.token },
        ),
      /doğrulayın/,
    );
    await acceptInvitation(store.db, worker, { token: invite.token });
    assert.equal(
      (await acceptInvitation(store.db, worker, { token: invite.token }))
        .alreadyAccepted,
      true,
    );
    const workerCtx = await resolveContext(store.db, worker, org.id);
    await assert.rejects(
      () =>
        inviteMember(store.db, workerCtx, {
          email: "other@example.invalid",
          role: "owner",
        }),
      /yetkiniz/,
    );
    await assert.rejects(
      () => changeMember(store.db, ctx, owner.id, { role: null }),
      /son sahibi/,
    );
    await changeMember(store.db, ctx, worker.id, { role: "manager" });
    const manager = await resolveContext(store.db, worker, org.id);
    await assert.rejects(
      () => changeMember(store.db, manager, owner.id, { role: "viewer" }),
      /değiştiremezsiniz/,
    );
    await changeMember(store.db, ctx, worker.id, { role: "owner" });
    await changeMember(store.db, ctx, owner.id, { role: null });
    await assert.rejects(
      () => resolveContext(store.db, owner, org.id),
      /bulunamadı/,
    );
  } finally {
    await store.close();
  }
});
