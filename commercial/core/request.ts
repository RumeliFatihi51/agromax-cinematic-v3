import { DomainError } from "./errors";
export async function boundedRequest(request: Request, maximum = 250000) {
  if (!request.body) return request;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum)
    throw new DomainError("BODY_TOO_LARGE", "İstek çok büyük.", 413);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new DomainError("BODY_TOO_LARGE", "İstek çok büyük.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Nitro can supply a Request implementation from a different Web API realm.
  // Reconstruct from primitives rather than passing it into Node's Request constructor.
  return new Request(request.url, {
    method: request.method,
    headers: [...request.headers],
    body: bytes,
  });
}
