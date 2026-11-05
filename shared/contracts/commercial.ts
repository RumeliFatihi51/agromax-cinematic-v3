import { z } from "zod";
import { isISODate } from "../dates.js";
import { metrics, observationAngles } from "../metrics.js";
export const roleSchema = z.enum(["owner", "manager", "worker", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
export const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const localDate = z.iso
  .date()
  .refine(isISODate, "Invalid calendar date");
export const organizationInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("TR"),
    locale: z.enum(["tr", "en"]).default("tr"),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Invalid IANA time zone")
      .default("Europe/Istanbul"),
  })
  .strict();
export const preferencesInput = z
  .object({
    locale: z.enum(["tr", "en"]).optional(),
    timezone: organizationInput.shape.timezone.optional(),
    areaUnit: z.enum(["decare", "hectare", "sqm"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    emailNotifications: z.boolean().optional(),
    metricFavorites: z
      .array(
        z
          .string()
          .refine(
            (v) => [...metrics, ...observationAngles].some((m) => m.id === v),
            "Unsupported metric",
          ),
      )
      .max(60)
      .transform((v) => [...new Set(v)])
      .optional(),
  })
  .strict();
export interface Provenance {
  kind:
    | "measurement"
    | "forecast"
    | "model_estimate"
    | "calculated"
    | "user_statement";
  source: string;
  observedAt: string | null;
  fetchedAt: string;
  methodVersion: string;
  units: Record<string, string>;
  geometryVersion?: string;
  quality: {
    state: "valid" | "insufficient" | "unverified";
    reasons: string[];
  };
}
export const evaluationStates = [
  "pending",
  "in_review",
  "evaluated",
  "needs_field_observation",
] as const;
const baseEvent = {
  fieldId: identifier,
  date: localDate,
  notes: z.string().max(4000).default(""),
};
export const domainSchemas = {
  season: z
    .object({
      fieldId: identifier,
      name: z.string().trim().min(1).max(100),
      crop: z.enum(["wheat", "maize", "other"]),
      cropName: z.string().max(100).default(""),
      sowingDate: localDate,
      harvestDate: localDate.nullable().default(null),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
    })
    .strict()
    .refine(
      (v) => !v.harvestDate || v.harvestDate >= v.sowingDate,
      "Harvest precedes sowing",
    ),
  irrigation: z
    .object({
      ...baseEvent,
      state: z.enum(["planned", "applied"]),
      volumeM3: z.number().finite().positive(),
      method: z.enum(["drip", "sprinkler", "surface", "other"]),
      durationHours: z.number().finite().positive().nullable().default(null),
      source: z.literal("user_statement").default("user_statement"),
    })
    .strict(),
  nutrition: z
    .object({
      ...baseEvent,
      state: z.enum(["planned", "applied"]),
      product: z.string().trim().min(1).max(150),
      amountKg: z.number().finite().positive(),
      nitrogenPercent: z.number().min(0).max(100).nullable().default(null),
      phosphorusPercent: z.number().min(0).max(100).nullable().default(null),
      potassiumPercent: z.number().min(0).max(100).nullable().default(null),
      source: z.literal("user_statement").default("user_statement"),
    })
    .strict(),
  protection: z
    .object({
      ...baseEvent,
      state: z.enum(["observation", "planned", "applied"]),
      observation: z.string().trim().min(1).max(4000),
      product: z.string().max(150).default(""),
      amount: z.number().finite().positive().nullable().default(null),
      unit: z.enum(["L", "kg", "g", "mL"]).nullable().default(null),
      labelReference: z.string().max(500).default(""),
      source: z.literal("user_statement").default("user_statement"),
    })
    .strict()
    .refine(
      (v) => (v.amount === null) === (v.unit === null),
      "Amount and unit are required together",
    ),
  cost: z
    .object({
      ...baseEvent,
      category: z.enum([
        "seed",
        "irrigation",
        "fertilizer",
        "protection",
        "labor",
        "equipment",
        "other",
      ]),
      title: z.string().trim().min(1).max(150),
      amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      currency: z.enum(["TRY", "EUR", "USD", "GBP", "PLN", "RON"]),
      source: z.literal("user_statement").default("user_statement"),
    })
    .strict(),
  soil: z
    .object({
      ...baseEvent,
      laboratory: z.string().trim().min(1).max(150),
      reportReference: z.string().trim().min(1).max(200),
      method: z.string().trim().min(1).max(200),
      depthCm: z.number().positive().max(300),
      measurements: z
        .array(
          z
            .object({
              parameter: z.string().min(1).max(100),
              value: z.number().finite(),
              unit: z.string().min(1).max(50),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      source: z.literal("user_statement").default("user_statement"),
    })
    .strict(),
  evaluation: z
    .object({
      ...baseEvent,
      analysisId: identifier.nullable().default(null),
      state: z.enum(evaluationStates),
      observation: z.string().trim().min(1).max(4000),
    })
    .strict(),
};
export type DomainKind = keyof typeof domainSchemas;
export const domainKind = z.enum([
  "season",
  "irrigation",
  "nutrition",
  "protection",
  "cost",
  "soil",
  "evaluation",
]);
