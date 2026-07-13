# 무한 캔버스 기반 링크/PDF 보관 서비스 — 상세 기획서

> 작성일: 2026-07-13 / 상태: 기획 (구현 전)
> **v1 범위: 데스크톱 웹 전용. 폰 연동 없음. 운영 비용 0원.**

---

## 1. 문제 정의

링크와 PDF를 저장하는 지금 방식은 전부 조금씩 불편하다.

| 현재 방식 | 문제 |
|---|---|
| 카카오톡 "나에게 보내기" | 시간순으로만 쌓임. 분류 불가, 검색 빈약, 미리보기 없음. 100개 넘어가면 사실상 못 찾음 |
| 컴퓨터 폴더 | 폴더 트리는 한 항목이 한 곳에만 존재해야 함. 파일명만 보여서 뭐가 뭔지 모름 |
| 브라우저 북마크 | 링크만 됨. PDF는 못 넣음. 목록 UI라 가독성이 떨어짐 |
| 노션 / 에버노트 | 무겁고, "그냥 던져놓기"에 마찰이 큼 |

핵심 불편은 두 가지다.

1. **저장이 쌓이기만 하고 구조가 안 생긴다** — 시간순 나열은 구조가 아니다.
2. **저장하는 순간의 맥락이 사라진다** — "이 논문이랑 저 블로그 글은 같은 주제였는데"라는 정보가 어디에도 안 남는다.

## 2. 해결 컨셉

**링크와 PDF를 무한 캔버스 위 카드로 놓고, 위치와 그룹 자체가 분류가 되는 개인 아카이브.**

설계 원칙:

> **공간적 배치가 곧 분류다.** 폴더처럼 "하나의 항목은 하나의 위치"를 강요하지 않고, 책상에 종이를 늘어놓듯 가까이 두면 관련 있는 것이 된다. 이 "가까움"이 데이터 모델의 1급 시민이어야 한다.

## 3. v1 범위 — 무엇을 안 만드는가

범위를 좁히는 게 이 프로젝트의 성공 조건이다. **v1에서 명시적으로 제외하는 것:**

- ❌ 폰 연동 일체 (공유 시트, iOS 단축어, 모바일 UI, PWA)
- ❌ 반응형 모바일 레이아웃 (화면이 좁으면 "데스크톱에서 열어주세요" 안내만)
- ❌ 다른 사람과의 공유 / 협업 / 실시간 동기화
- ❌ 오프라인 지원
- ❌ AI 자동 태깅 (유료라서. 나중에 선택 기능으로)

**v1에서 만드는 것:** PC 브라우저에서 링크와 PDF를 캔버스에 편하게 놓고, 정리하고, 찾는 것. 그게 전부다.

> 폰은 나중 얘기지만, **데이터가 서버에 있는 구조를 택하면 나중에 폰에서 URL만 열어도 최소한 "보기"는 공짜로 된다.** 그래서 지금 폰을 신경 쓰지 않되, 폰을 막는 선택은 하지 않는다. (4-2 참고)

## 4. 핵심 설계 결정

### 4-1. 데스크톱이라 캡처가 이미 쉽다 → 인박스는 v1에 불필요

원래 기획에는 "던지기 전용 인박스"가 있었다. 폰 공유 시트에서 던질 때 "어디에 놓을지" 묻지 않기 위한 장치였다. **데스크톱에서는 이 문제가 애초에 없다.**

| 캡처 동작 | 결과 |
|---|---|
| 캔버스에서 `Ctrl+V` (URL 복사한 상태) | 마우스 커서 위치에 링크 카드 생성 |
| PDF 파일을 캔버스로 드래그앤드롭 | 떨어뜨린 자리에 PDF 카드 생성 |
| 이미지를 드래그앤드롭 / 붙여넣기 | 이미지 카드 |
| 여러 URL을 한 번에 붙여넣기 | 그 자리에 자동 격자 배치 |
| 빈 곳 더블클릭 | 메모 카드 |

붙여넣는 순간 이미 놓을 자리가 정해진다. 마찰이 거의 0이다. → **인박스는 만들지 않는다.** (나중에 브라우저 확장으로 "어느 페이지에서든 원클릭 저장"을 만들 때 그때 필요해진다. v2.)

### 4-2. 저장 방식 — 무료가 절대 조건

