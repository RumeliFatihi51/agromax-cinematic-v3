import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { CommercialDb } from "../db/store";
import type { Context } from "../organizations/service";
import { requirePermission } from "../organizations/service";
import { ownField } from "../records/service";
import { domainRecords, methodValidations } from "../db/schema";
import { identifier } from "../../shared/contracts/commercial";
import {
  referenceEt0,
  irrigationBalance,
  fertilizerMass,
  labelQuantity,
} from "./engine";
import { validateGeometry } from "../../shared/geometry.js";
import { geometryHash } from "../../server/analysis-jobs.js";
const methods = {
  irrigation: { method: "irrigation", version: "fao56-single-kc-balance-v1" },
  nutrition: { method: "nutrition", version: "nutrient-product-mass-v1" },
  protection: { method: "protection", version: "label-area-quantity-v1" },
};
export async function calculate(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
) {
  requirePermission(ctx, "calculate");
  const data = z
    .object({
      kind: z.enum(["irrigation", "nutrition", "protection"]),
      fieldId: identifier,
      seasonId: identifier,
      inputs: z.record(z.string(), z.unknown()),
    })
    .strict()
    .parse(input);
  const field = await ownField(db, ctx, data.fieldId),
    [season] = await db
      .select()
      .from(domainRecords)
      .where(
        and(
          eq(domainRecords.id, data.seasonId),
          eq(domainRecords.organizationId, ctx.organization.id),
          eq(domainRecords.fieldId, data.fieldId),
          eq(domainRecords.kind, "season"),
          isNull(domainRecords.deletedAt),
        ),
      );
  const issues: string[] = [];
  if (!field.geometry) issues.push("Parsel sınırı eksik.");
  if (!season) issues.push("Bu parsele ait sezon kaydı gerekli.");
  const crop = String(season?.data.crop || ""),
    country = String(season?.data.countryCode || "");
  if (!["wheat", "maize"].includes(crop))
    issues.push("Otomatik hesap kapsamı buğday ve mısırla sınırlı.");
  const definition = methods[data.kind];
  const [validation] = await db
    .select()
    .from(methodValidations)
    .where(
      and(
        eq(methodValidations.method, definition.method),
        eq(methodValidations.version, definition.version),
        eq(methodValidations.crop, crop),
        eq(methodValidations.countryCode, country),
      ),
    );
  const validated =
    validation?.state === "validated" &&
    !!validation.validatedAt &&
    validation.validatedAt <= new Date() &&
    !!validation.expiresAt &&
    validation.expiresAt > new Date() &&
    !!validation.evidence.referenceReport &&
    !!validation.evidence.fieldProtocol &&
    !!validation.evidence.reviewer;
  if (!validated)
    issues.push(
      "Bu ürün/bölge için bağımsız referans ve saha doğrulaması tamamlanmadı.",
    );
  if (issues.length)
    return {
      status: "unavailable",
      result: null,
      issues,
      methodVersion: definition.version,
    };
  try {
    const geometry = validateGeometry(field.geometry),
      areaM2 = geometry.area * 1000;
    const result =
      data.kind === "irrigation"
        ? irrigationBalance(data.inputs, areaM2)
        : data.kind === "nutrition"
          ? fertilizerMass(data.inputs)
          : labelQuantity(data.inputs, areaM2);
    return {
      status: "calculated",
      result,
      issues: [],
      methodVersion: definition.version,
      fieldId: field.id,
      geometryVersion: geometryHash(field.geometry),
      seasonVersion: season!.version,
      validationId: validation!.id,
      provenance: {
        kind: "calculated",
        inputKind: "user_statement",
        calculatedAt: new Date().toISOString(),
        countryCode: country,
        crop,
      },
    };
  } catch (error) {
    return {
      status: "insufficient_input",
      result: null,
      issues:
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
          : [
              error instanceof Error
                ? error.message
                : "Girdiler hesap için uygun değil.",
            ],
      methodVersion: definition.version,
    };
  }
}
