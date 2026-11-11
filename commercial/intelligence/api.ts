import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { WorkspaceRequest } from "../core/api";
import { DomainError } from "../core/errors";
import { analysisClaims, auditLog, domainRecords } from "../db/schema";
import { requirePermission, uid } from "../organizations/service";
import { ownField } from "../records/service";
import { geometryHash } from "../../server/analysis-jobs.js";
import { fieldClaims, publishProjectedClaims } from "./claims";

const investigationKind = "claim_investigation";
export async function intelligenceRoutes({ db, context, path, method }: WorkspaceRequest) {
  const match = path.match(/^\/api\/v1\/fields\/([a-f0-9]{32})\/claims(?:\/([a-f0-9]{32})\/investigation)?$/);
  if (!match) return;
  const [, fieldId, claimId] = match;
  if (!fieldId) return;
  requirePermission(context, claimId && method === "POST" ? "record.write" : "read");
  const field = await ownField(db, context, fieldId);
  const organizationId = context.organization.id;
  const geometryVersion = geometryHash(field.geometry);
  if (!claimId && method === "GET") {
    if (context.actor.authentication === "legacy-session")
      await publishProjectedClaims(db, organizationId, fieldId);
    const [claims, investigations] = await Promise.all([
      fieldClaims(db, organizationId, fieldId),
      db.select().from(domainRecords).where(and(
        eq(domainRecords.organizationId, organizationId),
        eq(domainRecords.fieldId, fieldId),
        eq(domainRecords.kind, investigationKind),
      )).limit(250),
    ]);
    return Response.json({ claims, investigations, geometryVersion }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!claimId || method !== "POST") return;
  return db.transaction(async (tx) => {
    const [claim] = await tx.select().from(analysisClaims).where(and(
      eq(analysisClaims.id, claimId),
      eq(analysisClaims.organizationId, organizationId),
      eq(analysisClaims.fieldId, fieldId),
    ));
    if (!claim) throw new DomainError("NOT_FOUND", "İddia bulunamadı.", 404);
    if (claim.geometryVersion !== geometryVersion)
      throw new DomainError("GEOMETRY_CHANGED", "Bu iddia önceki parsel sınırına bağlı.", 409);
    const id = createHash("sha256").update(`investigation:${claimId}`).digest("hex").slice(0, 32);
    const [created] = await tx.insert(domainRecords).values({
      id, organizationId, fieldId,
      kind: investigationKind,
      createdBy: context.actor.id,
      data: {
        claimId, state: "draft", metric: claim.metric, geometryVersion: claim.geometryVersion,
        priority: claim.evidence.anomaly ? "high" : "normal",
        checks: ["Parsel sınırını ve gözlem tarihlerini kontrol et.", "Aynı döneme ait saha gözlemi kaydet."],
      },
    }).onConflictDoNothing().returning();
    if (created) {
      await tx.insert(auditLog).values({
        id: uid(), organizationId, actorId: context.actor.id,
        resourceId: id, action: "claim_investigation.created",
      });
    }
    return Response.json({ id, claimId }, { status: created ? 201 : 200 });
  });
}
