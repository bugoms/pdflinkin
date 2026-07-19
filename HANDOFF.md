# 인수인계 메모 (LinkScape)

> 마지막 갱신: 2026-07-19 / `3c76067`(실시간 반영) 위에 이번 세션 4개 개선 커밋
> 브랜치 `main`, 로컬·원격 동기화됨. **이번 세션의 4개 개선(딥링크·OG 백필·스토리지 정리·웹 목록 보기) 커밋·푸시 완료 — 4종 검증 통과(E2E 14/14).** (`plan1.md`만 미추적, 커밋 대상 아님)
> 상태: **Vercel 배포 동작 중**, Supabase 마이그레이션 0001·0002 실행 완료, 헤드리스 E2E 검증 체계 구축.
> E2E 테스트 계정·검증 노하우는 Claude 메모리(`linkscape-e2e-setup`)에도 있다.

---

## 1. 목적과 핵심 기능

카카오톡 "나에게 보내기"에 링크·PDF가 쌓이기만 하는 문제를 푼다.
**무한 캔버스 위 공간 배치 자체가 분류**가 되게 한다. 서비스명 **LinkScape** (구 pdflinkin).

**웹 (데스크톱 + 반응형 모바일)**
- `Ctrl+V` → 커서 자리에 링크 카드 (OG 메타 자동 수집) / PDF·이미지 드롭 → 카드
- 빈 곳 더블클릭 → 메모 / 카드 더블클릭 → 열기·편집
- **좌클릭 드래그(빈 곳) = 선택 올가미**(Partial). 팬 = 스페이스/휠클릭/터치
- **그룹**: 툴바 "그룹 ▾" → 사각형/자유형 올가미로 영역을 감싸면 그 안 카드가 한 그룹이 됨. 카드를 프레임 밖으로 드래그하면 그룹에서 빠지고, 안으로 끌면 소속됨
- **여러 보드**: 로고 옆 `BoardSwitcher` 로 보드 생성·전환·이름변경·삭제
- **실시간**: 확장·다른 탭에서 담으면 새로고침 없이 즉시 캔버스에 나타남
- **우클릭 메뉴** (카드: 열기·복제·삭제 / 빈 곳: 메모·그룹 추가(빈 프레임)·붙여넣기·화면 맞추기)
- `Ctrl+K` 검색(PDF 본문 포함), `Ctrl+Z/D`, `Delete`→휴지통, `F` 화면 맞추기, 연결선
- 업로드 원본 다운로드(인스펙터·뷰어·PDF 카드 우상단 칩), 카드 색 = 외곽선(6종 토큰 + 커스텀 팔레트)
- 모바일: 하단 플로팅 액션 바, 인스펙터는 하단 시트, 한 손가락 드래그 = 팬 (올가미 없음)

**웨일 확장 (`whale-extension/`, 순수 MV3 — 빌드 없음, 크롬 겸용)**
- 팝업: 현재 탭 담기 · Ctrl+V(링크/이미지/텍스트→메모) · PDF·이미지 드롭
- **목록 보기**: **보드별 헤더**(모든 보드 조회) → 그룹별 묶음(ㄴ자 종속) + 색 순서 + 키워드 검색(PDF 본문) + 행 hover 삭제(휴지통). 행 클릭 = 그 문서/링크 자체를 새 탭으로 엶
- 우클릭 메뉴 4종: 링크/이미지/선택 텍스트/페이지 담기 (배지 ✓/! 피드백)
- **페이지 드롭존**: 아무 페이지에서 드래그 시작하면 우하단에 드롭 타겟 (Shadow DOM)
- 이미지는 실제 다운로드+썸네일 업로드 (실패 시 핫링크 폴백)

---

## 2. 기술 스택

