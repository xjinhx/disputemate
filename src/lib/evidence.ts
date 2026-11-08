import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
export const BUCKET = "evidence";

export function validateUpload(file: File | null): string | null {
  if (!file || file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_EVIDENCE_BYTES) return "Files must be 4 MB or smaller.";
  if (!ALLOWED_TYPES.includes(file.type)) return "Upload a PNG, JPG, WEBP, PDF or TXT file.";
  return null;
}

export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);

/** Short-lived signed URL, created only after the caller's access is checked. */
export async function signedUrl(admin: SupabaseClient, path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
