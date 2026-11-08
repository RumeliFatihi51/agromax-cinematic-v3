import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { domainRecords, reports } from "../db/schema";
import { requirePermission, type Context } from "../organizations/service";
import type { CommercialDb } from "../db/store";
import { fieldClaims } from "./claims";
import { ownField } from "../records/service";

export async function extendedEvidenceBundle(
  db: CommercialDb,
  context: Context,
  fieldId: string,
  legacyBundle: (organizationId: string, fieldId: string) => Promise<Record<string, unknown>>,
) {
  requirePermission(context, "read");
  await ownField(db, context, fieldId);
  const organizationId = context.organization.id;
  const { integrity: _previousDigest, ...base } = await legacyBundle(organizationId, fieldId);
  const [claims, records, reportFiles, modelRuns] = await Promise.all([
    fieldClaims(db, organizationId, fieldId, 100),
    db.select({
      id: domainRecords.id, kind: domainRecords.kind, version: domainRecords.version,
      data: domainRecords.data, updatedAt: domainRecords.updatedAt,
    }).from(domainRecords).where(and(
      eq(domainRecords.organizationId, organizationId),
      eq(domainRecords.fieldId, fieldId),
      inArray(domainRecords.kind, ["season", "irrigation", "nutrition", "protection", "soil", "evaluation", "claim_investigation"]),
      isNull(domainRecords.deletedAt),
    )).orderBy(desc(domainRecords.updatedAt), desc(domainRecords.id)).limit(100),
    db.select({ id: reports.id, completedAt: reports.completedAt, sha256: reports.sha256 })
      .from(reports).where(and(
        eq(reports.organizationId, organizationId), eq(reports.fieldId, fieldId), eq(reports.state, "completed"),
      )).orderBy(desc(reports.completedAt), desc(reports.id)).limit(100),
    db.select({
      id: domainRecords.id, version: domainRecords.version, createdAt: domainRecords.createdAt,
      geometryVersion: sql<string>`${domainRecords.data}->>'geometryVersion'`,
      method: sql<string>`${domainRecords.data}->'result'->>'methodVersion'`,
      calibration: sql<string>`${domainRecords.data}->'result'->>'calibration'`,
    }).from(domainRecords).where(and(
      eq(domainRecords.organizationId, organizationId),
      eq(domainRecords.fieldId, fieldId),
      eq(domainRecords.kind, "water_balance"),
      isNull(domainRecords.deletedAt),
    )).orderBy(desc(domainRecords.createdAt), desc(domainRecords.id)).limit(100),
  ]);
  const content = {
    ...base, schema: "agromax.evidence-bundle.v2",
    claims, measurementsAndInterventions: records, reportFiles, modelRuns,
    limits: { claims: 100, measurementsAndInterventions: 100, reportFiles: 100, modelRuns: 100 },
  };
  return {
    ...content,
    integrity: {
      algorithm: "SHA-256", digest: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
      scope: "Bu paketteki içerik özeti. Bağımsız doğrulama ve dijital imza ayrı işlemlerdir.",
    },
  };
}
