import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { DOCUMENT_STORAGE_LOCAL_DIR, DOCUMENT_STORAGE_PROVIDER } from "@/documents/config";

export type DocumentStorage = {
  upload(storageKey: string, file: Blob): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  getAccessUrl(storageKey: string): Promise<string | null>;
};

function safe(k: string) {
  if (!k || k.startsWith("/") || k.includes("\\") || k.split("/").some((p) => p === ".." || p === ".")) {
    throw new Error("Invalid storage key.");
  }
}

class LocalDocumentStorage implements DocumentStorage {
  private root = path.resolve(process.cwd(), DOCUMENT_STORAGE_LOCAL_DIR);
  private resolve(k: string) {
    safe(k);
    const resolved = path.resolve(this.root, k);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage key.");
    return resolved;
  }

  async upload(k: string, file: Blob) {
    const target = this.resolve(k);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  }

  async read(k: string) {
    return readFile(this.resolve(k));
  }

  async delete(k: string) {
    try {
      await unlink(this.resolve(k));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }

  async getAccessUrl() {
    return null;
  }
}

/**
 * Vercel Blob is the durable object store used by deployed Vercel functions.
 * The store should be created as a private Blob store because accounting
 * documents can contain sensitive financial information. Reads therefore go
 * through the SDK with the server-side BLOB_READ_WRITE_TOKEN.
 */
class VercelBlobDocumentStorage implements DocumentStorage {
  async upload(k: string, file: Blob) {
    safe(k);
    await put(k, file, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: file.type || "application/octet-stream",
    });
  }

  async read(k: string) {
    safe(k);
    const result = await get(k, { access: "private" });
    if (!result) throw new Error("Document not found in Vercel Blob.");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  async delete(k: string) {
    safe(k);
    await del(k);
  }

  async getAccessUrl() {
    // Private Blob objects are intentionally not exposed as direct public URLs.
    return null;
  }
}

export function getDocumentStorage(): DocumentStorage {
  if (DOCUMENT_STORAGE_PROVIDER === "local") return new LocalDocumentStorage();
  if (DOCUMENT_STORAGE_PROVIDER === "vercel-blob") return new VercelBlobDocumentStorage();
  throw new Error(`Unsupported document storage provider: ${DOCUMENT_STORAGE_PROVIDER}`);
}
