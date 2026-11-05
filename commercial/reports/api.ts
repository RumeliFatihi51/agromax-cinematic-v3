import { createReport, ownReport, listReports } from "./service";
import { privateObjects, contentHash } from "../files/private-store";
import { DomainError } from "../core/errors";
import { identifier } from "../../shared/contracts/commercial";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WorkspaceRequest } from "../core/api";
export async function reportRoutes({
  db,
  context,
  body,
  options,
  request,
  url,
  path,
  method,
}: WorkspaceRequest): Promise<Response | undefined> {
  if (path === "/api/v1/reports" && method === "GET")
    return Response.json({ reports: await listReports(db, context) });
  if (path === "/api/v1/reports" && method === "POST") {
    if (!options.dispatchReport)
      throw new DomainError(
        "WORKFLOW_UNAVAILABLE",
        "Rapor işleme hizmeti etkin değil.",
        503,
      );
    const report = await createReport(
      db,
      context,
      body,
      identifier.parse(request.headers.get("idempotency-key")),
      options.enforceQuota ?? true,
      options.reportDailyLimit,
    );
    if (report.state === "queued") {
      try {
        await options.dispatchReport(report.id);
      } catch {
        /* Stored outbox will be dispatched again. */
      }
    }
    return Response.json(
      { id: report.id, state: report.state },
      { status: 202 },
    );
  }
  const reportMatch = path.match(
    /^\/api\/v1\/reports\/([a-f0-9]{32})(?:\/(download-link|file))?$/,
  );
  if (reportMatch) {
    const report = await ownReport(db, context, reportMatch[1]!);
    if (method === "GET" && !reportMatch[2])
      return Response.json({
        id: report.id,
        state: report.state,
        snapshot: report.snapshot,
        error: report.error,
        createdAt: report.createdAt,
      });
    const signature = (expires: string) =>
      createHmac("sha256", options.secret)
        .update(
          [
            context.actor.id,
            context.organization.id,
            report.id,
            report.sha256,
            expires,
          ].join(":"),
        )
        .digest("hex");
    if (method === "POST" && reportMatch[2] === "download-link") {
      if (report.state !== "completed" || !report.sha256)
        throw new DomainError("NOT_READY", "Rapor henüz hazır değil.", 409);
      const expires = String(Date.now() + 300000);
      return Response.json({
        url: `/api/v1/reports/${report.id}/file?expires=${expires}&signature=${signature(expires)}`,
        expiresAt: new Date(Number(expires)).toISOString(),
      });
    }
    if (method === "GET" && reportMatch[2] === "file") {
      const expires = url.searchParams.get("expires") || "",
        supplied = Buffer.from(url.searchParams.get("signature") || "", "utf8"),
        expected = Buffer.from(signature(expires), "utf8");
      if (
        !/^\d{13}$/.test(expires) ||
        Number(expires) < Date.now() ||
        Number(expires) > Date.now() + 300000 ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw new DomainError(
          "EXPIRED_LINK",
          "İndirme bağlantısı geçersiz veya süresi dolmuş.",
          403,
        );
      if (report.state !== "completed" || !report.objectKey || !report.sha256)
        throw new DomainError("NOT_READY", "Rapor henüz hazır değil.", 409);
      const bytes = await (options.objects || privateObjects()).get(
        report.objectKey,
      );
      if (contentHash(bytes) !== report.sha256)
        throw new DomainError(
          "INTEGRITY_FAILED",
          "Dosya bütünlüğü doğrulanamadı.",
          502,
        );
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="agromax-${report.id}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  return undefined;
}
