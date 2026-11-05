import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store";
import { user, account } from "../db/schema";
import { encryptedBackup, restoreEncryptedBackup } from "./backup";
test("encrypted backups restore exact PostgreSQL records, reject tampering and refuse nonempty targets", async () => {
  const source = await createStore({ migrate: true }),
    target = await createStore({ migrate: true });
  try {
    await source.db.insert(user).values({
      id: "backup-fixture",
      name: "Explicit backup fixture",
      email: "backup@example.invalid",
    });
    await source.db.insert(account).values({
      id: "backup-account",
      userId: "backup-fixture",
      providerId: "credential",
      accountId: "backup-fixture",
      password: "EXPLICIT SECRET FIXTURE NEVER PLAINTEXT IN BACKUP",
    });
    const key = "isolated-backup-fixture-key-123456789",
      backup = await encryptedBackup(source, key);
    assert.equal(
      backup.bytes.includes(Buffer.from("EXPLICIT SECRET FIXTURE")),
      false,
    );
    await assert.rejects(() =>
      restoreEncryptedBackup(target, backup.bytes, key + "wrong"),
    );
    const corrupted = Buffer.from(backup.bytes);
    corrupted[corrupted.length - 1] ^= 1;
    await assert.rejects(() => restoreEncryptedBackup(target, corrupted, key));
    const result = await restoreEncryptedBackup(target, backup.bytes, key);
    assert.equal(result.recordsVerified, 2);
    assert.equal(
      (await target.db.select().from(account))[0]!.password,
      "EXPLICIT SECRET FIXTURE NEVER PLAINTEXT IN BACKUP",
    );
    await assert.rejects(
      () => restoreEncryptedBackup(target, backup.bytes, key),
      /must be empty/,
    );
  } finally {
    await source.close();
    await target.close();
  }
});