| 후보 | 비용 | 장점 | 단점 |
|---|---|---|---|
| **Supabase + Vercel** | **0원** | 서버가 진실의 원천 → 컴퓨터 여러 대, 나중에 폰에서도 접근 가능. 브라우저 캐시 지워도 데이터 안 날아감 | 무료 프로젝트는 **일정 기간 미사용 시 일시정지**(대시보드에서 클릭 한 번으로 재개). 로그인 필요 |
| 순수 로컬 (IndexedDB) | 0원 | 서버 없음. 로그인 없음. 오프라인 완벽. 즉시 빠름 | **데이터가 이 브라우저에만 존재.** 사이트 데이터 지우면 전부 소실. 다른 컴퓨터에서 못 봄. 나중에 폰 지원 = 처음부터 다시 만들기 |
| 로컬 파일 시스템 (File System Access API) | 0원 | 내 폴더에 파일로 저장 → 백업/이전 자유 | Chrome 계열만 지원. 폴더 권한을 매번 다시 줘야 하는 경우 있음 |

**추천: Supabase + Vercel.** 둘 다 무료 티어로 충분하고, "브라우저 캐시 지웠더니 3년치 자료가 사라졌다"는 최악의 사고를 막는다. 나중에 폰에서 보고 싶어지면 그냥 주소를 열면 된다 — 이 옵션을 공짜로 열어두는 값어치가 크다.

**단, 로컬 옵션도 진지한 선택지다.** "서버도 로그인도 없이 그냥 켜면 바로 되는 것"이 더 중요하다면 IndexedDB로 가는 게 맞다. 실제로 혼자 쓰는 도구엔 이게 더 나을 수도 있다. → **판단 필요 (12번 항목)**

### 4-3. 무료로 굴리기 위한 규칙

돈이 새어나갈 수 있는 지점을 미리 막는다.

| 항목 | 서비스 | 비용 | 주의점 |
|---|---|---|---|
| 호스팅 | Vercel Hobby | 0원 | 개인/비상업용 한정. 대역폭 한도 있으나 혼자 쓰면 근처도 못 감 |
| DB + 인증 + 파일 | Supabase Free | 0원 | DB·스토리지 용량 한도 있음. **미사용 시 프로젝트 일시정지** → 며칠 안 쓰면 재개 클릭 필요 |
| 캔버스 | React Flow (`@xyflow/react`) | 0원 | MIT 라이선스 |
| PDF | pdf.js / react-pdf | 0원 | Apache 2.0 |
| 도메인 | `xxx.vercel.app` | 0원 | 커스텀 도메인 원하면 연 1~2만원 (선택) |

**비용을 발생시키는 짓 금지:**
- PDF 썸네일을 서버에서 렌더링하지 않는다 → **브라우저에서 pdf.js로 렌더 후 이미지만 업로드.** 서버 연산 0.
- PDF 본문 텍스트 추출도 브라우저에서 (pdf.js `getTextContent`).
- 서버 함수는 **OG 메타데이터 스크래핑 하나**만. (CORS 때문에 이것만은 서버가 필요)
- 스크린샷 서비스, AI API 등 종량 과금 서비스는 v1에서 일절 안 쓴다.

> ⚠️ 정확한 무료 한도 수치는 서비스 정책이 자주 바뀌므로, 착수 시점에 각 사이트에서 직접 확인할 것. 다만 "혼자서 링크·PDF 수천 개" 규모는 어느 무료 티어든 여유롭다.

## 5. 사용자 시나리오

**A. 저장한다**
논문 PDF를 다운받았다 → 브라우저에서 보드를 열어둔 채 파일을 캔버스 "논문/딥러닝" 영역으로 드래그 → 끝. 1페이지 썸네일이 자동으로 뜬다.

**B. 정리한다**
어제 급하게 아무 데나 붙여넣은 링크 5개가 캔버스 구석에 있다 → 드래그해서 프레임 안으로 옮기고, 관련 있는 둘은 화살표로 잇고, 옆에 메모 카드를 붙인다.

**C. 찾는다**
`Ctrl+K` → "트랜스포머" → 제목·설명·태그·**PDF 본문**까지 검색된 결과 → 클릭 → 캔버스가 그 카드로 부드럽게 줌인. "아, 이 근처에 있었지."

## 6. 데이터 모델

