# 인수인계 메모 (LinkScape)

> 마지막 갱신: 2026-07-16 / 직전 커밋 `e35288c` (확장 목록 보기·검색)
> 상태: **Vercel 배포 동작 중**, 로컬·원격 동기화됨, 헤드리스 브라우저 E2E 검증 체계 구축됨.
> E2E 테스트 계정·검증 노하우는 Claude 메모리(`linkscape-e2e-setup`)에도 있다.

---

## 1. 목적과 핵심 기능

카카오톡 "나에게 보내기"에 링크·PDF가 쌓이기만 하는 문제를 푼다.
**무한 캔버스 위 공간 배치 자체가 분류**가 되게 한다. 서비스명 **LinkScape** (구 pdflinkin).

**웹 (데스크톱 + 반응형 모바일)**
- `Ctrl+V` → 커서 자리에 링크 카드 (OG 메타 자동 수집) / PDF·이미지 드롭 → 카드
- 빈 곳 더블클릭 → 메모 / 카드 더블클릭 → 열기·편집
- **좌클릭 드래그(빈 곳에서 시작) = 올가미** — 조금이라도 걸치면 선택(Partial). 팬 = 스페이스/휠클릭/터치
- **우클릭 = 전용 메뉴** (카드: 열기·복제·삭제 / 빈 곳: 메모·그룹·붙여넣기·화면 맞추기)
- `Ctrl+K` 검색(PDF 본문 포함), `Ctrl+Z/D`, `Delete`→휴지통, `F` 화면 맞추기, 프레임(그룹), 연결선
- 모바일: 하단 플로팅 액션 바, 인스펙터는 하단 시트, 한 손가락 드래그 = 팬 (올가미 없음)

**웨일 확장 (`whale-extension/`, 순수 MV3 — 빌드 없음, 크롬 겸용)**
- 팝업: 현재 탭 담기 · Ctrl+V(링크/이미지/텍스트→메모) · PDF·이미지 드롭 (URL 입력 칸은 제거함)
- **목록 보기**: 그룹별 묶음(검은 ㄴ자 종속 표시) + 색 순서 정렬 + 키워드 검색(PDF 본문 포함)
- 우클릭 메뉴 4종: 링크/이미지/선택 텍스트/페이지 담기 (배지 ✓/! 피드백)
- **페이지 드롭존**: 아무 페이지에서 드래그 시작하면 우하단에 드롭 타겟 등장 (Shadow DOM)
- 이미지는 실제 다운로드+썸네일 업로드 (실패 시 핫링크 폴백)

---

## 2. 기술 스택

| 영역 | 선택 |
| --- | --- |
| 프레임워크 | Next.js **16.2.10** (App Router, Turbopack), React 19.2.4, TypeScript |
| 스타일 | Tailwind **v4** (`@theme` 토큰), 폰트: **Pretendard** (다이내믹 서브셋, npm `pretendard`) |
| 캔버스 | `@xyflow/react` 12.11 |
| PDF | `pdfjs-dist` 6.1 (전부 브라우저 처리) |
| 상태 | zustand 5 |
| 백엔드 | Supabase (Postgres + Auth + Storage), `@supabase/ssr` |
| 배포 | Vercel (push 시 자동) |
| E2E | `puppeteer-core`(devDep) + 로컬 Chrome 헤드리스 |
| 확장 | 순수 HTML/CSS/JS, Manifest V3 |

개발 환경: Windows 11, PowerShell, Node 22. `gh` CLI 없음(자격증명 캐시로 push).

---

## 3. 폴더 구조와 파일 역할