| 영역 | 선택 |
| --- | --- |
| 프레임워크 | Next.js **16.2.10** (App Router, Turbopack), React 19.2.4, TypeScript |
| 스타일 | Tailwind **v4** (`@theme` 토큰), 폰트: **Pretendard** (npm `pretendard`) |
| 캔버스 | `@xyflow/react` 12.11 |
| PDF | `pdfjs-dist` 6.1 (전부 브라우저 처리) |
| 상태 | zustand 5 |
| 백엔드 | Supabase (Postgres + Auth + Storage + **Realtime**), `@supabase/ssr` |
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
    globals.css               ★ 디자인 토큰 + .glass-float + RF 오버라이드 (단일 출처)
    layout.tsx                Pretendard, suppressHydrationWarning(확장 주입 대응)
    login/page.tsx            이메일 로그인/가입 (오류 한국어 번역)
    board/page.tsx            ★ 서버 컴포넌트. searchParams(await)에서 board id → 보드/카드 로드
    icon.svg, apple-icon.png, favicon.ico   웹 파비콘(미니 캔버스 심벌)
    api/unfurl/route.ts       OG 수집 (SSRF 방어, 로그인 필요, 서버 함수는 이거 하나)
  components/board/
    BoardClient.tsx           조립 + 태그필터바 + 빈 캔버스 안내 + useRealtime/usePdfBackfill 호출
    Canvas.tsx                ★ RF 캔버스. 올가미/팬/우클릭 메뉴/단축키/드롭/settleDrag. GroupLasso 렌더
    BoardSwitcher.tsx         ★ 보드 목록·전환·이름변경(인라인)·삭제(confirm)·생성 드롭다운
    GroupLasso.tsx            ★ 올가미 오버레이(사각형/자유형) + 감쌈 판정 + 프레임 생성
    useRealtime.ts            ★ realtime 구독 → applyRemote 로만 반영
    Toolbar.tsx               플로팅 바(BoardSwitcher·그룹▾·메모·삭제·undo) + 햄버거 + 모바일 하단바
    Inspector.tsx             단일 선택 패널. 라벨 "제목", 색(토큰5+커스텀 피커), 다운로드 버튼
    Viewer.tsx                PDF·이미지 뷰어(이어읽기 확인창 + 다운로드)
    useBoardActions.ts        삭제/복제/엣지삭제/열기 공용
    useIngest.ts              ★ 링크/파일 → 카드 생성 (업로드·썸네일·본문추출·addFrame)
    usePdfBackfill.ts         썸네일 없는 PDF 자동 보정 (확장 업로드분)
    useLinkBackfill.ts        ★ 확장 링크 카드에 OG 메타 백필 (변경 시에만 apply)
    ListPanel.tsx             ★ 웹 목록 보기 — 전 보드 조회·그룹·색정렬·검색·삭제·클릭 딥링크
    ContextMenu.tsx, SearchPalette.tsx, TrashPanel.tsx
    nodes/                    CardShell(색=외곽선), Link/Pdf/Image/Note/FrameNode, types.ts
  store/
    board.ts                  ★★ 스냅샷 diff 저장 큐 + 언두/리두 + applyRemote/hasPending. 심장
    groupMode.ts              올가미 모드 상태(null|'rect'|'free')
    selection.ts, viewer.ts   선택/뷰어 상태
  lib/                        supabase/, pdf.ts, storage.ts, geometry.ts, palette.ts, url.ts
supabase/migrations/
  0001_init.sql               스키마+RLS+버킷 (실행 완료)
  0002_realtime.sql           items/frames/edges publication + REPLICA IDENTITY FULL (실행 완료)
whale-extension/              ★ 웨일/크롬 확장 (전체가 순수 JS)
  manifest.json  config.js    MV3 / Supabase URL·anon key·WEB_URL
  api.js                      인증·PostgREST·Storage·검색·목록·삭제 — 팝업/워커/콘텐츠 3환경 공용
  background.js  dropzone.js  우클릭 메뉴·이미지 다운로드 / 페이지 드롭존
  popup.html/css/js           팝업 UI(웹 토큰 복제) + 보드별 목록 보기
  icons/                      확장 아이콘(미니 캔버스, 원본 icon.svg)
