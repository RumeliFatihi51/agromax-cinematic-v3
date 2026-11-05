import { ZodError } from "zod";
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error: "Girdi bilgileri geçersiz.",
        code: "VALIDATION_FAILED",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  if (error instanceof DomainError)
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  console.error("Commercial request failed.");
  if (process.env.AGROMAX_DEBUG === "true" && !process.env.VERCEL)
    console.error(error);
  return Response.json(
    { error: "İşlem tamamlanamadı.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
