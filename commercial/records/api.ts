import { z } from "zod";
import {
  listDomainRecords,
  saveDomainRecord,
  deleteDomainRecord,
  costSummary,
} from "./service";
import type { WorkspaceRequest } from "../core/api";
export async function recordRoutes({
  db,
  context,
  body,
  options,
  request,
  url,
  path,
  method,
}: WorkspaceRequest): Promise<Response | undefined> {
  if (path === "/api/v1/costs/summary" && method === "GET")
    return Response.json(
      await costSummary(db, context, url.searchParams.get("fieldId")),
    );
  const recordMatch = path.match(
    /^\/api\/v1\/records\/([a-z]+)(?:\/([a-zA-Z0-9_-]+))?$/,
  );
  if (recordMatch) {
    const kind = recordMatch[1]!,
      id = recordMatch[2];
    if (method === "GET" && !id)
      return Response.json({
        records: await listDomainRecords(
          db,
          context,
          kind,
          url.searchParams.get("fieldId"),
        ),
      });
    if (method === "POST" && !id)
      return Response.json(await saveDomainRecord(db, context, kind, body), {
        status: 201,
      });
    if (method === "PATCH" && id)
      return Response.json(
        await saveDomainRecord(db, context, kind, body.data, {
          id,
          version: z.number().int().positive().parse(body.version),
        }),
      );
    if (method === "DELETE" && id) {
      await deleteDomainRecord(
        db,
        context,
        id,
        z.number().int().positive().parse(body.version),
      );
      return Response.json({ ok: true });
    }
  }

  return undefined;
}