```

---

## 4. 구현 완료된 것

구버전 전 기능(스키마·RLS·캔버스·프레임·언두·검색·휴지통·모바일·PDF 뷰어·확장 팝업/우클릭/드롭존) +
이번 세션(커밋 `136faf4`~`3c76067`):

- 아이콘 교체(미니 캔버스 심벌 — 확장 16/48/128 + 웹 favicon/icon.svg/apple-icon)
- **커스텀 색 팔레트**: 색 6번째 자리를 네이티브 컬러 피커로. `#rrggbb` 저장, `isCustomColor` 판별, 인라인 스타일 렌더 (`lib/palette.ts` `PICKER_TOKENS`)
- 입력창 이중 포커스 링 제거(전역 `:focus-visible` 아웃라인을 input/textarea 에서 끔)
- **업로드 원본 다운로드**(인스펙터·뷰어 헤더·PDF 카드 우상단 칩). 파일명 = 카드 제목 + 원본 확장자(`downloadFileName`), blob+download 저장
- 확장 목록/검색 클릭 = 그 문서/링크 자체를 엶(링크=url, 파일=`signStorageUrl`, 메모=보드 폴백)
- 인스펙터 카드 라벨을 종류명 대신 **"제목"** 으로(그룹은 "그룹")
- 확장 목록 행 hover **삭제 아이콘**(`api.trashItem` → status='trashed', 소프트 삭제)
- **여러 보드** — 생성·전환·이름변경·삭제 (`BoardSwitcher`, `/board?board=<id>`)
- **올가미 그룹** — 사각형/자유형으로 영역을 감싸 그룹 생성 (`GroupLasso`, `groupMode`)
- **그룹에서 카드 빼내기** — 프레임 자식의 `extent:"parent"` 제거 (드래그로 탈출/재소속)
- **확장 목록 보드 표시** — 전 보드 조회 + 보드 헤더
- **실시간 반영(Realtime)** — 담자마자 보드에 나타남 (`useRealtime` + `applyRemote`)

#### 이번 세션 (커밋·푸시 완료 — 4종 검증 통과, E2E 14/14)

- **카드 딥링크 인프라** (`/board?item=<id>`) — 목록(웹·확장)의 보조 아이콘 "↦ 보드에서 보기"가 이 주소로 들어오면 그 카드가 있는 보드로 이동해 화면을 옮기고 선택한다. 바로 열지 않고 위치를 보여준다(SearchPalette 철학).
  - `board/page.tsx` 가 `?item=` 을 받아 그 카드의 board_id 를 조회해 해당 보드를 로드 → `focusItemId` 를 `Canvas` 로 전달 → `setCenter`+`selectOnly`, 그 뒤 `history.replaceState` 로 URL 에서 item 제거(재렌더 재포커스 방지). `focusItemId` 있으면 초기 `fitView` 끔.
- **목록 행 클릭 = 문서/링크 열기** (웹·확장 동일) — 링크=url(http 이미지 링크는 og_image_url 폴백), 파일=서명 URL, 메모 등 열 대상 없으면 그 카드 위치로 이동(딥링크 폴백). **딥링크(보드로 이동)는 행 hover 시 나타나는 보조 아이콘 "↦ 보드에서 보기"로 분리** (사용자 요청 — 클릭은 열기, 보조 아이콘은 위치 찾기).
- **확장 링크 카드 OG 메타 백필** (`useLinkBackfill`) — 확장이 담은 링크(호스트명+파비콘뿐)를 웹 열람 시 `/api/unfurl` 로 채운다. **unfurl 결과가 카드와 정말 달라졌을 때만 `apply`** — 메타 없는 사이트 반복 처리·언두 오염 방지(unfurl 은 성공/실패 모두 캐시).
- **보드 삭제 시 스토리지 고아 파일 정리** — `BoardSwitcher.deleteBoard` 가 보드 삭제 전에 그 보드 카드들의 `storage_path`·`thumb_path` 를 모아 `removePaths`. DB 행은 여전히 FK cascade.
- **웹 목록 보기** (`ListPanel`, 햄버거 메뉴 "목록 보기") — 확장의 목록 보기를 웹에 이식. 전 보드 조회 → 보드별/그룹별·색 순서 나열 + 검색(PDF 본문) + 행 클릭=문서 열기 + hover 보조 아이콘(↦ 보드에서 보기 / 삭제). 딥링크: 같은 보드=`setCenter`, 다른 보드=`flush` 후 `router.push`. 파일 열기는 서명이 비동기라 팝업 차단 피하려 탭 먼저 열고 주소 채움. 다른 보드 카드 삭제만 REST 직접 소프트삭제(스토어 없음), 현재 보드 카드는 `apply` 정식 경로.

