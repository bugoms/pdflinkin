import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/types";

/** 브라우저에서 쓰는 Supabase 클라이언트. 보호는 전적으로 DB의 RLS가 담당한다. */
export function createClient() {
  const { url, key } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
