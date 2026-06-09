import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
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
  // Interface-compatible stub. Enable by setting STORAGE_PROVIDER=s3 and wiring
  // the S3 SDK + credentials in Phase 5. Until then it fails loudly so misconfig
  // is obvious rather than silently writing nowhere.
  private fail(): never {
    throw new Error(
      "S3Storage is not implemented yet. Set STORAGE_PROVIDER=local for local dev (S3 lands in Phase 5).",
    );
  }
  async put(): Promise<PutResult> {
    return this.fail();
  }
  async get(): Promise<Buffer> {
    return this.fail();
  }
  async delete(): Promise<void> {
    return this.fail();
  }
  async exists(): Promise<boolean> {
    return this.fail();
  }
  async list(): Promise<string[]> {
    return this.fail();
  }
  async getSignedUrl(): Promise<string> {
    return this.fail();
  }
}

let _storage: StorageProvider | undefined;

/** Returns the configured storage provider (singleton). */
export function storage(): StorageProvider {
  if (_storage) return _storage;
  _storage = env.STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalFsStorage(env.STORAGE_LOCAL_ROOT);
  return _storage;
}
