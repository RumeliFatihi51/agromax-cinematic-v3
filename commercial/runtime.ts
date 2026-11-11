import { createCommercialApplication } from "./app";
import { getStore } from "./db/store";
import { start } from "workflow/api";
import { analysisWorkflow } from "../workflows/analysis";
import { reportWorkflow } from "../workflows/report";
import { configuredAssistantModel } from "./assistant/model";
import { transactionalMail } from "./auth/mail";
let app: ReturnType<typeof createCommercialApplication> | undefined;
export function getApplication() {
  return (app ??= (async () => {
    const secret = process.env.AGROMAX_AUTH_SECRET,
      baseURL = process.env.AGROMAX_APP_URL;
    if (!secret || !baseURL)
      throw new Error("Commercial authentication URL and secret are required.");
    return createCommercialApplication({
      store: await getStore(),
      baseURL,
      secret,
      mail: transactionalMail(),
      dispatchAnalysis: async (id) => {
        await start(analysisWorkflow, [id]);
      },
      dispatchReport: async (id) => {
        await start(reportWorkflow, [id]);
      },
      assistantModel: configuredAssistantModel(),
      rateLimit: !(!process.env.VERCEL && new URL(baseURL).hostname === "127.0.0.1" &&
        process.env.AGROMAX_ISOLATED_BROWSER_FIXTURE === "true"),
      enforceQuota: process.env.VERCEL
        ? true
        : process.env.AGROMAX_ENFORCE_QUOTAS !== "false",
    });
  })().catch((error) => {
    app = undefined;
    throw error;
  }));
}