### 주요 서브시스템 상세

**여러 보드**
- `board/page.tsx` 가 `searchParams`(Next 16 = await Promise)에서 board id 를 읽어 소유 보드면 로드, 아니면 가장 오래된 보드. 사용자 전체 보드 목록도 `BoardClient`→`Toolbar`→`BoardSwitcher` 로 전달
- **전환·생성·삭제는 `await flush()` 후 `router.push`** — 저장 큐가 전역 1개라 flush 없이 이동하면 이전 보드 변경분 유실
- 보드 생성/이름변경/삭제는 supabase 브라우저 클라이언트로 직접 write (스냅샷 큐 예외 — boards 는 카드/프레임/엣지가 아님)

**실시간 반영(Realtime)**
- `useRealtime(boardId)`(BoardClient 에서 호출)가 현재 보드의 items/frames/edges 구독
- **저장이 아니라 표시 갱신**: 수신은 `applyRemote` 로만 반영(저장 큐 `enqueueDiff`·언두 스택 안 탐) → **에코 루프 없음**
- 에코/충돌 방지: `hasPending(table,id)`(내가 방금 쓴 것)·`interaction`(드래그 중)이면 스킵. items 의 `extracted_text` 는 항상 null
- **★ 반드시 구독 "전에" `supabase.realtime.setAuth(token)`** — 순서 `getSession → setAuth → subscribe`
- 전제: `0002_realtime.sql` 실행 완료 (publication 변경은 realtime 서비스가 반영하는 데 수 초 걸림)

---

## 5. 해결한 주요 문제 (다시 밟지 말 것)

| 문제 | 해결 |
| --- | --- |
| realtime 구독은 SUBSCRIBED 인데 **이벤트 0** | 구독 전에 `realtime.setAuth(token)` 안 하면 채널이 anon 으로 맺어져 RLS 가 다 막음. getSession→setAuth→subscribe 순서 |
| 그룹 안 카드를 **밖으로 못 뺌** | 프레임 자식에 `extent:"parent"` 를 주면 경계 안에 갇힘. `parentId` 만 주고 extent 는 빼면 `settleDrag` 가 처리 |
| 다운로드 시 한글 파일명이 `%EB..` 로 깨짐 | Supabase Content-Disposition(download 옵션)이 percent-인코딩 그대로 저장 → blob 으로 받아 `a[download]` 로 저장 |
| effect 안 setState lint 에러(React 19) | effect 대신 "렌더 중 상태 조정"(prev prop 비교) 패턴 (`BoardSwitcher`) |
| 올가미가 카드 하나만 감싸도 **전체 선택** | 컨트롤드 노드에 `measured:{width,height}` 필수. 없으면 미측정 노드가 무조건 포함됨 |
| 캔버스 **더블클릭 무반응** | RF `zoomOnDoubleClick` 기본 true 가 이벤트 삼킴 → `zoomOnDoubleClick={false}` |
| 햄버거 바깥클릭 안 닫힘 | 헤더 `backdrop-filter` 가 fixed 기준 가로챔 → 문서 레벨 `pointerdown` 리스너 |
| 확장 로드 거부("Only one of browser_action…") | 웨일 `sidebar_action` 은 MV2 전용 — MV3 에 넣지 말 것 |
| 확장 담기 성공인데 "실패" 표시 | PostgREST INSERT 는 본문 없는 201 — `res.json()` 강제 금지 (api.js `rest()`) |
| Chrome 137+ `--load-extension` 제거 | 확장 E2E 는 `popup.html` 을 file:// 로 직접 열어 검증(api.js localStorage 폴백) |
| CDP 로 더블클릭 안 만들어짐 | down/up 후 `down({clickCount:2})/up({clickCount:2})` |