```sql
-- 사용자는 Supabase auth.users 사용

create table boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '내 보드',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 그룹/섹션. 캔버스에서 제목을 가진 사각 영역.
create table frames (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  title text,
  color text,                       -- 팔레트 토큰명 (예: 'amber')
  x double precision not null,
  y double precision not null,
  w double precision not null,
  h double precision not null,
  created_at timestamptz not null default now()
);

create type item_kind as enum ('link', 'pdf', 'image', 'note', 'file');

create table items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  frame_id uuid references frames(id) on delete set null,  -- null이면 프레임 밖
  kind item_kind not null,

  -- 캔버스 배치
  x double precision not null,
  y double precision not null,
  w double precision not null default 240,
  h double precision not null default 180,
  z int not null default 0,

  status text not null default 'active',   -- 'active' | 'trashed'

  -- 공통 메타
  title text,
  note text,                         -- 사용자가 직접 쓴 메모
  color text,
  pinned boolean not null default false,

  -- link 전용 (OG 메타)
  url text,
  domain text,
  description text,
  favicon_url text,
  og_image_url text,

  -- 파일 전용
  storage_path text,                 -- Supabase Storage 경로
  file_name text,
  file_size bigint,
  mime_type text,
  page_count int,
  thumb_path text,                   -- 1페이지 렌더 썸네일

  -- 검색용 추출 텍스트 (PDF 본문 앞부분 등)
  extracted_text text,

  -- 읽기 상태
  last_read_page int,
  read_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  unique (user_id, name)
);

create table item_tags (
  item_id uuid not null references items(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (item_id, tag_id)
);

-- 카드 간 연결선
create table edges (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  source_item_id uuid not null references items(id) on delete cascade,
  target_item_id uuid not null references items(id) on delete cascade,
  label text
);
```

**설계 노트**

- `frame_id`를 명시적 외래키로 둔다. 좌표만으로 "이 카드가 어느 프레임 안인가"를 매번 계산하면, 프레임을 옮길 때 자식이 안 따라온다. **드롭하는 순간 확정해서 저장한다.**
- `status`는 `active` / `trashed` 두 개만. (인박스를 안 만들기로 했으므로 — 4-1)
- `boards`는 여러 개 만들 수 있게 설계해뒀다 (개인 / 업무 / 취미 보드 분리). v1에선 1개만 써도 된다.
- **RLS(행 수준 보안)는 v1부터 필수.** 클라이언트가 anon key로 DB에 직접 붙는 구조라, RLS가 없으면 주소만 알면 남이 내 자료를 전부 읽어간다. 혼자 쓴다고 생략하면 안 된다.

## 7. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** | OG 스크래핑용 서버 함수가 필요. Vercel 무료 배포 |
| 스타일 | **Tailwind CSS** | 빠름. 다크모드 내장 |
| 캔버스 | **React Flow (`@xyflow/react`)** | 아래 참고 |
| PDF | **pdf.js (`react-pdf`)** | 썸네일 렌더 + 뷰어 + 텍스트 추출 전부 가능 |
| 백엔드 | **Supabase** (Postgres + Auth + Storage) | 4-2 참고 |
| 상태 | Zustand 정도 (가벼운 것) | 언두/리두 스택 관리용 |

### 캔버스 라이브러리

| 후보 | 판정 |
|---|---|
| **React Flow (xyflow)** | **✅ 채택.** MIT 무료. 팬/줌/다중선택/드래그/리사이즈/스냅/미니맵 다 있음. 노드가 그냥 React 컴포넌트라 링크 카드·PDF 썸네일 렌더가 자연스러움. 연결선도 기본 제공 |
| tldraw | 상용 라이선스 필요(무료는 워터마크) → **무료 원칙 위반.** 제외 |
| 직접 구현 | 다중 선택·스냅·관성 스크롤을 다 짜야 함. 시간 낭비 |

React Flow의 커스텀 노드로 `LinkCard`, `PdfCard`, `ImageCard`, `NoteCard`, `FrameNode`를 정의하면 그대로 우리 카드가 된다.

### 링크 메타데이터 수집 (`/api/unfurl`)

브라우저에서 남의 사이트를 직접 fetch하면 CORS로 막힌다. **Next.js 서버 함수에서 가져와야 한다.**

- `/api/unfurl?url=...` → HTML fetch → `og:title`, `og:description`, `og:image`, favicon 파싱 → **DB에 캐시**(같은 URL 재요청 방지)
- **봇 차단 사이트 대응이 실제로 골치 아프다.** 인스타그램, X, 일부 네이버 페이지는 OG를 안 준다.
  - 폴백 1: 파비콘만이라도 가져오기 (`google.com/s2/favicons?domain=...`)
  - 폴백 2: 도메인 + 경로를 제목으로
  - 특수 처리: YouTube는 oEmbed, GitHub은 OG가 잘 나옴 → **도메인별 어댑터 구조**로 짜두면 확장 쉽다
