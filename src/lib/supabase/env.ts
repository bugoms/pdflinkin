/**
 * Supabase 환경변수는 빌드 시점에 코드로 박히므로, 배포 환경에 값이 없으면
 * 앱 전체가 정체불명의 500 으로 죽는다. 여기서 한 번에 확인하고 읽을 수 있는
 * 메시지를 내보낸다.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseEnv(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function requireSupabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase 환경변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL 과 " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요. " +
        "(로컬: .env.local · Vercel: Project Settings → Environment Variables → 재배포)",
    );
  }
  return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
}

export const SETUP_MESSAGE = `설정이 필요합니다 — Supabase 환경변수가 없습니다.

Vercel 프로젝트 → Settings → Environment Variables 에 아래 두 개를 추가하고
다시 배포(Redeploy)하세요. NEXT_PUBLIC_ 변수는 빌드할 때 코드에 박히므로,
값을 넣은 뒤 반드시 재배포해야 반영됩니다.

  NEXT_PUBLIC_SUPABASE_URL       = https://<프로젝트>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon / public key>

(로컬에서 이 메시지가 보인다면 .env.local 을 만들고 dev 서버를 재시작하세요.)
`;
