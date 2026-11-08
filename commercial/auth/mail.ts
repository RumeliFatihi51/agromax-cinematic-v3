import { createHash } from "node:crypto";
import type { TransactionalMail } from "./service";

export function transactionalMail(
  env = process.env,
  fetcher: typeof fetch = fetch,
): TransactionalMail | undefined {
  const key = env.AGROMAX_RESEND_API_KEY?.trim();
  const from = env.AGROMAX_MAIL_FROM?.trim();
  if (!key || !from) return undefined;

  return {
    async deliver({ to, subject, text, kind }) {
      const body = JSON.stringify({ from, to: [to], subject, text });
      const idempotencyKey = createHash("sha256").update(body).digest("hex");
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `agromax-${kind}-${idempotencyKey}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.id !== "string" || !result.id)
        throw new Error("İşlem e-postası gönderimi doğrulanamadı.");
    },
  };
}
