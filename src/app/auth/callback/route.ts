import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** 이메일 확인 링크가 돌아오는 곳. 코드를 세션으로 교환하고 보드로 보낸다. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/board`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
