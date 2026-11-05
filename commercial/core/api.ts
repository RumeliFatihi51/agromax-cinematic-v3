import type { Store, CommercialDb } from "../db/store";
import type { TransactionalMail } from "../auth/service";
import type { PrivateObjects } from "../files/private-store";
import type { ModelAdapter } from "../assistant/model";
import type { Context } from "../organizations/service";
export interface RuntimeOptions {
  store: Store;
  baseURL: string;
  secret: string;
  mail?: TransactionalMail;
  background?: (work: Promise<unknown>) => void;
  rateLimit?: boolean;
  dispatchAnalysis?: (id: string) => Promise<void>;
  dispatchReport?: (id: string) => Promise<void>;
  objects?: PrivateObjects;
  assistantModel?: ModelAdapter;
  enforceQuota?: boolean;
  reportDailyLimit?: number;
}
export interface WorkspaceRequest {
  db: CommercialDb;
  context: Context;
  body: Record<string, unknown>;
  options: RuntimeOptions;
  request: Request;
  url: URL;
  path: string;
  method: string;
}
