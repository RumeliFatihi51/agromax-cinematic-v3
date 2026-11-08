import { z } from "zod";
import { identifier, localDate } from "../../shared/contracts/commercial";
import type { WorkspaceRequest } from "../core/api";
import { saveDomainRecord } from "./service";

const input = z.object({
  fieldId: identifier,
  draftId: z.string().regex(/^[a-f0-9]{32}$/),
  fieldVersion: z.number().int().positive(),
  date: localDate,
  observation: z.string().trim().min(1).max(4000),
}).strict();

export async function offlineRoutes({ db, context, body, path, method }: WorkspaceRequest) {
  if (path !== "/api/v1/offline/field-notes" || method !== "POST") return;
  const { draftId, fieldVersion, ...data } = input.parse(body);
  const row = await saveDomainRecord(db, context, "evaluation", {
    ...data, state: "pending",
  }, undefined, { draftId, fieldVersion });
  return Response.json({ id: row.id, version: row.version }, { status: 201 });
}
