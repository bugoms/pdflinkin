import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

export const BUCKET = "files";
export const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7일

type Client = SupabaseClient<Database>;

export async function uploadBlob(
  supabase: Client,
  path: string,
  body: Blob | File,
  contentType: string,
) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/** 여러 경로의 서명 URL을 한 번에 만든다. 실패한 건 조용히 건너뛴다. */
export async function signPaths(
  supabase: Client,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const entry of data) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  }
  return map;
}

export async function signPath(
  supabase: Client,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

/** 내려받을 파일명 — 카드 제목(라벨)을 우선하고, 확장자는 원본 파일명에서 가져와 붙인다 */
export function downloadFileName(
  title: string | null | undefined,
  fileName: string | null | undefined,
  storagePath?: string | null,
): string | null {
  const base = title?.trim();
  if (!base) return fileName ?? null;
  const ext = (fileName ?? storagePath ?? "").match(/\.[A-Za-z0-9]+$/)?.[0] ?? "";
  const safe = base.replace(/[\\/:*?"<>|]/g, "_"); // 파일명 금지 문자만 치환
  return ext && !safe.toLowerCase().endsWith(ext.toLowerCase()) ? safe + ext : safe;
}

/** 업로드해 둔 원본을 지정한 파일명으로 내려받는다. 성공 여부를 반환.
 *  Content-Disposition(supabase download 옵션)은 한글 파일명을 percent-인코딩된
 *  그대로 저장해 버려서, blob 으로 받아 download 속성으로 저장한다. */
export async function downloadStoredFile(
  supabase: Client,
  path: string,
  fileName: string | null | undefined,
): Promise<boolean> {
  const url = await signPath(supabase, path);
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName || "";
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  } catch {
    return false;
  }
}

export async function removePaths(supabase: Client, paths: string[]) {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  await supabase.storage.from(BUCKET).remove(clean);
}