```
src/
  middleware.ts               세션 갱신 + 인증 가드. env 없으면 503
  app/
    globals.css               ★ 디자인 토큰 + .glass-float + RF 오버라이드
    loading.tsx, board/loading.tsx   진입 시 흰 화면 대신 즉시 스트리밍되는 로딩 화면
    layout.tsx                Pretendard, suppressHydrationWarning(확장 주입 대응)
    login/page.tsx            이메일 로그인/가입 (오류 한국어 번역)
    board/page.tsx            ★ 서버 컴포넌트. 보드/카드 로드, extracted_text 는 null 처리
    api/unfurl/route.ts       OG 수집 (SSRF 방어, 로그인 필요, 서버 함수는 이거 하나)
  components/board/
    BoardClient.tsx           조립 + 태그필터바 + 빈 캔버스 안내(스토어 기준 실시간)
    Canvas.tsx                ★ RF 캔버스. 올가미/팬/우클릭 메뉴/단축키/드롭. isMobile 감지
    ContextMenu.tsx           우클릭 메뉴 컴포넌트 (글래스)
    useBoardActions.ts        삭제/복제/엣지삭제/열기 — 툴바·단축키·메뉴 공용
    useIngest.ts              ★ 링크/파일 → 카드 생성 (업로드·썸네일·본문추출)
    usePdfBackfill.ts         ★ 썸네일 없는 PDF 자동 보정 (확장 업로드분 처리)
    Toolbar.tsx               플로팅 알약 바 + 햄버거 드롭다운 + 모바일 하단 액션 바
    Inspector.tsx             단일 선택 패널 (모바일=하단 시트). 태그 UI 는 제거됨
    SearchPalette.tsx         Ctrl+K (pg_trgm DB 검색 → setCenter)
    TrashPanel.tsx, Viewer.tsx  휴지통 / PDF·이미지 뷰어(이어읽기 확인창 포함)
    nodes/                    CardShell(색=외곽선), Link/Pdf/Image/Note/FrameNode
  store/board.ts              ★★ 스냅샷 diff 저장 큐 + 언두/리두. 이 앱의 심장
  lib/                        supabase/, pdf.ts, storage.ts, geometry.ts, palette.ts, url.ts
supabase/migrations/0001_init.sql   스키마+RLS+버킷 (실행 완료됨)
whale-extension/              ★ 웨일/크롬 확장 (전체가 순수 JS)
  manifest.json               MV3. content_scripts + <all_urls>
  config.js                   Supabase URL/anon key (공개 가능 키)
  api.js                      인증·PostgREST·Storage·검색·목록 — 팝업/워커/콘텐츠 3환경 공용
  background.js               우클릭 메뉴, 이미지 다운로드(saveImage), 배지
  dropzone.js                 페이지 드롭존 콘텐츠 스크립트 (Shadow DOM)
  popup.html/css/js           팝업 UI (웹 디자인 토큰 복제) + 목록 보기 화면
```

---

## 4. 구현 완료된 것

- HANDOFF 구버전의 전 기능(스키마·RLS·캔버스·프레임·언두·검색·휴지통 등) + 아래 전부:
- **LinkScape 리브랜딩** + Pretendard + 글래스 UI(플로팅 툴바·빈캔버스 카드·인스펙터·메뉴)
- 카드 색 = **외곽선 2px** (중립은 헤어라인 1px), 배경 채움 없음 (`lib/palette.ts`)
- 우클릭 컨텍스트 메뉴, 좌클릭 올가미(Partial), 더블클릭 전 기능 복구
- 반응형·모바일 개편 (하단 액션 바, 하단 시트, 터치 팬, 미니맵/컨트롤 숨김)
- PDF 뷰어: 항상 1쪽부터 + "이어 읽을까요?" 확인창 (응답 전 위치 덮어쓰기 방지)
- 업로드 원본 다운로드: 인스펙터·뷰어 헤더·PDF 카드 우상단 칩(열기 오버레이보다 DOM 뒤에 둬야 클릭됨).
  파일명 = 카드 제목 + 원본 확장자(`downloadFileName`). blob + download 속성으로 저장 —
  Supabase Content-Disposition(download 옵션)은 한글 파일명을 percent-인코딩 그대로 저장해 버려서 못 쓴다
- 햄버거 메뉴: 바깥 클릭 닫힘 + 인스펙터와 양방향 상호배제
- 진입 로딩 화면(loading.tsx), PDF 썸네일/본문 백필(usePdfBackfill)
- 웨일 확장 전체 (1번 항목 참고) — 팝업·우클릭·드롭존·목록·검색
- **브라우저 E2E 전 기능 검증 완료** (구버전 메모의 "미검증" 블로커 해소)

## 5. 해결한 주요 문제 (다시 밟지 말 것)

