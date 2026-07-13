-- ============================================================================
-- pdflinkin — 초기 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전합니다 (idempotent).
-- ============================================================================

-- 한국어 검색용: 형태소 분석기가 없으므로 trigram 부분일치로 검색한다
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default '내 보드',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.frames (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  color      text,
  x          double precision not null default 0,
  y          double precision not null default 0,
  w          double precision not null default 600,
  h          double precision not null default 400,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.item_kind as enum ('link', 'pdf', 'image', 'note', 'file');
exception when duplicate_object then null;
end $$;

create table if not exists public.items (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references public.boards(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  frame_id  uuid references public.frames(id) on delete set null,
  kind      public.item_kind not null,

  -- 캔버스 배치. frame_id 가 있으면 프레임 기준 상대 좌표.
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 260,
  h double precision not null default 200,
  z int not null default 0,

  status text not null default 'active',   -- 'active' | 'trashed'

  -- 공통
  title  text,
  note   text,
  color  text,
  pinned boolean not null default false,

  -- link
  url          text,
  domain       text,
  description  text,
  favicon_url  text,
  og_image_url text,

  -- 파일(pdf/image/file)
  storage_path text,
  file_name    text,
  file_size    bigint,
  mime_type    text,
  page_count   int,
  thumb_path   text,

  -- 검색 대상 (PDF 본문 앞부분 등)
  extracted_text text,

  -- 읽기 상태
  last_read_page int,
  read_at        timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  color   text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.item_tags (
  item_id uuid not null references public.items(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (item_id, tag_id)
);

create table if not exists public.edges (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  source_item_id uuid not null references public.items(id) on delete cascade,
  target_item_id uuid not null references public.items(id) on delete cascade,
  label          text,
  created_at     timestamptz not null default now()
);

-- 같은 URL 을 다시 저장할 때 스크래핑을 건너뛰기 위한 캐시 (사용자 무관, 공용 읽기)
create table if not exists public.link_meta_cache (
  url          text primary key,
  title        text,
  description  text,
  favicon_url  text,
  og_image_url text,
  fetched_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 인덱스
-- ---------------------------------------------------------------------------

create index if not exists items_board_status_idx on public.items (board_id, status);
create index if not exists items_frame_idx        on public.items (frame_id);
create index if not exists frames_board_idx       on public.frames (board_id);
create index if not exists edges_board_idx        on public.edges (board_id);
create index if not exists boards_user_idx        on public.boards (user_id);

-- 한국어 부분일치 검색용 GIN 인덱스
create index if not exists items_search_trgm_idx on public.items
  using gin (
    (
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(note, '') || ' ' ||
      coalesce(file_name, '') || ' ' ||
      coalesce(extracted_text, '')
    ) gin_trgm_ops
  );

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists boards_touch on public.boards;
create trigger boards_touch before update on public.boards
  for each row execute function public.touch_updated_at();

drop trigger if exists frames_touch on public.frames;
create trigger frames_touch before update on public.frames
  for each row execute function public.touch_updated_at();

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — 브라우저가 anon key 로 DB 에 직접 붙으므로 이게 유일한 방어선이다.
-- ---------------------------------------------------------------------------

alter table public.boards          enable row level security;
alter table public.frames          enable row level security;
alter table public.items           enable row level security;
alter table public.tags            enable row level security;
alter table public.item_tags       enable row level security;
alter table public.edges           enable row level security;
alter table public.link_meta_cache enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['boards', 'frames', 'items', 'tags', 'item_tags', 'edges']
  loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);

    execute format(
      'create policy "own_select" on public.%I for select using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_insert" on public.%I for insert with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_update" on public.%I for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "own_delete" on public.%I for delete using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- 링크 메타 캐시는 개인정보가 아니므로 로그인 사용자끼리 공유한다
drop policy if exists "cache_read"  on public.link_meta_cache;
drop policy if exists "cache_write" on public.link_meta_cache;
create policy "cache_read"  on public.link_meta_cache for select
  to authenticated using (true);
create policy "cache_write" on public.link_meta_cache for insert
  to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Storage — 비공개 버킷. 파일은 서명 URL 로만 접근한다.
--   경로 규칙: {user_id}/{item_id}.pdf , {user_id}/{item_id}-thumb.jpg
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)   -- 50MB
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "files_select" on storage.objects;
drop policy if exists "files_insert" on storage.objects;
drop policy if exists "files_update" on storage.objects;
drop policy if exists "files_delete" on storage.objects;

create policy "files_select" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
