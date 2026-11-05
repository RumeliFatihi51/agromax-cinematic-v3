import type { Role } from "../../../shared/contracts/commercial";
import type { Locale } from "./i18n";
export interface Field {
  id: string;
  name: string;
  area: number;
  geometry?: unknown;
}
export interface Workspace {
  id: string;
  name: string;
  role: Role;
  countryCode: string;
  timezone: string;
  locale: Locale;
}
export interface Bootstrap {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  organizations: Workspace[];
  preferences: {
    activeOrganizationId?: string;
    locale: Locale;
    timezone: string;
    areaUnit: string;
    theme: string;
    emailNotifications: boolean;
  } | null;
  emailConfigured: boolean;
  onboardingRequired: boolean;
  capabilities?: {
    customAnalysis: boolean;
    workspaceMode?: string;
    reportDailyLimit?: number;
  };
}
export interface BusinessRecord {
  id: string;
  fieldId: string;
  kind: string;
  data: Record<string, unknown>;
  version: number;
  createdBy: string;
  createdAt: string;
}