| 문제 | 해결 |
| --- | --- |
| 올가미가 카드 하나만 감싸도 **전체 선택**됨 | 컨트롤드 노드에 `measured:{width,height}` 를 반드시 전달. 없으면 RF 가 노드 배열 재생성 때마다 "미측정"으로 리셋하고, 미측정 노드는 `getNodesInside` 에서 무조건 포함됨 |
| 캔버스 안 **더블클릭 전부 무반응** (메모 생성·카드 열기·편집) | RF `zoomOnDoubleClick` 기본 true 가 d3-zoom 에서 이벤트를 삼킴 → `zoomOnDoubleClick={false}` 유지 |
| 햄버거 바깥클릭 오버레이가 동작 안 함 | 헤더의 `backdrop-filter` 가 fixed 포지션 기준을 가로채 오버레이가 헤더만 덮음 → 문서 레벨 `pointerdown` 리스너로 |
| 웨일 확장 로드 거부 ("Only one of browser_action…") | 웨일 `sidebar_action` 은 MV2 전용 — MV3 manifest 에 넣지 말 것 |
| 확장 담기가 성공인데 "실패" 표시 | PostgREST INSERT 는 **본문 없는 201** — `res.json()` 강제 금지 (api.js rest() 는 text 로 처리) |
| localhost hydration 경고 | 브라우저 확장이 html/body 에 속성 주입 → `suppressHydrationWarning` (해당 두 태그만) |
| Chrome 137+ 에서 `--load-extension` 제거됨 | 확장 E2E 는 chrome API 스텁 하네스 페이지에 스크립트 주입으로 검증 (웨일 UI 설치는 무관) |
| CDP 로 더블클릭이 안 만들어짐 | down/up 후 `down({clickCount:2})/up({clickCount:2})` |
| PDF 본문이 초기 로딩을 무겁게 함 / pdfjs `destroy()` 없음 / 한국어 검색 | 구버전과 동일 (extracted_text 미전송 · `destroyPdf()` · pg_trgm) |

---

## 6. 남아 있는 것 / 미완성

### 여러 보드 (2026-07-18)
- `/board?board=<id>` 로 활성 보드 선택. `board/page.tsx` 가 `searchParams`(Next 16 = await Promise)에서 읽어 소유 보드면 로드, 아니면 가장 오래된 보드
- 툴바 `BoardSwitcher`(LinkScape 로고 옆 pill): 보드 목록·전환·이름변경(인라인)·삭제(confirm)·생성. 햄버거 메뉴와 `openPanel` 로 상호배제
- **전환·생성·삭제는 `await flush()` 후 `router.push`** — 저장 큐가 전역 1개라 flush 없이 이동하면 이전 보드 변경분 유실
- 보드 생성/이름변경/삭제는 supabase 브라우저 클라이언트로 직접 write(스냅샷 큐 예외 — boards 는 카드/프레임/엣지 아님)
- **한계**: 보드 삭제 시 스토리지 파일은 cascade 안 됨(고아 파일 잔존). 카드/프레임/엣지 행은 FK cascade 로 삭제됨

### 알려진 한계 (동작엔 문제 없음)
- 확장으로 담은 링크 카드는 **OG 메타 없음** (호스트명+파비콘만). `/api/unfurl` 은 쿠키 세션 기반이라 확장에서 못 씀
- 확장으로 담은 카드는 보드를 **새로고침해야** 보임 (realtime 미구현)
- 확장 목록/검색 결과 클릭 = 그 문서/링크 자체를 새 탭으로 연다 (링크는 url, 업로드 파일은 `signStorageUrl` 서명 URL, 메모 등은 보드 폴백). 보드 카드로의 딥링크(`/board?item=<id>` → setCenter)는 아직 없음
- 태그 입력 UI 는 제거됨 (사용자 요청). 필터바 코드·DB 스키마는 남아 있음
- Next 16 `middleware.ts` deprecation 경고 (동작 무관, 방치 중)
- 실기기(폰·웨일 브라우저) 검증은 사용자 수동 확인에 의존 — 코드 레벨 E2E 는 완료

### 만들지 않은 것 (plan.md v2)
페이지 스냅샷 아카이브 / PDF 하이라이트 / AI 자동 태깅 / 모바일 전용 앱

---

## 7. 환경변수 · API · 배포

- **환경변수 2개뿐**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 로컬 `.env.local` 에 실제 키 있음(gitignore). **Vercel 에도 설정 완료 → 배포 정상 동작 중**
  - anon key 는 공개 가능 (방어는 RLS). `service_role` 절대 금지
- **Supabase** `nfwthowdcyciorqabiae`: 스키마 실행 완료, **이메일 확인 꺼짐**(가입 즉시 로그인).
  스키마 변경은 `supabase/migrations/` 에 추가 후 SQL Editor 에서 직접 실행 (CLI 없음)
- **배포**: https://pdflinkin.vercel.app (Vercel 프로젝트·GitHub 저장소명은 옛 이름 그대로 — 바꾸려면 각 대시보드에서)
- **Git**: `https://github.com/bugoms/pdflinkin` (main). 한글 커밋 메시지는 **파일로 쓰고 `git commit -F`**
- **E2E**: `node <스크립트>` 로 puppeteer-core + `C:/Program Files/Google/Chrome/Application/chrome.exe` headless.
  테스트 계정 `pdflinkin.e2e.test@gmail.com` (비밀번호는 Claude 메모리 `linkscape-e2e-setup`). 실사용자 보드와 분리됨