- **SSRF 방어 필수**: 사설 IP 대역·localhost 차단, 리다이렉트 횟수 제한, 타임아웃. 이게 없으면 남이 우리 서버를 통해 내부망을 찌를 수 있다

### 검색 — 한국어가 함정이다

Postgres 기본 전문검색(`to_tsvector`)에는 **한국어 형태소 분석기가 없다.** `simple` 설정으로는 "트랜스포머를"과 "트랜스포머"를 다른 단어로 본다.

**해법: `pg_trgm` 확장 + GIN 인덱스 + `ILIKE` / 유사도 검색.**

```sql
create extension if not exists pg_trgm;
create index items_search_trgm on items
  using gin ((coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(extracted_text,'')) gin_trgm_ops);
```

부분 문자열 매칭이라 한국어에서 잘 동작하고, 개인 규모(수천~수만 건)면 성능도 충분하다.

## 8. 기능 상세

### 8-1. 캔버스

- 팬(스페이스+드래그, 휠), 줌(Ctrl+휠)
- 카드 드래그, 다중 선택(드래그 박스, Shift+클릭), 그룹 이동
- 카드 리사이즈 (S/M/L 프리셋 + 자유 리사이즈)
- **프레임**: 제목 + 색을 가진 영역. 프레임을 옮기면 안의 카드가 따라온다
- **연결선**: 카드 간 화살표 + 라벨
- **언두/리두 (`Ctrl+Z` / `Ctrl+Shift+Z`)** — 화이트보드에서 이게 없으면 무섭다. 로컬 커맨드 스택으로 구현
- **LOD (Level of Detail)**: 줌아웃하면 카드를 "색 블록 + 파비콘"으로만 렌더, 줌인하면 전체 미리보기. 카드가 수백 개여도 부드럽다
- 저장: 낙관적 업데이트 + **드래그 종료 시점에** 디바운스 저장 (드래그 중 매 프레임 저장 금지)

### 8-2. 키보드 중심 조작 (데스크톱이니까)

| 단축키 | 동작 |
|---|---|
| `Ctrl+V` | 클립보드의 URL / 이미지를 커서 위치에 카드로 |
| `Ctrl+K` | 검색 팔레트 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 언두 / 리두 |
| `Delete` | 선택 카드 휴지통으로 |
| `Ctrl+D` | 복제 |
| `F` | 선택 카드로 화면 맞추기 (fit) |
| 더블클릭(빈 곳) | 메모 카드 생성 |
| `Ctrl+A` | 전체 선택 |

### 8-3. 카드 타입

| 타입 | 카드 앞면 | 클릭 시 |
|---|---|---|
| 링크 | og:image 썸네일, 제목, 도메인 + 파비콘 | 새 탭으로 원본 열기 |
| PDF | 1페이지 렌더 썸네일, 파일명, 페이지 수 | 앱 내 뷰어 (마지막 읽은 페이지부터) |
| 이미지 | 이미지 자체 | 라이트박스 |
| 메모 | 텍스트 (마크다운) | 인라인 편집 |

### 8-4. PDF 처리 (전부 브라우저에서 = 서버 비용 0)

1. 드래그앤드롭 → Supabase Storage에 업로드
2. **브라우저에서** pdf.js로 1페이지를 `<canvas>`에 렌더 → PNG로 압축 → 썸네일만 별도 업로드
3. 같이 `getTextContent()`로 앞 몇 페이지 텍스트를 뽑아 `extracted_text`에 저장 → 검색 대상이 됨
4. 뷰어: `react-pdf`. 페이지 넘김, 확대, `last_read_page` 저장 → 다음에 이어 읽기

### 8-5. 검색 & 태그

- `Ctrl+K` 팔레트: 제목·설명·태그·**PDF 본문** 통합 검색
- 결과 선택 → 캔버스가 해당 카드로 줌 이동 + 하이라이트
- 태그 필터: 선택한 태그가 없는 카드는 **캔버스에서 흐리게 처리**(숨기지 않음) — 위치 감각을 유지하면서 필터링

## 9. 성능

| 주제 | 대응 |
|---|---|
| 카드 수백~수천 개 | React Flow `onlyRenderVisibleElements` + LOD 렌더링 |
| 썸네일 로딩 | 뷰포트 진입 시 lazy load, 서명 URL 캐싱 |
| 저장 폭주 | 드래그 **종료** 시점 디바운스 저장 |
| 무료 티어 대역폭 | 썸네일은 작게(가로 480px 정도), 원본 PDF는 열 때만 다운로드 |

## 10. 보안

