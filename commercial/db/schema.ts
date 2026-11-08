import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
const date = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const user = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: date("expires_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);
export const account = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: date("access_token_expires_at"),
    refreshTokenExpiresAt: date("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_account_identity_idx").on(t.providerId, t.accountId),
    index("auth_account_user_idx").on(t.userId),
  ],
);
export const verification = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expires_at").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  countryCode: text("country_code").notNull().default("TR"),
  locale: text("locale").notNull().default("tr"),
  timezone: text("timezone").notNull().default("Europe/Istanbul"),
  createdAt: date("created_at").notNull().defaultNow(),
});
export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_org_user_idx").on(t.organizationId, t.userId),
    index("membership_user_idx").on(t.userId),
  ],
);
export const invitations = pgTable("organization_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  expiresAt: date("expires_at").notNull(),
  acceptedAt: date("accepted_at"),
  revokedAt: date("revoked_at"),
});
export const preferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" },
  ),
  locale: text("locale").notNull().default("tr"),
  timezone: text("timezone").notNull().default("Europe/Istanbul"),
  areaUnit: text("area_unit").notNull().default("decare"),
  theme: text("theme").notNull().default("light"),
  emailNotifications: boolean("email_notifications").notNull().default(false),
  metricFavorites: jsonb("metric_favorites")
    .notNull()
    .default([])
    .$type<string[]>(),
  onboardingCompletedAt: date("onboarding_completed_at"),
});
export const farmRecords = pgTable(
  "farm_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("user_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
  },
  (t) => [index("farm_records_org_idx").on(t.organizationId, t.kind)],
);
export const farmAnalyses = pgTable("farm_analyses", {
  fieldId: text("field_id")
    .primaryKey()
    .references(() => farmRecords.id, { onDelete: "cascade" }),
  geometryHash: text("geometry_hash"),
  body: text("body").notNull(),
});
export const farmJobs = pgTable(
  "farm_analysis_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("user_id")
      .notNull()
      .references(() => organizations.id),
    fieldId: text("field_id")
      .notNull()
      .references(() => farmRecords.id),
    geometryHash: text("geometry_hash").notNull(),
    snapshot: text("snapshot").notNull(),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    result: text("result"),
    error: text("error"),
  },
  (t) => [index("farm_jobs_org_idx").on(t.organizationId, t.createdAt)],
);
export const farmNotifications = pgTable("farm_notifications", {
  id: text("id").primaryKey(),
  organizationId: text("user_id")
    .notNull()
    .references(() => organizations.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  jobId: text("job_id"),
  fieldId: text("field_id"),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
});
export const farmAudit = pgTable("farm_audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("user_id")
    .notNull()
    .references(() => organizations.id),
  action: text("action").notNull(),
  resourceId: text("resource_id").notNull(),
  createdAt: text("created_at").notNull(),
});
export const domainRecords = pgTable(
  "domain_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    fieldId: text("field_id").references(() => farmRecords.id),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
    deletedAt: date("deleted_at"),
  },
  (t) => [index("domain_records_org_kind_idx").on(t.organizationId, t.kind)],
);
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id),
  actorId: text("actor_id").references(() => user.id),
  action: text("action").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: date("created_at").notNull().defaultNow(),
});
export const usageReservations = pgTable(
  "usage_reservations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    idempotencyKey: text("idempotency_key").notNull(),
    kind: text("kind").notNull(),
    units: integer("units").notNull(),
    state: text("state").notNull(),
    period: text("period").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    settledAt: date("settled_at"),
  },
  (t) => [
    uniqueIndex("usage_org_key_idx").on(t.organizationId, t.idempotencyKey),
    index("usage_org_period_idx").on(t.organizationId, t.period),
  ],
);
export const providerUsage = pgTable("provider_usage", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id"),
  jobId: text("job_id"),
  provider: text("provider").notNull(),
  operation: text("operation").notNull(),
  durationMs: integer("duration_ms").notNull(),
  httpStatus: integer("http_status"),
  requestCount: integer("request_count").notNull().default(1),
  providerUnits: text("provider_units"),
  providerUnitName: text("provider_unit_name"),
  monetaryCost: text("monetary_cost"),
  currency: text("currency"),
  rateSource: text("rate_source"),
  createdAt: date("created_at").notNull().defaultNow(),
});
export const releaseGates = pgTable("release_gates", {
  key: text("key").primaryKey(),
  state: text("state").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  checkedAt: date("checked_at").notNull(),
  reviewedBy: text("reviewed_by").notNull(),
});
export const methodValidations = pgTable(
  "method_validations",
  {
    id: text("id").primaryKey(),
    method: text("method").notNull(),
    version: text("version").notNull(),
    crop: text("crop").notNull(),
    countryCode: text("country_code").notNull(),
    state: text("state").notNull(),
    evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>(),
    validatedAt: date("validated_at"),
    expiresAt: date("expires_at"),
  },
  (t) => [
    uniqueIndex("validated_method_scope_idx").on(
      t.method,
      t.version,
      t.crop,
      t.countryCode,
    ),
  ],
);
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    fieldId: text("field_id")
      .notNull()
      .references(() => farmRecords.id),
    state: text("state").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    objectKey: text("object_key"),
    sha256: text("sha256"),
    error: text("error"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    requestKey: text("request_key").notNull(),
    runId: text("run_id"),
    reservationId: text("reservation_id").references(
      () => usageReservations.id,
    ),
    createdAt: date("created_at").notNull().defaultNow(),
    completedAt: date("completed_at"),
  },
  (t) => [
    uniqueIndex("reports_org_request_idx").on(t.organizationId, t.requestKey),
  ],
);
export const assistantProposals = pgTable("assistant_proposals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  state: text("state").notNull(),
  resultId: text("result_id"),
  createdAt: date("created_at").notNull().defaultNow(),
  expiresAt: date("expires_at").notNull(),
});
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  occurredAt: date("occurred_at").notNull(),
  processedAt: date("processed_at"),
  payloadHash: text("payload_hash").notNull(),
  error: text("error"),
});
export const subscriptions = pgTable("subscriptions", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id),
  providerId: text("provider_id").unique(),
  state: text("state").notNull(),
  priceId: text("price_id"),
  periodEnd: date("period_end"),
  limits: jsonb("limits").notNull().$type<Record<string, number>>(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const legacyImport = pgTable("legacy_imports", {
  source: text("source").primaryKey(),
  importedAt: date("imported_at").notNull(),
  counts: jsonb("counts").notNull().$type<Record<string, number>>(),
});
export const jobExecutions = pgTable("job_executions", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => farmJobs.id),
  runId: text("run_id"),
  reservationId: text("reservation_id").references(() => usageReservations.id),
  plan: jsonb("plan").notNull().$type<{
    scope?: "calendar" | "custom";
    selectionKey?: string;
    range: {
      from: string;
      to: string;
      split: string;
      currentLabel: string;
      previousLabel: string;
    };
    provider: string;
    groups: string[][];
  }>(),
  completedAt: date("completed_at"),
});
export const analysisRequests = pgTable(
  "analysis_requests",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("request_key").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => farmJobs.id),
    selection: text("selection").notNull(),
  },
  (t) => [uniqueIndex("analysis_requests_org_key_idx").on(t.organizationId, t.key)],
);
export const analysisClaims = pgTable(
  "analysis_claims",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    fieldId: text("field_id").notNull().references(() => farmRecords.id),
    analysisId: text("analysis_id").notNull().references(() => farmJobs.id),
    metric: text("metric").notNull(),
    geometryVersion: text("geometry_version").notNull(),
    evidence: jsonb("evidence").notNull().$type<import("../intelligence/claims").ClaimEvidence>(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analysis_claim_metric_idx").on(t.analysisId, t.metric),
    index("analysis_claim_field_idx").on(t.organizationId, t.fieldId, t.createdAt),
  ],
);
// Preserve the compatibility runtime's existing table names and physical schema.
export const farmPlatformRecords = pgTable(
  "farm_platform_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("user_id").notNull(),
    fieldId: text("field_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("farm_platform_records_owner").on(t.organizationId, t.fieldId, t.updatedAt)],
);
export const farmPlatformRevisions = pgTable(
  "farm_platform_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("user_id").notNull(),
    recordId: text("record_id").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("farm_platform_revision_unique").on(t.recordId, t.version)],
);
export const notificationReceipts = pgTable(
  "notification_receipts",
  {
    id: text("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => farmNotifications.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    readAt: date("read_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_user_idx").on(t.notificationId, t.userId)],
);
export const observationCache = pgTable("observation_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  fieldId: text("field_id")
    .notNull()
    .references(() => farmRecords.id),
  geometryVersion: text("geometry_version").notNull(),
  body: jsonb("body").notNull().$type<Record<string, unknown>>(),
  fetchedAt: date("fetched_at").notNull().defaultNow(),
  expiresAt: date("expires_at").notNull(),
});
export const assistantRequests = pgTable(
  "assistant_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    requestKey: text("request_key").notNull(),
    question: text("question").notNull(),
    fieldId: text("field_id")
      .notNull()
      .references(() => farmRecords.id),
    locale: text("locale").notNull(),
    state: text("state").notNull(),
    reservationId: text("reservation_id").references(
      () => usageReservations.id,
    ),
    answer: jsonb("answer").$type<Record<string, unknown>>(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assistant_user_request_idx").on(
      t.organizationId,
      t.userId,
      t.requestKey,
    ),
  ],
);
