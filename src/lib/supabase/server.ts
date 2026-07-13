import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/types";

/** 서버 컴포넌트 / 라우트 핸들러용 클라이언트. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = requireSupabaseEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다. 미들웨어가 세션을 갱신하므로 무시해도 안전하다.
        }
      },
    },
  });
}
