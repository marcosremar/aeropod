/**
 * Video storage helper.
 *
 * Mirrors the local/S3 fallback used by `src/app/api/upload/route.ts` and
 * `src/lib/storage/s3.ts`: when S3 is configured (via `createStorageClient`)
 * buffers are uploaded there, otherwise they are written to `public/uploads`.
 * Keeps the video API routes from duplicating storage logic.
 */

import fs from "fs/promises";
import path from "path";
import { createStorageClient } from "@/lib/storage/s3";

/** Absolute path to the public uploads directory (`public/uploads`). */
export function publicUploadsDir(): string {
  return path.join(process.cwd(), "public", "uploads");
}

/** Absolute path to the public exports directory (`public/exports`). */
export function publicExportsDir(): string {
  return path.join(process.cwd(), "public", "exports");
}

/**
 * Returns true when real S3-compatible storage is configured via env vars.
 * Matches the detection used by `createStorageClient`.
 */
function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_BUCKET
  );
}

/**
 * Persist a video (or related media) buffer and return a public URL/path.
 *
 * - If S3 is configured, uploads under a `video/<ts>-<filename>` key and
 *   returns the resulting URL.
 * - Otherwise writes to `public/uploads/<ts>-<filename>` and returns the
 *   `/uploads/<ts>-<filename>` path (served by Next.js from `public/`).
 *
 * @param buffer       Raw file bytes.
 * @param filename     Original/desired filename (used for extension + key).
 * @param contentType  MIME type (e.g. `video/mp4`, `image/jpeg`).
 * @returns Public URL or `/uploads/...` path.
 */
export async function saveVideoBuffer(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const safeName = sanitizeFilename(filename);
  const uniqueName = `${Date.now()}-${safeName}`;

  if (isS3Configured()) {
    const client = createStorageClient();
    const { url } = await client.upload({
      key: `video/${uniqueName}`,
      body: buffer,
      contentType,
    });
    return url;
  }

  // Local development fallback: write into public/uploads.
  const dir = publicUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, uniqueName);
  await fs.writeFile(filePath, buffer);

  return `/uploads/${uniqueName}`;
}

/**
 * Strip path separators and unsafe characters from a filename so it cannot
 * escape the uploads directory or break the S3 key.
 */
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}