---

## 6. 남아 있는 것 / 미완성 (동작엔 문제 없음)

- 확장이 담는 순간엔 링크가 여전히 **OG 메타 없음**(호스트명+파비콘만) — `/api/unfurl` 은 쿠키 세션 기반이라 확장에서 못 씀. **웹에서 보드를 열면 `useLinkBackfill` 이 채운다**(이번 세션 구현). 확장 팝업 자체 목록엔 여전히 호스트명만 보일 수 있음
- 태그 입력 UI 제거됨(사용자 요청). 필터바 코드·DB 스키마는 남아 있음
- Next 16 `middleware.ts` deprecation 경고(동작 무관, 방치)
- 실기기(폰·웨일 브라우저) 검증은 사용자 수동 확인 의존 — 코드 레벨 E2E 는 완료
- **만들지 않은 것**: 페이지 스냅샷 아카이브 / PDF 하이라이트 / AI 자동 태깅 / 모바일 전용 앱

---

## 7. 환경변수 · API · 배포

- **환경변수 2개뿐**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 로컬 `.env.local` 에 실제 키(gitignore). **Vercel 에도 설정 완료**. anon key 는 공개 가능(방어는 RLS). `service_role` 절대 금지
- **Supabase** `nfwthowdcyciorqabiae`: 마이그레이션 0001·0002 실행 완료, **이메일 확인 꺼짐**(가입 즉시 로그인).
  스키마/publication 변경은 `supabase/migrations/` 에 추가 후 **SQL Editor 에서 직접 실행**(CLI 없음, anon 키로 DDL 불가)
- **배포**: https://pdflinkin.vercel.app (Vercel 프로젝트·GitHub 저장소명은 옛 이름 그대로)
- **Git**: `https://github.com/bugoms/pdflinkin` (main). 한글 커밋 메시지는 **파일로 쓰고 `git commit -F`**
- **E2E**: `node <스크립트>` (puppeteer-core + `C:/Program Files/Google/Chrome/Application/chrome.exe` headless).
  스크립트는 매 작업마다 스크래치패드에 임시로 작성(커밋 안 함). 패턴: 로그인 → `.react-flow__pane` 대기 → 상호작용 → REST(anon+access_token)로 DB 확인 → 테스트 데이터 청소.
  테스트 계정 `pdflinkin.e2e.test@gmail.com`(비밀번호는 Claude 메모리 `linkscape-e2e-setup`). 실사용자 보드와 분리
  - dev 서버가 port 3000 에 남아 있거나 전 페이지 404(Turbopack+OneDrive 글리치)면 서버 껐다 켜기
- **확장 설치**: `whale://extensions` → 개발자 모드 → 압축해제 → `whale-extension/`. 코드 수정 후 새로고침(⟳)

---

## 8. 다음 채팅에서 가장 먼저 할 일

0. 이번 세션 4개 개선(딥링크·OG 백필·스토리지 정리·웹 목록 보기)은 **커밋·푸시 완료**(4종 검증 E2E 14/14). Vercel 자동 배포 확인.
1. **사용자 피드백 대기 상태** — 최근 흐름은 "실사용하며 UI/UX 다듬기". 새 요청이 오면 9번 규칙 안에서 바로 구현.
2. 요청이 없을 때 개선 후보:
   - 확장 팝업 목록/검색도 웹처럼 카드 미리보기·정렬 옵션 확장
   - 목록 보기(웹·확장) 정렬 기준 선택(색/최근/이름) · 보드 접기
   - 태그/AI 자동 분류(만든 적 없음)
