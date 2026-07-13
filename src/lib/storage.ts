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

export async function removePaths(supabase: Client, paths: string[]) {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  await supabase.storage.from(BUCKET).remove(clean);
}