혼자 쓰지만 인터넷에 열려 있는 건 변하지 않는다.

- 인증: **Supabase Auth — Google OAuth 하나만**
- **모든 테이블에 RLS.** 유일한 방어선이다
- PDF는 **서명 URL(짧은 만료)**로만 서빙. 퍼블릭 버킷 금지
- `/api/unfurl`에 SSRF 방어 (7번 참고)

## 11. 마일스톤

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **M0. 기반** | Next.js + Supabase + Google 로그인 + 스키마 + RLS | 로그인하면 빈 캔버스가 뜬다 |
| **M1. 캔버스 + 링크** ⭐ | React Flow 셋업, 팬·줌·드래그, 위치 영속화, `Ctrl+V` → OG 메타 조회 → 링크 카드 | **URL을 붙여넣으면 예쁜 카드가 생기고, 새로고침해도 그대로 있다** |
| **M2. PDF** | 드래그앤드롭 업로드, 브라우저 썸네일 렌더, 뷰어, 이어 읽기 | PDF를 끌어다 놓고 클릭해서 읽을 수 있다 |
| **M3. 정리 도구** | 프레임(그룹), 색상, 메모 카드, 연결선, 다중 선택, **언두/리두** | 캔버스가 실제로 "정리"되는 느낌이 든다 |
| **M4. 검색** | pg_trgm 인덱스, `Ctrl+K` 팔레트, 카드로 줌 이동, 태그 | 100개가 넘어가도 원하는 걸 5초 안에 찾는다 |
| **M5. 다듬기** | LOD, 휴지통, 다크모드, 키보드 단축키 전체, 빈 상태 UI | 매일 쓰기에 불편함이 없다 |

**M1이 이 프로젝트의 진짜 시험대다.** "URL을 붙여넣으면 예쁜 카드가 캔버스에 딱 생긴다"가 기분 좋지 않으면 그 뒤는 다 소용없다. **M1을 만들고 최소 며칠은 실제로 링크를 모아보고**, 재미가 있는지부터 확인한 다음 M2로 간다.

## 12. 다음 단계 (v2 이후)

우선순위 순:

1. **브라우저 확장** — 어느 페이지에서든 원클릭 저장. 이때 비로소 "인박스"가 필요해진다 (저장 시점에 놓을 자리를 못 정하므로). 무료
2. **폰 지원** — 데이터가 서버에 있으므로 주소만 열면 "보기"는 바로 된다. 제대로 하려면 모바일 뷰 + 캡처 경로(iOS는 단축어)가 필요
3. 페이지 스냅샷 아카이브 (링크 썩음 방어)
4. PDF 하이라이트/주석
5. **AI 자동 태깅 (유료)** — 링크 본문/PDF 텍스트로 태그 3개 + 3줄 요약 생성. `claude-haiku-4-5` 기준 100만 토큰당 입력 $1 / 출력 $5라 항목당 비용은 사실상 무시할 수준이지만, **무료 원칙에서 벗어나므로 명시적으로 켜는 선택 기능**으로만

## 13. 리스크 & 결정 필요 사항

**리스크**

1. **OG 스크래핑 실패율.** 봇 차단 사이트에서 카드가 밋밋해지면 캔버스의 시각적 매력이 반감된다. → 도메인 어댑터 + 폴백 계층을 M1부터 성실히 짤 것
2. **Supabase 무료 프로젝트 일시정지.** 며칠 안 쓰면 멈추고, 다시 쓰려면 대시보드에서 재개해야 한다. 매일 쓰면 문제없지만 여행 다녀오면 겪는다. → 알고만 있으면 됨(클릭 한 번)
3. **정리를 안 하게 될 위험.** 붙여넣기만 하고 프레임 정리를 안 하면 캔버스가 그냥 어질러진 책상이 된다. → 태그만 달아도 검색이 되게 해서, 정리를 안 해도 최소한의 가치는 나오게 설계

**결정 필요 (착수 전)**

- **서버(Supabase)냐, 순수 로컬(IndexedDB)이냐?** (4-2)
  - *Supabase*: 데이터 안전, 여러 컴퓨터, 나중에 폰 가능. 대신 로그인 + 무료 티어 일시정지
  - *로컬*: 켜면 바로. 로그인 없음. 대신 **브라우저 데이터 지우면 전부 소실**, 이 컴퓨터에서만 접근, 나중에 폰 지원하려면 사실상 재작성
  - → 내 추천은 **Supabase**. 나중에 폰으로 확장할 여지를 공짜로 남겨두는 값이 크다
