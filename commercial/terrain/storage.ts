import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromFile, fromUrl } from "geotiff";
import { DomainError } from "../core/errors";
import { privateObjects, supabaseObjectConfig } from "../files/private-store";

export const maxTerrainBytes = 50_000_000;
export const uploadExpiryMs = 5 * 60_000;
const invalidSize = () => new DomainError("TERRAIN_SIZE", "Yüklenen dosya boyutu eşleşmiyor. Yüklemeyi tekrar deneyin.", 422);
const notUploaded = () => new DomainError("TERRAIN_UPLOAD_INCOMPLETE", "Dosyanın yüklenmesi henüz tamamlanmadı.", 409);
const localWrites = new Set<string>();

export function terrainStorage() {
  const cloud = supabaseObjectConfig();
  const remote = !!process.env.VERCEL || !!process.env.AGROMAX_SUPABASE_BUCKET;
  if (remote && !cloud) return null;
  const root = resolve(process.env.AGROMAX_LOCAL_OBJECT_DIR || "data/private-objects");
  const localPath = (key: string) => resolve(root, key);
  const derived = privateObjects({ remote });
  return {
    direct: !!cloud,
    derived,
    async sign(key: string, bytes: number) {
      if (!cloud) throw new Error("Remote storage unavailable");
      return getSignedUrl(cloud.client, new PutObjectCommand({
        Bucket: cloud.bucket, Key: key, ContentLength: bytes,
      }), { expiresIn: uploadExpiryMs / 1000, signableHeaders: new Set(["content-length"]) });
    },
    async putLocal(key: string, expected: number, request: Request) {
      const declared = request.headers.get("content-length");
      const contentRange = request.headers.get("content-range");
      const range = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range ? Number(range[2]) + 1 : expected;
      const length = end - start;
      if (cloud || remote || !request.body || (contentRange && (!range || Number(range[3]) !== expected ||
        !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || end > expected || length > 65536)) ||
        declared !== null && Number(declared) !== length) throw invalidSize();
      const path = localPath(key);
      if (localWrites.has(path)) throw notUploaded();
      localWrites.add(path);
      try {
        await mkdir(dirname(path), { recursive: true });
        const temp = path + "." + randomUUID();
        const target = range ? path : temp;
        if (start > 0 && await stat(path).then(file => file.size, () => -1) !== start) throw notUploaded();
        const handle = await open(target, start > 0 ? "r+" : "w", 0o600);
        try {
          const reader = request.body.getReader();
          let position = start;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (position + value.length > end) throw invalidSize();
              const { bytesWritten } = await handle.write(value, 0, value.length, position);
              if (bytesWritten !== value.length) throw invalidSize();
              position += bytesWritten;
            }
            if (position !== end) throw invalidSize();
          } catch (error) {
            await handle.truncate(start);
            throw error;
          } finally {
            reader.releaseLock();
          }
        } finally {
          await handle.close();
          if (!range) {
            if (await stat(temp).then(file => file.size, () => 0) === expected) await rename(temp, path);
            await rm(temp, { force: true });
          }
        }
      } finally {
        localWrites.delete(path);
      }
    },
    async stage(key: string, target: string, expected: number, signal: AbortSignal) {
      if (cloud) {
        const { client, bucket: Bucket } = cloud;
        const object = await client.send(new HeadObjectCommand({ Bucket, Key: key }), { abortSignal: signal })
          .catch(error => { if (error.$metadata?.httpStatusCode === 404) throw notUploaded(); throw error; });
        if (object.ContentLength !== expected || !object.ETag) throw invalidSize();
        const response = await client.send(new GetObjectCommand({ Bucket, Key: key, IfMatch: object.ETag }), { abortSignal: signal });
        if (!response.Body) throw notUploaded();
        await client.send(new PutObjectCommand({
          Bucket, Key: target, Body: response.Body as Readable, ContentLength: expected,
          ContentType: "image/tiff",
        }), { abortSignal: signal });
      } else {
        const source = localPath(key), path = localPath(target);
        if (localWrites.has(source)) throw notUploaded();
        if (await stat(source).then(file => file.size, () => null) !== expected) {
          if (!await stat(source).catch(() => null)) throw notUploaded();
          throw invalidSize();
        }
        await mkdir(dirname(path), { recursive: true });
        const handle = await open(path, "w", 0o600);
        await pipeline(createReadStream(source), handle.createWriteStream(), { signal });
      }
    },
    async open(key: string, signal: AbortSignal) {
      if (!cloud) return fromFile(localPath(key), signal);
      const url = await getSignedUrl(cloud.client, new GetObjectCommand({
        Bucket: cloud.bucket, Key: key,
      }), { expiresIn: 180 });
      return fromUrl(url, { allowFullFile: false }, signal);
    },
    async remove(key: string) {
      if (cloud) await cloud.client.send(new DeleteObjectCommand({ Bucket: cloud.bucket, Key: key }));
      else await rm(localPath(key), { force: true });
    },
  };
}
export type TerrainStorage = NonNullable<ReturnType<typeof terrainStorage>>;
