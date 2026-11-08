import test from "node:test";
import assert from "node:assert/strict";
import { transactionalMail } from "./mail";

test("transactional mail requires a configured sender and an acknowledged delivery request", async () => {
  assert.equal(transactionalMail({ AGROMAX_RESEND_API_KEY: "fixture" }), undefined);
  const requestKeys: (string | null)[] = [];
  const adapter = transactionalMail({
    AGROMAX_RESEND_API_KEY: "fixture",
    AGROMAX_MAIL_FROM: "accounts@example.invalid",
  }, async (url, request) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(request?.redirect, "error");
    assert.deepEqual(JSON.parse(String(request?.body)).to, ["account@example.invalid"]);
    requestKeys.push(new Headers(request?.headers).get("Idempotency-Key"));
    return Response.json(requestKeys.length === 1 ? { id: "fixture-id" } : {}, {
      status: requestKeys.length === 1 ? 200 : 502,
    });
  })!;
  const message = {
    to: "account@example.invalid",
    subject: "Fixture verification",
    text: "Explicit isolated message",
    kind: "verification",
  } as const;
  await adapter.deliver(message);
  await assert.rejects(() => adapter.deliver(message), /doğrulanamadı/);
  assert.ok(requestKeys[0]);
  assert.equal(requestKeys[0], requestKeys[1]);
});
