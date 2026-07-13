import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types";

/** 브라우저에서 쓰는 Supabase 클라이언트. 보호는 전적으로 DB의 RLS가 담당한다. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
