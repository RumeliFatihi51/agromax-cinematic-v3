import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../db/store";
import { user, account, farmPlatformRecords, farmPlatformRevisions } from "../db/schema";
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
    const record = {
      id: "backup-platform-fixture", organizationId: "backup-org-fixture", fieldId: "backup-field-fixture",
      kind: "scenario", name: "Explicit fixture", status: "draft",
      version: 1, body: "{}", createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    await source.db.insert(farmPlatformRecords).values(record);
    await source.db.insert(farmPlatformRevisions).values({
      id: "backup-platform-revision", recordId: record.id, organizationId: record.organizationId,
      version: 1, body: "{}", createdAt: record.createdAt,
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
    assert.equal(result.recordsVerified, 4);
    const [revision] = await target.db.select().from(farmPlatformRevisions);
    assert.equal(revision?.recordId, record.id);
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
