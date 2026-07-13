import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  SETUP_MESSAGE,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

/**
 * 매 요청마다 Supabase 세션 쿠키를 갱신한다.
 * 이게 없으면 서버 컴포넌트가 만료된 세션을 보게 된다.
 */
export async function middleware(request: NextRequest) {
  // 환경변수가 없으면 여기서 그냥 죽어서 MIDDLEWARE_INVOCATION_FAILED 만 뜬다.
  // 무엇을 해야 하는지 알려주고 끝낸다.
  if (!hasSupabaseEnv()) {
    return new NextResponse(SETUP_MESSAGE, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/board";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|mjs)$).*)",
  ],
};
