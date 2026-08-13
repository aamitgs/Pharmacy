import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local-disk storage for prescription images, outside `public/` so a file
 * can only be read back through the authenticated /api/files/prescriptions
 * route (which cross-checks the requesting tenant against the invoice the
 * path is attached to) rather than by guessing a URL. Simplest option for
 * this single-server deployment — swap for an S3-compatible client behind
 * the same two functions if that ever changes. See README.
 */
const STORAGE_ROOT = process.env.PRESCRIPTION_STORAGE_DIR
  ? path.resolve(process.env.PRESCRIPTION_STORAGE_DIR)
  : path.join(process.cwd(), "storage", "prescriptions");

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 8 * 1024 * 1024;

export class PrescriptionUploadError extends Error {}

export async function savePrescriptionImage(tenantId: string, file: File): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new PrescriptionUploadError("Only JPEG, PNG, WEBP, or PDF files are accepted.");
  }
  if (file.size > MAX_BYTES) {
    throw new PrescriptionUploadError("File is too large (max 8 MB).");
  }

  const tenantDir = path.join(STORAGE_ROOT, tenantId);
  await mkdir(tenantDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // turbopackIgnore: this path is runtime-only (uploaded files), not a
  // build-time dependency — without the annotation Turbopack traces the
  // whole project into the standalone output because it can't tell.
  await writeFile(path.join(/* turbopackIgnore: true */ tenantDir, filename), buffer);

  return `${tenantId}/${filename}`;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Resolves a stored relative path to bytes + content-type, refusing to escape the storage root. */
export async function readPrescriptionImage(
  relativePath: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (!resolved.startsWith(STORAGE_ROOT + path.sep)) return null;

  const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return null;

  try {
    const bytes = await readFile(resolved);
    return { bytes, contentType };
  } catch {
    return null;
  }
}
