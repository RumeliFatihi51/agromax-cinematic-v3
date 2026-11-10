import { z } from "zod";
import { identifier } from "../../shared/contracts/commercial";
import {
  answerQuestion,
  answerHelp,
  fieldFacts,
  createProposal,
  decideProposal,
} from "./service";
import type { WorkspaceRequest } from "../core/api";
export async function assistantRoutes({
  db,
  context,
  body,
  options,
  request,
  url,
  path,
  method,
}: WorkspaceRequest): Promise<Response | undefined> {
  if (path === "/api/v1/assistant/help" && method === "POST")
    return Response.json(await answerHelp(db, context, body, options.assistantModel));
  if (path === "/api/v1/assistant/status" && method === "GET")
    return Response.json({
      modelAvailable: !!options.assistantModel,
      guideAvailable: true,
      reason: options.assistantModel
        ? null
        : "Dil modeli erişimi ve kalite doğrulaması henüz tamamlanmadı.",
    });
  if (path === "/api/v1/assistant/facts" && method === "GET")
    return Response.json({
      facts: await fieldFacts(
        db,
        context,
        identifier.parse(url.searchParams.get("fieldId")),
        z.enum(["tr", "en"]).parse(url.searchParams.get("locale") || "tr"),
      ),
    });
  if (path === "/api/v1/assistant/ask" && method === "POST")
    return Response.json(
      await answerQuestion(
        db,
        context,
        body,
        identifier.parse(request.headers.get("idempotency-key")),
        options.assistantModel,
        options.enforceQuota ?? true,
      ),
    );
  if (path === "/api/v1/assistant/proposals" && method === "POST")
    return Response.json(await createProposal(db, context, body), {
      status: 201,
    });
  const proposalMatch = path.match(
    /^\/api\/v1\/assistant\/proposals\/([a-f0-9]{32})\/(confirm|reject)$/,
  );
  if (proposalMatch && method === "POST") {
    const decision = await decideProposal(
      db,
      context,
      proposalMatch[1]!,
      proposalMatch[2] === "confirm",
      options.enforceQuota ?? true,
      options.reportDailyLimit,
    );
    if (
      decision.kind === "report" &&
      decision.resultId &&
      decision.state === "confirmed" &&
      options.dispatchReport
    ) {
      try {
        await options.dispatchReport(decision.resultId);
      } catch {
        /* Durable report outbox remains queued. */
      }
    }
    return Response.json(decision);
  }

  return undefined;
}
