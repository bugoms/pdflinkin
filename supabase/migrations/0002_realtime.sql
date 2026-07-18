-- ============================================================================
-- 실시간 반영(Realtime) — items / frames / edges 를 지켜본다.
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다 (idempotent).
--
-- RLS 가 realtime 에도 그대로 적용되어 각 사용자는 자기 행만 수신합니다.
-- DELETE 이벤트의 old 레코드에 board_id 가 실려 필터가 동작하도록
-- REPLICA IDENTITY FULL 을 켭니다.
-- ============================================================================

alter table public.items  replica identity full;
alter table public.frames replica identity full;
alter table public.edges  replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'frames'
  ) then
    alter publication supabase_realtime add table public.frames;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'edges'
  ) then
    alter publication supabase_realtime add table public.edges;
  end if;
end $$;