3. 검증은 반드시 헤드리스 E2E 로 실동작 확인. 커밋 전 4종(9번 마지막) 필수.
   - **E2E 함정**: 스토리지 파일 존재 확인은 **GET 객체 엔드포인트 금지**(CDN 엣지 캐시가 삭제 후에도 stale 200) → `POST /storage/v1/object/list/files` (list) 로 확인.

---

## 9. 반드시 지켜야 할 조건 · 주의사항

### 아키텍처 (변경 금지)
- **저장은 스냅샷 diff 하나로만**: 모든 변경은 `useBoard.apply()`(히스토리)/`applyLive()`(드래그 중).
  Supabase 직접 write 금지 (예외: `extracted_text`, 휴지통 영구삭제, 보드 CRUD, 확장 REST 경로)
- **realtime 수신은 `applyRemote` 로만** — 저장 큐/언두 절대 안 탐 (에코 루프 방지)
- **`extracted_text` 는 브라우저 상태에 절대 안 담음** (서버 로드·realtime·upsert 페이로드에서 전부 제거)
- **PDF 처리는 전부 클라이언트**. 서버 함수는 `/api/unfurl` 하나뿐
- **모든 테이블 RLS** + 비공개 버킷 + 서명 URL. 스토리지 경로 `{user_id}/{item_id}.{ext}`

### React Flow
- 노드는 스토어에서 유도(controlled). **`measured:{width,height}` 필수**
- **`zoomOnDoubleClick={false}` 유지**, `deleteKeyCode={null}`, 프레임 노드가 배열에서 자식보다 앞
- **프레임 자식에 `extent:"parent"` 금지** — 주면 그룹에서 못 뺌. `parentId` 만
- 선택 올가미(빈 곳 드래그=Partial)는 데스크톱 전용. 그룹 올가미는 `GroupLasso`(중심점 판정, 자유형=`pointInPolygon` 자동 폐합, 프레임+재소속 단일 `apply()`)

### 디자인 (globals.css `@theme` 이 단일 출처)
- Action Blue(#0066cc) 하나만 "누를 수 있음". 카드 색은 분류용 — **외곽선 2px 로만**(배경 채움 금지)
  - 선택지 = 토큰 5종(`PICKER_TOKENS`) + 커스텀 팔레트(`#rrggbb`, `isCustomColor`, 인라인 스타일). violet 토큰은 선택지에서 빠졌지만 기존 카드용으로 `CARD_COLORS` 에 남김
- 그림자 예외 둘: `.product-shadow`(PDF 지면·사진), `.glass-float`(떠 있는 크롬)
- 모양: rounded-full=액션 / apple-md(11px)=유틸 / apple-lg(18px)=카드·패널. 폰트 Pretendard 하나, 다크 모드 없음
- **확장 popup.css 는 웹 토큰 복제본** — 웹 토큰 바꾸면 같이 갱신

### 확장 (whale-extension)
- `sidebar_action` 절대 금지(MV2 전용). `api.js` 는 3환경 공용 — DOM API 금지(OffscreenCanvas), chrome.storage 없으면 localStorage 폴백
- `rest()` 빈 201 처리 유지. 이미지 다운로드는 CORS 때문에 반드시 background 에서
- 목록/검색은 **전 보드 조회 + board_id 포함**(RLS 가 한정). 새 카드 배치 = "가장 최근 카드 + 32px 계단식"

### 코드·커밋
- Tailwind 클래스 동적 조립 금지 / effect 안 동기 setState 금지(React 19 lint — 렌더 중 조정 패턴)
- **커밋 전 4종**: `npx tsc --noEmit` + `npx eslint src --max-warnings=0` + `npm run build` + **헤드리스 E2E 실동작 확인**
</content>
</invoke>
