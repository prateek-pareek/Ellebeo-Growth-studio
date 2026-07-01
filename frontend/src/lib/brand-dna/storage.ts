import { api } from "@/lib/api";

export type BrandFileKind = "logo" | "moodboard" | "library";

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
export const SIZE_LIMITS: Readonly<Record<BrandFileKind, number>> = {
  logo: 5 * 1024 * 1024, moodboard: 10 * 1024 * 1024, library: 10 * 1024 * 1024,
};

export type UploadResult =
  | { kind: "ok"; path: string; signedUrl: string }
  | { kind: "anon" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateBrandFile(file: File, kind: BrandFileKind): ValidationResult {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png", "webp"].includes(ext) || !ALLOWED_MIME_TYPES.has(file.type))
    return { ok: false, message: "JPG, PNG or WebP only." };
  if (file.size > SIZE_LIMITS[kind])
    return { ok: false, message: `File must be under ${Math.round(SIZE_LIMITS[kind] / 1024 / 1024)}MB.` };
  if (file.size === 0) return { ok: false, message: "File is empty." };
  return { ok: true };
}

export async function uploadBrandFile(file: File, kind: BrandFileKind): Promise<UploadResult> {
  const v = validateBrandFile(file, kind);
  if (!v.ok) return { kind: "invalid", message: v.message };
  const endpoint = kind === "logo" ? "/brand-dna/upload-logo"
    : kind === "moodboard" ? "/brand-dna/upload-moodboard"
    : "/brand-dna/upload-asset";
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post(endpoint, form, { headers: { "Content-Type": "multipart/form-data" } });
    const url: string = res.data.url;
    return { kind: "ok", path: url, signedUrl: url };
  } catch (err: any) {
    if (err.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: err.response?.data?.message || err.message };
  }
}

// Firebase URLs are already public — no signing needed
export async function signOne(path: string): Promise<string | null> { return path || null; }
export async function signMany(paths: string[]): Promise<Record<string, string>> {
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, p]));
}
export function queueDeleteOnSave(_path: string | null | undefined): void {}
export function cancelQueuedDelete(_path: string | null | undefined): void {}
export async function commitPendingStorageOps(): Promise<void> {}
export async function rollbackPendingStorageOps(): Promise<void> {}
