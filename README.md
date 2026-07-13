# pdflinkin

링크와 PDF를 무한 캔버스에 펼쳐두는 개인 아카이브. **데스크톱 웹 전용, 운영비 0원.**

카카오톡 "나에게 보내기"에 링크와 PDF가 시간순으로 쌓이기만 하고 다시 찾지 못하는 문제를 풀기 위한 도구입니다.
폴더처럼 "하나의 항목은 하나의 위치"를 강요하지 않고, 책상에 종이를 늘어놓듯 **공간에 배치하는 것 자체가 분류**가 됩니다.

기획 배경과 설계 결정은 [plan.md](./plan.md) 참고.

---

## 처음 한 번만 하는 설정

### 1. Supabase 스키마 만들기

[Supabase 대시보드](https://supabase.com/dashboard/project/nfwthowdcyciorqabiae) → 좌측 **SQL Editor** →
[`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) 파일 내용을 **전부 복사해서 붙여넣고 Run**.

테이블, 인덱스, RLS 정책, Storage 버킷(`files`)까지 한 번에 만들어집니다. 여러 번 실행해도 안전합니다.

### 2. 환경변수 넣기

Supabase 대시보드 → **Project Settings → API** 에서 두 값을 복사해 `.env.local` 에 채웁니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://nfwthowdcyciorqabiae.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / public key>
```

> `anon key` 는 공개되어도 되는 키입니다. 실제 보호는 DB의 RLS 정책이 담당합니다.
> `service_role` 키는 **절대** 넣지 마세요.

### 3. (권장) 이메일 확인 끄기

혼자 쓰는 서비스라 확인 메일이 번거롭습니다.
대시보드 → **Authentication → Sign In / Providers → Email** → *Confirm email* 을 끄면 가입 즉시 로그인됩니다.

### 4. 실행

```bash
npm install
npm run dev
```

http://localhost:3000 → 이메일/비밀번호로 가입하면 바로 빈 캔버스가 열립니다.

---

## 쓰는 법

| 동작 | 방법 |
| --- | --- |
| 링크 저장 | 캔버스에서 **Ctrl+V** (마우스 커서 자리에 카드 생성) · 여러 개를 한 번에 붙여넣으면 격자로 배치 |
| PDF · 이미지 저장 | 파일을 캔버스로 **드래그앤드롭** |
| 메모 | 빈 곳 **더블클릭** |
| 그룹(프레임) | 툴바의 `+ 그룹` · 카드를 그 위로 끌어다 놓으면 소속됨 (그룹을 옮기면 같이 따라감) |
| 카드 연결 | 카드에 마우스를 올리면 나오는 점을 끌어서 다른 카드로 |
| 검색 | **Ctrl+K** — 제목 · 설명 · 메모 · **PDF 본문**까지 검색, 고르면 그 카드로 화면이 이동 |
| 되돌리기 | **Ctrl+Z** / **Ctrl+Shift+Z** |
| 복제 | **Ctrl+D** |
| 삭제 | **Delete** (휴지통으로 이동, 복원 가능) |
| 화면 맞추기 | **F** (선택한 카드 기준) |
| 태그 | 카드 선택 → 우측 패널에서 입력 · 상단 태그 칩으로 필터(안 맞는 카드는 흐려짐) |

---

## 구조

```
src/
  app/
    board/page.tsx        서버 컴포넌트 — 보드/카드/태그를 읽어 클라이언트에 넘김
    login/page.tsx        이메일 로그인·가입
    api/unfurl/route.ts   링크 미리보기(OG 메타) 수집 + SSRF 방어
  components/board/
    BoardClient.tsx       전체 조립
    Canvas.tsx            React Flow 캔버스 · 붙여넣기/드롭/단축키
    useIngest.ts          링크·파일을 카드로 만드는 경로
    Viewer.tsx            PDF 뷰어 / 이미지 라이트박스
    nodes/                카드 종류별 렌더링
  store/board.ts          상태 + 언두/리두 + 디바운스 저장 큐
  lib/                    pdf · storage · geometry · url · palette
supabase/migrations/      DB 스키마 + RLS + Storage 정책
```

### 알아둘 만한 설계

- **저장은 스냅샷 diff로 한다.** 모든 변경은 "이전 상태 → 새 상태"이고, 그 차이를 그대로 저장 큐에 넣습니다.
  생성·수정·삭제·언두·리두가 전부 같은 경로를 타므로 저장 로직이 한 곳에만 존재합니다. (`src/store/board.ts`)
- **PDF는 전부 브라우저에서 처리한다.** 썸네일 렌더링과 본문 텍스트 추출을 pdf.js로 클라이언트에서 하고
  결과만 업로드합니다. 서버 연산 비용이 0이라 유료 구간을 건드리지 않습니다.
- **PDF 본문은 브라우저로 내려보내지 않는다.** 검색 대상이지만 용량이 커서 DB에만 두고,
  검색은 `pg_trgm` 인덱스를 쓰는 DB 쿼리로 합니다. (Postgres 기본 전문검색은 한국어 형태소 분석기가 없습니다.)
- **파일은 비공개 버킷 + 서명 URL.** 퍼블릭 버킷을 쓰지 않습니다.

---

## 비용

전부 무료 티어 안에서 굴러갑니다.

| 항목 | 서비스 | 비용 |
| --- | --- | --- |
| 호스팅 | Vercel Hobby | 0원 |
| DB · 인증 · 파일 | Supabase Free | 0원 |
| 캔버스 | React Flow (MIT) | 0원 |
| PDF | pdf.js (Apache-2.0) | 0원 |

> ⚠️ Supabase 무료 프로젝트는 **며칠 쓰지 않으면 일시정지**됩니다. 대시보드에서 클릭 한 번으로 재개됩니다.

---

## Vercel 배포

`.env.local` 은 git에 올라가지 않으므로 **Vercel에 환경변수를 따로 넣어야 합니다.**
안 넣으면 미들웨어가 시작하자마자 죽어 `MIDDLEWARE_INVOCATION_FAILED` 500 이 뜹니다.

1. Vercel 프로젝트 → **Settings → Environment Variables** 에 두 개 추가
   (Production / Preview / Development 전부 체크)

   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://nfwthowdcyciorqabiae.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = <anon / public key>
   ```

2. **Deployments → 최신 배포 → Redeploy.**
   `NEXT_PUBLIC_` 변수는 빌드할 때 코드에 박히므로, 값을 넣은 뒤 **반드시 다시 빌드해야** 반영됩니다.

3. Supabase 대시보드 → **Authentication → URL Configuration** 의
   *Site URL* 과 *Redirect URLs* 에 배포 주소(`https://pdflinkin.vercel.app`)를 추가.
   (이메일 확인을 끄지 않았다면 확인 메일의 링크가 여기로 돌아옵니다.)
