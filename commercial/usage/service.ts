import { and, eq, inArray, sql } from "drizzle-orm";
import type { CommercialDb } from "../db/store";
import { subscriptions, usageReservations } from "../db/schema";
import { DomainError } from "../core/errors";
import { uid } from "../organizations/service";
export async function reserveUsage(
  db: CommercialDb,
  orgId: string,
  key: string,
  kind: "analysis" | "assistant" | "report",
  units = 1,
  now = new Date(),
) {
  if (!Number.isSafeInteger(units) || units <= 0)
    throw new DomainError("INVALID_USAGE", "Kullanım miktarı geçersiz.");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from organizations where id=${orgId} for update`,
    );
    const [existing] = await tx
      .select()
      .from(usageReservations)
      .where(
        and(
          eq(usageReservations.organizationId, orgId),
          eq(usageReservations.idempotencyKey, key),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.kind !== kind || existing.units !== units)
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "İşlem anahtarı farklı bir kullanım için ayrılmış.",
          409,
        );
      return existing;
    }
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .limit(1);
    if (
      !subscription ||
      subscription.state !== "active" ||
      !subscription.periodEnd ||
      subscription.periodEnd <= now
    )
      throw new DomainError(
        "SUBSCRIPTION_REQUIRED",
        "Geçerli abonelik gerekli.",
        402,
      );
    const period = subscription.periodEnd.toISOString();
    const reserved = await tx
      .select()
      .from(usageReservations)
      .where(
        and(
          eq(usageReservations.organizationId, orgId),
          eq(usageReservations.period, period),
          eq(usageReservations.kind, kind),
          inArray(usageReservations.state, ["reserved", "consumed"]),
        ),
      );
    const used = reserved.reduce((sum, row) => sum + row.units, 0),
      limit = subscription.limits[kind];
    if (!Number.isSafeInteger(limit) || limit! < 0)
      throw new DomainError(
        "PLAN_LIMIT_UNAVAILABLE",
        "Paketin kullanım kotası tanımlanmamış. Destekle iletişime geçin.",
        503,
      );
    if (limit! < used + units)
      throw new DomainError(
        "QUOTA_EXCEEDED",
        "Paketin kullanım sınırına ulaşıldı.",
        429,
      );
    const [row] = await tx
      .insert(usageReservations)
      .values({
        id: uid(),
        organizationId: orgId,
        idempotencyKey: key,
        kind,
        units,
        period,
        state: "reserved",
      })
      .returning();
    return row!;
  });
}
export async function settleUsage(
  db: CommercialDb,
  orgId: string,
  id: string,
  outcome: "consumed" | "released",
) {
  const [row] = await db
    .update(usageReservations)
    .set({ state: outcome, settledAt: new Date() })
    .where(
      and(
        eq(usageReservations.id, id),
        eq(usageReservations.organizationId, orgId),
        eq(usageReservations.state, "reserved"),
      ),
    )
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(usageReservations)
    .where(
      and(
        eq(usageReservations.id, id),
        eq(usageReservations.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!existing)
    throw new DomainError("NOT_FOUND", "Kullanım kaydı bulunamadı.", 404);
  if (existing.state !== outcome)
    throw new DomainError(
      "USAGE_FINALIZED",
      "Kullanım kaydı daha önce farklı sonuçla kapatıldı.",
      409,
    );
  return existing;
}
