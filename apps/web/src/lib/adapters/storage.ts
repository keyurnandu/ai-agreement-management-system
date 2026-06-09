import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { env, resolveLocalPath } from "@/env";

/**
 * StorageProvider — the seam between local-first dev and cloud later.
 * LocalFsStorage writes under STORAGE_LOCAL_ROOT; S3Storage is a drop-in
 * replacement enabled by STORAGE_PROVIDER=s3 (wired in Phase 5).
 */
export interface PutResult {
  key: string;
  size: number;
}

export interface StorageProvider {
  put(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<PutResult>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
  /** A URL the browser can fetch (local: gateway route; s3: presigned URL). */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

class LocalFsStorage implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolveLocalPath(root);
  }

  private full(key: string): string {
    // Prevent path traversal out of the storage root.
    const target = join(this.root, key);
    const rel = relative(this.root, target);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return target;
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<PutResult> {
    const p = this.full(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.full(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.full(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.full(key));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix = ""): Promise<string[]> {
    const base = this.full(prefix);
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) await walk(abs);
        else out.push(relative(this.root, abs).split(sep).join("/"));
      }
    };
    await walk(base);
    return out;
  }

  async getSignedUrl(key: string): Promise<string> {
    // Served by the gateway file route (added in Phase 1).
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

class S3Storage implements StorageProvider {
  // S3 (or any S3-compatible store, e.g. MinIO via S3_ENDPOINT). Same interface as
  // LocalFsStorage, so switching is just STORAGE_PROVIDER=s3 + bucket/creds in .env.
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!env.S3_BUCKET) throw new Error("STORAGE_PROVIDER=s3 requires S3_BUCKET");
    this.bucket = env.S3_BUCKET;
    const creds =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {};
    this.client = new S3Client({
      region: env.S3_REGION || "us-east-1",
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      ...creds,
    });
  }

  async put(key: string, data: Buffer | Uint8Array, contentType = "application/pdf"): Promise<PutResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.from(data), ContentType: contentType }),
    );
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix = ""): Promise<string[]> {
    const out: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) out.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return presign(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}

let _storage: StorageProvider | undefined;

/** Returns the configured storage provider (singleton). */
export function storage(): StorageProvider {
  if (_storage) return _storage;
  _storage = env.STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalFsStorage(env.STORAGE_LOCAL_ROOT);
  return _storage;
}
