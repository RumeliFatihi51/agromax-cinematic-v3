import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { put, get } from "@vercel/blob";
export interface PrivateObjects {
  put(key: string, content: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}
export const contentHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export function privateObjects(
  options: { directory?: string; token?: string; remote?: boolean } = {},
): PrivateObjects {
  const remote = options.remote ?? !!process.env.VERCEL;
  const token = options.token || process.env.BLOB_READ_WRITE_TOKEN;
  const root = resolve(
    options.directory ||
      process.env.AGROMAX_LOCAL_OBJECT_DIR ||
      "data/private-objects",
  );
  function path(key: string) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(key) ||
      key.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw new Error("Invalid private object key.");
    const target = resolve(root, key);
    if (!target.startsWith(root + sep))
      throw new Error("Private object path escaped its root.");
    return target;
  }
  if (remote && !token)
    throw new Error("Private Blob credentials are required.");
  return {
    async put(key, content, contentType) {
      path(key);
      if (remote)
        await put(key, Buffer.from(content), {
          access: "private",
          token,
          contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      else {
        const target = path(key);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { mode: 0o600 });
      }
    },
    async get(key) {
      path(key);
      if (!remote) return readFile(path(key));
      const result = await get(key, { access: "private", token });
      if (!result || result.statusCode !== 200 || result.blob.size > 20_000_000)
        throw new Error("Private file unavailable.");
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
  };
}