- **확장 설치**: `whale://extensions` → 개발자 모드 → 압축해제 설치 → `whale-extension/`. 코드 수정 후엔 새로고침(⟳)

---

## 8. 다음 채팅에서 가장 먼저 할 일

1. **사용자 피드백 대기 상태** — 최근 흐름은 "사용자가 실사용하며 UI/UX 다듬기"다.
   새 요청이 오면 이 메모의 9번 규칙 안에서 바로 구현하면 된다.
2. 요청이 없다면 우선순위 높은 개선 후보:
   - 확장 목록/검색 클릭 시 **해당 카드로 딥링크** (`/board?item=<id>` + `setCenter`)
   - 확장 링크 카드 OG 메타 채우기 (웹 접속 시 백필 — usePdfBackfill 패턴 재사용)
   - Supabase Realtime 으로 보드 자동 갱신
3. 검증은 반드시 헤드리스 E2E 로 실동작 확인 (패턴: 로그인 → `.react-flow__pane` 대기 → 상호작용 → REST 로 DB 확인)

---

## 9. 반드시 지켜야 할 조건 · 주의사항

### 아키텍처 (변경 금지)
- **저장은 스냅샷 diff 하나로만**: 모든 변경은 `useBoard.apply()`(히스토리) / `applyLive()`(드래그 중).
  Supabase 직접 write 금지 (예외: extracted_text, 태그, 휴지통 영구삭제. 확장은 별개 REST 경로)
- **`extracted_text` 는 브라우저 상태에 절대 담지 않는다** (upsert 페이로드에서도 제거됨)
- **PDF 처리는 전부 클라이언트**. 서버 함수는 `/api/unfurl` 하나뿐
- **모든 테이블 RLS** + 비공개 버킷 + 서명 URL. 스토리지 경로 `{user_id}/{item_id}.{ext}`

### React Flow
- 노드는 스토어에서 유도(controlled). **`measured:{width,height}` 필수** (5번 표 참고)
- **`zoomOnDoubleClick={false}` 유지**, `deleteKeyCode={null}`, 프레임 노드가 배열에서 자식보다 앞
- `dimensions` 변경은 `setAttributes` true 일 때만 반영
- 올가미는 데스크톱 전용 — `isMobile`(pointer:coarse 또는 <640px, matchMedia 실시간) 이면 드래그=팬

### 디자인 (globals.css `@theme` 이 단일 출처)
- Action Blue(#0066cc) 하나만 "누를 수 있음". 카드 색은 분류용 — **외곽선 2px로만** (배경 채움 금지)
  - 선택지는 토큰 5종(`PICKER_TOKENS`) + 커스텀 팔레트(`#rrggbb` 저장, `isCustomColor` 판별, 인라인 스타일로 렌더).
    violet 토큰은 선택지에서 빠졌지만 기존 카드 때문에 `CARD_COLORS` 에 남아 있음
- 그림자 예외는 둘뿐: `.product-shadow`(PDF 지면·사진), `.glass-float`(떠 있는 크롬)
- 모양 문법: rounded-full=액션·알약 / apple-md(11px)=유틸 / apple-lg(18px)=카드·패널
- 폰트는 Pretendard 하나. 다크 모드 없음
- 확장 popup.css 는 웹 토큰의 복제본 — 웹 토큰을 바꾸면 같이 갱신

### 확장 (whale-extension)
- `sidebar_action` 절대 추가 금지 (MV2 전용, 로드 거부됨)
- `api.js` 는 팝업·서비스워커·콘텐츠 스크립트 **3환경 공용** — DOM API 금지(OffscreenCanvas 사용), chrome.storage 없으면 localStorage 폴백 유지
- `rest()` 는 빈 201 응답 처리 유지. 이미지 다운로드는 CORS 때문에 반드시 background 에서
- 새 카드 배치는 "가장 최근 카드 + 32px 계단식" (`nextPosition`)

### 코드·커밋
- Tailwind 클래스 동적 조립 금지 / effect 안 동기 setState 금지 (React 19 lint)
- 커밋 전: `npx tsc --noEmit` + `npx eslint src --max-warnings=0` + `npm run build` + **헤드리스 E2E 실동작 확인**
