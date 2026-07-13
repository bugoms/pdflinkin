/* LinkScape Supabase 접속 정보.
 * anon key 는 공개돼도 되는 키다 — 보호는 전적으로 RLS 가 담당한다. (HANDOFF.md 7번)
 */
const LS_CONFIG = {
  SUPABASE_URL: "https://nfwthowdcyciorqabiae.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5md3Rob3dkY3ljaW9ycWFiaWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTgyNTcsImV4cCI6MjA5OTQ5NDI1N30.pnD-7wz7jI80htCCk9rAlDdWf_v0XZRQUyrywP3qjZ0",
  /** 완성된 보드를 여는 링크 */
  WEB_URL: "https://pdflinkin.vercel.app",
};
