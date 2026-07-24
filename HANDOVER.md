# 인수인계 메모 (LinkScape)

> 마지막 갱신: 2026-07-21 / 최신 작업: **Windows 데스크톱 앱 신규(Tauri v2 — 트레이 상주 + 전역 단축키 담기)** · 뷰어 Esc·뒤로가기 닫기 수정 · 확장 새 아이콘 · 그리기=캔버스 잉크 · 오버레이 Ctrl+휠 캔버스 줌 · 그룹 유동 크기+겹침 방지.
> 브랜치 `main`. **위 작업 전부 커밋·푸시 완료**(각각 4종 검증 통과). 미추적 `plan1.md`·`chrome-store-listing.skill` 은 커밋 대상 아님(스크래치). 이 문서는 구 `HANDOFF.md` 를 이름만 바꾼 것.
> **플랫폼 4개**: 웹(Vercel) · 웨일/크롬 확장 · 안드로이드(Capacitor, 에뮬 확인) · **Windows 데스크톱(Tauri, 실행·트레이·단축키 검증 완료)**.
> 상태: **Vercel 배포 동작 중**, Supabase 마이그레이션 0001·0002 실행 완료, 헤드리스 E2E 검증 체계 구축, **Capacitor 안드로이드 에뮬레이터 실행·설치·로그인 확인**.
> **⚠️ 에뮬레이터에서 눈으로 확인할 것 2개는 §6 맨 위 "확인 대기" 참고**(상태표시줄 겹침 수정이 안드로이드 env() 로 먹는지 등).
> **앱화(모바일) 계획·진행 상태는 `app-plan.md` 참고.** E2E 노하우는 Claude 메모리(`linkscape-e2e-setup`)에도 있다.

---

## 1. 목적과 핵심 기능

카카오톡 "나에게 보내기"에 링크·PDF가 쌓이기만 하는 문제를 푼다.
**무한 캔버스 위 공간 배치 자체가 분류**가 되게 한다. 서비스명 **LinkScape** (구 pdflinkin).

**웹 (데스크톱 + 반응형 모바일)**
- `Ctrl+V` → 커서 자리에 링크 카드 (OG 메타 자동 수집) / PDF·이미지 드롭 → 카드
- 빈 곳 더블클릭 → 메모 / 카드 더블클릭 → 열기·편집
- **좌클릭 드래그(빈 곳) = 선택 올가미**(Partial). 팬 = 스페이스/휠클릭/터치
- **그룹**: 여러 방법 — ① 툴바 "그룹 ▾" → 사각형/자유형 올가미로 영역 감싸기, ② "그룹 ▾" → **"선택한 카드 묶기"**(현재 선택을 묶음), ③ 카드를 프레임 안으로 드래그(밖으로 끌면 빠짐). **선택에 기존 프레임이 있으면 그 그룹에 추가**. **프레임은 자식에 맞춰 유동적으로 커지고 줄어들며**(들어오면 확장, 빠지면 축소 — 포함 여부가 눈에 보임), 들어온 카드는 형제와 **겹치지 않게 계단식(+24px)으로 비켜** 놓인다. **모바일**: 하단 "그룹" → **묶기 모드**(카드를 탭해 고르고 "완료")
- **그리기(캔버스 잉크)**: 툴바 "그리기"(모바일 "펜") → 펜으로 긋고(색 6종: 잉크+분류색 5) "완료" → **카드가 아니라 캔버스에 획이 그대로 남는다**(투명 SVG 잉크, `StrokeNode`). 선택하면 점선 외곽선, 이동·삭제·언두·실시간은 일반 아이템과 동일. 오버레이 중에도 **Ctrl+휠 = 캔버스 줌**(커서 고정), 휠 = 팬
- **여러 보드**: 로고 옆 `BoardSwitcher` 로 보드 생성·전환·이름변경·삭제
- **실시간**: 확장·다른 탭에서 담으면 새로고침 없이 즉시 캔버스에 나타남
- **우클릭 메뉴** (카드: 열기·복제·삭제 / 빈 곳: 메모·그룹 추가(빈 프레임)·붙여넣기·화면 맞추기)
- `Ctrl+K` 검색(PDF 본문 포함), `Ctrl+Z/D`, `Delete`→휴지통, `F` 화면 맞추기, 연결선
- 업로드 원본 다운로드(인스펙터·뷰어·PDF 카드 우상단 칩), 카드 색 = 외곽선(6종 토큰 + 커스텀 팔레트)
- 모바일: 하단 플로팅 액션 바, 인스펙터는 하단 시트, 한 손가락 드래그 = 팬 (올가미 없음)

**웨일 확장 (`whale-extension/`, 순수 MV3 — 빌드 없음, 크롬 겸용)**
- 팝업: 현재 탭 담기 · Ctrl+V(링크/이미지/텍스트→메모) · PDF·이미지 드롭
- **목록 보기**: **보드별 헤더**(모든 보드 조회) → 그룹별 묶음(ㄴ자 종속) + 색 순서 + 키워드 검색(PDF 본문) + 행 hover **이름수정(연필, 인라인 입력)·삭제(휴지통)**. 행 클릭 = 그 문서/링크 자체를 새 탭으로 엶 (행 단위 "보드에서 보기"는 사용자 요청으로 제거 — 상단 "보드 열기 ↗"는 유지)
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
| 모바일 앱 | Capacitor 8 (안드로이드). iOS 는 Mac 필요 |
| **데스크톱 앱** | **Tauri v2 (Rust) + WebView2** — `src-tauri/`. Electron 안 씀(용량) |

개발 환경: Windows 11, PowerShell, Node 22, **Rust 1.97.1**(rustup). `gh` CLI 없음(자격증명 캐시로 push).

---

## 3. 폴더 구조와 파일 역할

```
src/
  middleware.ts               세션 갱신 + 인증 가드. env 없으면 503
  app/
    globals.css               ★ 디자인 토큰 + .glass-float + RF 오버라이드 + 안전영역 유틸(.inset-safe-*/.pad-safe-*/.pick-bar) (단일 출처)
    layout.tsx                Pretendard, suppressHydrationWarning, PWA 메타 + SW 등록
    manifest.ts               ★ PWA 매니페스트(standalone + share_target GET /share)
    login/page.tsx            이메일 로그인/가입 (오류 한국어 번역)
    share/page.tsx            ★ 공유 착지 — 링크를 카드로 + 딥링크. PWA share_target·데스크톱 단축키 담기 공용
    board/page.tsx            ★ 서버 컴포넌트. searchParams(await)에서 board id → 보드/카드 로드
    icon.svg, apple-icon.png, favicon.ico   웹 파비콘(미니 캔버스 심벌)
    api/unfurl/route.ts       OG 수집 (SSRF 방어, 로그인 필요, 서버 함수는 이거 하나)
  components/pwa/
    ServiceWorkerRegister.tsx /sw.js 등록 (설치형·오프라인 셸)
  components/board/
    BoardClient.tsx           조립 + 태그필터바 + 빈 캔버스 안내 + useRealtime/usePdfBackfill 호출
    Canvas.tsx                ★ RF 캔버스. 올가미/팬/우클릭 메뉴/단축키/드롭/settleDrag(겹침 해소+프레임 fit). GroupLasso·DrawLayer 렌더
    DrawLayer.tsx             ★ 그리기 오버레이 — 획을 flow 좌표로 수집(색 6종) → SVG 데이터 URL → addDrawing(캔버스 잉크)
    useWheelPanZoom.ts        ★ 오버레이(올가미·그리기) 위 휠 팬/줌 — non-passive 리스너로 Ctrl+휠 페이지 줌 차단, RF 뷰포트 직접 조작
    BoardSwitcher.tsx         ★ 보드 목록·전환·이름변경(인라인)·삭제(confirm)·생성 드롭다운
    GroupLasso.tsx            ★ 올가미 오버레이(사각형/자유형) + 감쌈 판정 + 프레임 생성
    useRealtime.ts            ★ realtime 구독 → applyRemote 로만 반영
    Toolbar.tsx               플로팅 바(BoardSwitcher·그룹▾·메모·삭제·undo) + 햄버거 + 모바일 하단바
    Inspector.tsx             단일 선택 패널. 라벨 "제목", 색(토큰5+커스텀 피커), 다운로드 버튼
    Viewer.tsx                PDF·이미지·파일 뷰어(오피스=Office Online, 한글=hwp.js 벤더 렌더, 이어읽기, 다운로드)
    useBoardActions.ts        삭제/복제/엣지삭제/열기/★groupSelected(선택→그룹, 기존 프레임 있으면 추가+키움) 공용
    useIngest.ts              ★ 링크/파일 → 카드 생성. addFiles 는 모든 형식 허용(PDF/이미지 외=file). addDrawing=펜 잉크(데이터 URL, 업로드 없음)
    usePdfBackfill.ts         썸네일 없는 PDF 자동 보정 (확장 업로드분)
    useLinkBackfill.ts        ★ 확장 링크 카드에 OG 메타 백필 (변경 시에만 apply)
    useTrashAutoPurge.ts      ★ 15일 지난 휴지통 카드를 스토리지 파일까지 자동 영구삭제(보드 열 때, 전 보드)
    ListPanel.tsx             ★ 웹 목록 보기 — 전 보드 조회·그룹·색정렬·검색·삭제·클릭 딥링크
    ContextMenu.tsx, SearchPalette.tsx, TrashPanel.tsx
    nodes/                    CardShell(색=외곽선), Link/Pdf/Image/Note/File/Stroke/FrameNode, types.ts(isStrokeItem)
                             (FileNode = 일반 파일 카드: 아이콘+확장자 배지, 열기=뷰어/다운로드)
  store/
    board.ts                  ★★ 스냅샷 diff 저장 큐 + 언두/리두 + applyRemote/hasPending. 심장
    groupMode.ts              캔버스 오버레이 모드(null|'rect'|'free'|'pick'|'draw'). 'pick'=모바일 묶기, 'draw'=그리기
    selection.ts, viewer.ts   선택/뷰어 상태
  lib/                        supabase/, pdf.ts, storage.ts, geometry.ts(+fitFrameToChildren·resolveOverlapInFrame·GROUP_PAD), palette.ts, url.ts
supabase/migrations/
  0001_init.sql               스키마+RLS+버킷 (실행 완료)
  0002_realtime.sql           items/frames/edges publication + REPLICA IDENTITY FULL (실행 완료)
whale-extension/              ★ 웨일/크롬 확장 (전체가 순수 JS)
  manifest.json  config.js    MV3 / Supabase URL·anon key·WEB_URL
  api.js                      인증·PostgREST·Storage·검색·목록·삭제 — 팝업/워커/콘텐츠 3환경 공용
  background.js  dropzone.js  우클릭 메뉴·이미지 다운로드 / 페이지 드롭존
  popup.html/css/js           팝업 UI(웹 토큰 복제) + 목록 보기 + 드롭존 안 "또는 파일 선택" 링크(별도 버튼 아님)
  icons/                      확장 아이콘(미니 캔버스, 원본 icon.svg)
public/sw.js                  ★ 서비스워커(오프라인 셸, 네트워크 우선)
public/vendor/hwp.js          ★ 한글 뷰어(hwp.js) 벤더본 — Turbopack 번들 회피, turbopackIgnore 로 로드 [생성물·gitignore]
scripts/copy-hwp-viewer.mjs   hwp.js esm 을 public/vendor 로 복사(node 'fs' import 만 빈 객체로 치환). postinstall/prebuild/predev
app-plan.md                   ★ 앱화 계획·진행 상태 (PWA·Capacitor·Windows 데스크톱)
capacitor.config.ts           ★ Capacitor 설정(server.url→Vercel 하이브리드 PoC)
capacitor-shell/index.html    Capacitor webDir 폴백 셸
android/                      ★ Capacitor 안드로이드 네이티브 프로젝트 (gradle 빌드 검증됨)
src-tauri/                    ★ Windows 데스크톱 앱 (Tauri v2 / Rust). target·gen 은 gitignore
  src/lib.rs                  ★★ 트레이·전역 단축키·창닫기=숨김·클립보드 담기 — 네이티브 로직 전부 여기
  src/main.rs                 진입점 (릴리스에서 콘솔 창 숨김)
  tauri.conf.json             ★ 창 url→Vercel, NSIS 번들·아이콘 설정
  capabilities/default.json   ★ 프론트 권한 최소 — remote 미설정 = 원격 페이지가 Tauri IPC 호출 불가
  shell/index.html            원격 로드 실패 시 폴백 화면
  icons/                      앱·트레이 아이콘 (whale-extension/icons/icons.png 에서 생성)
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
- **웹 목록 보기** (`ListPanel`, 햄버거 메뉴 "목록 보기") — 확장의 목록 보기를 웹에 이식. 전 보드 조회 → 보드별/그룹별·색 순서 나열 + 검색(PDF 본문) + 행 클릭=문서 열기 + hover 보조 아이콘(↦ 보드에서 보기 / 삭제). 딥링크: 같은 보드=`setCenter`, 다른 보드=`flush` 후 `router.push`. 다른 보드 카드 삭제만 REST 직접 소프트삭제(스토어 없음), 현재 보드 카드는 `apply` 정식 경로.

#### 그 뒤 (커밋·푸시 완료 — 각각 4종 검증 통과)

- **파일 업로드 (폴더에서 직접 선택)** — 웹 툴바 "파일" 버튼(넓은 화면·모바일) + 확장 팝업은 **드롭존 안 "또는 파일 선택" 링크**(별도 버튼 제거 — 예전엔 아웃라인 버튼이었음). `useIngest.addFiles`·확장 `api.addFileItem` 이 **모든 형식 허용**: PDF/이미지는 썸네일·본문검색, 그 밖(워드·한글·엑셀·압축 등)은 **`kind=file` 일반 파일 카드**(`FileNode`, 미리보기·본문검색 없음). 드롭·Ctrl+V 도 모든 형식.
- **파일 열기 = 인앱 뷰어 / 다운로드 분리** — 카드 "열기"=인앱 뷰어, 우상단 아이콘=다운로드. `Viewer` 의 `FileBody` 가 확장자로 분기:
  - **한글(.hwp/.hwpx)** → `HwpBody` 가 **hwp.js 로 브라우저에서 직접 렌더**(내장 뷰어 의존 X → 크롬·엣지·웨일 공통). 구형 .hwp(HWP 5.0)만 지원, 못 읽는 형식(.hwpx 등)은 "다운로드" 폴백. **hwp.js 는 Turbopack 이 번들하면 옵션 전달이 깨져** `public/vendor/hwp.js` 로 벤더링해 `import(/* turbopackIgnore */ "/vendor/hwp.js")` 로 로드(§5 참고).
  - **오피스 문서**(doc/docx/xls/xlsx/ppt/pptx) → **Office Online 임베드 뷰어**(`view.officeapps.live.com/op/embed.aspx?src=<서명URL>`)로 렌더. ⚠️ 서명 URL 을 MS 서버가 가져가 렌더 = **프라이버시 트레이드오프**.
  - **그 밖(txt·csv 등)** → 원본 iframe 시도(브라우저 뷰어 의존) + "다운로드" 안내.
  - **다운로드**는 blob+`a[download]` 로 **원래 파일명**(한글도 안 깨짐, `downloadStoredFile`).
- **확장 팝업 드롭존 통합** — 별도 "폴더에서 파일 선택" 버튼 제거 → **드롭존 안 "또는 파일 선택" 링크**(`#pick-file` id 유지해 JS 배선 그대로). popup.html/css.
- **15일 자동 휴지통 정리** (`useTrashAutoPurge`, `BoardClient` 에서 호출) — 보드 열 때 `updated_at` 이 `TRASH_RETENTION_DAYS`(15일) 지난 trashed 카드를 **스토리지 파일까지** 자동 영구삭제(전 보드, RLS 로 한정, 직접 REST — 스토어 안 탐). 서버 크론 없이 앱 여는 시점 정리. `TrashPanel` 에 안내 문구. **계정은 `auth.users`(auth 스키마) — public 테이블과 분리, on delete cascade 로 계정 삭제 시 콘텐츠 전부 삭제.**
- **PWA (설치형 + 안드로이드 공유로 담기)** — `manifest.ts`(standalone + `share_target` GET `/share`) + `public/sw.js`(오프라인 셸, 네트워크 우선) + `ServiceWorkerRegister`. `/share` 는 공유된 링크를 가장 오래된 보드에 카드로 만들고 `?item=` 딥링크. `middleware.ts` matcher 에 `js`·`webmanifest` 제외 추가(**PWA 자산이 인증 가드에 걸려 로그인 HTML 로 리다이렉트되던 버그** 수정). 안드로이드는 이걸로 공유 시트에 LinkScape 가 뜨고 담긴다(네이티브 코드 없이).
- **Capacitor 안드로이드 앱** — `capacitor.config.ts`(appId `app.linkscape`, `server.url`→Vercel 하이브리드 PoC), `android/` 네이티브 프로젝트. `gradlew assembleDebug` 성공(APK). `npm run cap:android` 로 Studio 열어 에뮬레이터 Run. **iOS 는 macOS/Xcode 필요(Windows 불가)**. 자세한 계획·다음 단계는 `app-plan.md`.

#### 이번 세션 (UI 다듬기 — 커밋·푸시 완료)

- **팝업·드롭다운 메뉴 불투명 처리** — 그룹 ▾·햄버거·보드 스위처 드롭다운·우클릭 메뉴가 반투명(`.glass-float` 72% + blur)이라 뒤 캔버스가 비쳐 글자가 겹쳐 보이던 문제. globals.css 에 **불투명 변형 `.glass-solid`**(배경 리터럴 `#ffffff`, 테두리·그림자 유지) 추가하고 그 4개 메뉴에 적용(`Toolbar.tsx`·`BoardSwitcher.tsx`·`ContextMenu.tsx`). 떠 있는 툴바 알약·라벨·인스펙터/뷰어 패널은 유리 느낌 유지(그대로). **처음에 `var(--color-canvas)` 를 썼다가 배경이 아예 안 칠해지는 함정 — §5 참고.**

#### 이번 세션 2 (그룹 UX·그리기·확장 목록 — E2E 21/21 통과)

- **그룹 유동 크기 + 겹침 방지** — `settleDrag`(Canvas)가 소속 변경 시: 들어온 카드는 형제와 겹치면 **+24px 계단식으로 비켜**(`resolveOverlapInFrame`, 최소 간격 12px), 소속이 바뀐 프레임(들어간 곳·나온 곳 모두)은 **자식 전부+여백 32px 에 딱 맞게 키우거나 줄인다**(`fitFrameToChildren` — geometry.ts 공용, `groupSelected` 도 같은 규칙). 빈 프레임은 안 건드림(의도적 빈 그룹 보호). 최소 크기 240×180 유지.
- **프레임 배경 불투명** — `FRAME_COLORS` 의 2~4% 알파 배경(`#0066cc08` 등)이 캔버스 점무늬가 비쳐 흐릿하던 것을 **흰색에 12% 섞은 불투명 파스텔 고정 hex**(sky `#ebf4fe` 등)로. 커스텀 색 프레임은 `color-mix(in srgb, <색> 12%, #ffffff)` (FrameNode 인라인).
- **그리기(펜 노트)** — `DrawLayer.tsx` 오버레이(GroupLasso 와 같은 구조 — 화면 좌표로 획을 받고 완료 시 flow 좌표 변환). 색 6종(잉크+분류색 5)·마지막 획 취소·Esc 취소. 완료 시 **SVG 원본 + JPEG 썸네일(긴 변 640)** 을 스토리지에 올리고 `useIngest.addDrawing` 이 **kind='image'** 카드로 생성(그린 자리·그린 크기 그대로) — **item_kind enum 은 안 건드림(스키마 변경 없음)**. groupMode 에 'draw' 모드 추가(상호배제 공짜). 모바일 하단 바 "펜" + Utility compact 변형(버튼 7개 폭 맞춤).
- **확장 목록 행 아이콘 정리** — 행 hover 의 "↦ 보드에서 보기" 버튼 제거(상단 "보드 열기 ↗"는 유지 — 사용자 명시 요청), 그 자리에 **이름수정(연필)** 추가: 클릭 → 행 위 인라인 입력(`.row-edit`) → Enter/blur 커밋(낙관적 반영, 실패 시 원복), `api.renameItem`(PATCH title). 아이콘 둘은 **`.row-actions` flex 컨테이너**(absolute, top:0/bottom:0, align-items:center) 하나로 우측 세로 중앙 고정 — 개별 absolute 배치는 불안정해 폐기.

#### 이번 세션 3 (그리기=캔버스 잉크·오버레이 휠 줌 — E2E 23/23 통과)

- **그리기 = 캔버스 잉크** (사용자 요청: "펜메모 카드가 아니라 그냥 캔버스에 그리기") — 완료 시 카드 대신 **투명 SVG 잉크가 캔버스에 그대로 남는다**. 구현: SVG 를 **데이터 URL 로 `og_image_url` 에 저장**(스토리지·서명 URL·썸네일 전부 불필요, og_image_url 은 검색 인덱스 컬럼도 아님), kind='image' 재사용(스키마 변경 없음), `isStrokeItem()`(kind=image + storage_path 없음 + og_image_url 이 data:image/svg)으로 판별해 RF 노드 타입 'stroke'(`StrokeNode` — 카드 크롬 없이 `<img>` 만, 선택 시 점선 외곽선) 로 렌더. 우클릭 메뉴에서 "열기" 제외(잉크는 열 원본 없음). 이동·삭제·언두·실시간·휴지통 전부 일반 아이템 경로 그대로.
- **오버레이(올가미·그리기) 위 휠 팬/줌** — 오버레이는 RF 밖 형제 요소라 휠이 캔버스에 안 닿고 **Ctrl+휠이 브라우저 페이지 줌으로 새던 버그** 수정. `useWheelPanZoom`: non-passive 네이티브 wheel 리스너로 preventDefault + RF `setViewport` 직접 조작(Ctrl/⌘+휠 = 커서 고정 줌 1.12배율·한계 0.1~2.5 = RF 와 동일, 휠 = 팬, Shift+휠 = 가로 팬). React onWheel 은 passive 라 못 쓴다.
- **올가미·그리기 좌표를 flow 로 즉시 변환** — 기존엔 화면(client) 좌표로 모았다가 완료 시 일괄 변환했는데, 이제 중간에 팬/줌이 가능하므로 **캡처 즉시 `screenToFlowPosition`** 으로 바꿔 저장하고 미리보기는 `flowToScreenPosition` + `useViewport()` 구독으로 되그린다 — 팬/줌해도 궤적이 캔버스에 붙어 있다.
- **그룹 제목 폰트 14→16px** (FrameNode 라벨·편집 입력 동일).
- **확장 목록 아이콘 재안정화** — 연필·휴지통을 `.row-actions` flex 컨테이너로 묶어 우측 세로 중앙 고정(위 세션 2 항목에 반영).

#### 이번 세션 4 (뷰어 닫기·확장 아이콘 — E2E 16/16 통과)

- **뷰어가 Esc·뒤로가기로 안 닫히던 문제** (§5 표 마지막 두 줄에 원인 정리) — `Viewer` 에 ① 열 때 대화상자 포커스(`role="dialog"`, `tabIndex=-1`) ② iframe 이 포커스를 가져갔을 때 **포인터가 iframe 밖으로 나오면 회수**(`onPointerMove` → `reclaimFocus`) ③ `history.pushState`/`popstate` 로 **뒤로가기 = 뷰어 닫기**(보드 이탈 안 함), 닫기 버튼·Esc 는 `requestClose` 로 히스토리 항목까지 정리. **교차 출처 iframe 안에 포커스가 있는 동안은 브라우저 보안상 Esc 를 받을 수 없다** — 그 경우의 확실한 탈출구가 뒤로가기와 닫기 버튼.
- **뷰어 열린 동안 캔버스 단축키 차단** — `Canvas` 의 window keydown 이 뷰어 위에서도 살아 있어 **Delete 가 뒤에 선택된 카드를 조용히 휴지통으로** 보냈다(Ctrl+Z·Ctrl+D·F 도 동일). `useViewer.getState().itemId` 가 있으면 전부 무시.
- **확장 아이콘 교체** — 사용자 제공 `whale-extension/icons/icons.png`(누끼 완료 2400×1357)에서 아트워크 bbox 를 정사각 크롭해 `icon16/48/128.png` 재생성(알파 보존). manifest 경로는 그대로.
- **확장 목록 그룹 안 행 아이콘 찌그러짐** — 광역 선택자 `#item-list button`(+`li.child button{padding-left:18px}`)이 특이도로 아이콘 버튼까지 침범. 행 본문에 **`.row-main`** 클래스를 줘 분리. 전 행 편차 0px 실측.
- **긴 제목이 아이콘과 겹침** — 행 본문에 `padding-right:66px`(아이콘 영역 폭)을 **상시** 확보해 제목이 그 앞에서 말줄임. hover 때만 주면 글자가 튄다.

#### 이번 세션 5 (Windows 데스크톱 앱 — 신규, 실행 검증 완료)

사용자 요청: "exe 로 설치되고, 백그라운드(트레이)에 상주하고, 용량은 가볍게". → **Tauri v2** 선택(Electron 은 150MB+ 라 탈락). Windows 11 에 내장된 WebView2 를 빌려 쓰므로 **실행파일 3.43MB / NSIS 설치파일 1.26MB**.

- **전략은 Capacitor 안드로이드와 동일한 원격 URL 하이브리드** — `tauri.conf.json` 의 `app.windows[0].url` 이 Vercel 을 가리킨다. 웹 코드를 하나도 안 고치고 데스크톱이 생겼다. `app-plan.md` P1(정적 번들)이 끝나면 이 값만 로컬 번들로 바꾸면 오프라인까지 확장된다.
- **트레이 상주** — 창의 X 는 종료가 아니라 숨기기(`WindowEvent::CloseRequested` → `api.prevent_close()` + `window.hide()`). 트레이 좌클릭=창 열기, 우클릭=메뉴(보드 열기 / 클립보드에서 담기 / 종료).
- **전역 단축키 `Ctrl+Shift+V`** — 어느 앱에 있든 클립보드의 링크를 보드에 담는다. 확장이 브라우저 안에서 하던 일의 OS 판.
- **담기는 웹의 `/share` 를 그대로 재사용** — 숨은 창(`capture` 라벨)을 `/share?text=<클립보드>` 로 띄운다. 담기 규칙(보드 확보·계단식 좌표·OG 백필)이 웹/확장/모바일/데스크톱 한 곳에 유지된다. **결과는 추정하지 않고** 그 창이 이동한 주소를 400ms 간격으로 폴링해 판정(`/board?…item=`=성공, `/login`=로그인 필요, 16초 초과=실패) → 그에 맞는 네이티브 알림.
- **보안 경계** — `capabilities/default.json` 에 `remote` 를 **두지 않았다**. 그래서 원격(Vercel) 페이지는 Tauri IPC 를 전혀 호출할 수 없다. 클립보드·알림·트레이는 전부 Rust 쪽에서만 쓴다.
- **아이콘** — `whale-extension/icons/icons.png`(누끼 원본, 비정사각 2400×1357)는 `tauri icon` 이 거부한다. 아트워크 bbox 를 1024×1024 정사각으로 크롭해(`src-tauri/icon-source.png`, gitignore) 아이콘 세트를 생성했다.
- **검증(실측)**: 실행파일 3.43MB · 실행 시 메모리 27MB · 로그인 화면 정상 렌더(스크린샷 확인) · `RegisterHotKey` 로 Ctrl+Shift+V 재등록 시도 실패(=앱이 점유 중) · `WM_CLOSE` 후 프로세스 생존 + `IsWindowVisible=False`(트레이 숨김) · NSIS 설치파일 생성.
  - ⚠️ **클립보드 담기 실동작(단축키 눌러 카드가 실제로 생기는지)은 미검증** — 전역 단축키는 실제 키 입력이 필요해 헤드리스로 못 돌린다. §6 확인 대기.

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
| **워드를 인앱 뷰어로 못 띄움** | 브라우저가 원격 오피스 문서를 iframe 에서 렌더 안 하고 다운로드(웨일도). → 오피스는 **Office Online 임베드**(`view.officeapps.live.com`) |
| **한글(.hwp)이 크롬·엣지에선 안 열림** | 원본 iframe 은 **웨일 내장 한컴 뷰어에만 의존** → 크롬·엣지는 빈 화면/다운로드. → **hwp.js 로 브라우저에서 직접 렌더**(`HwpBody`). 브라우저 무관하게 열림 |
| hwp.js 가 `s.split is not a function` | cfb 기본 입력 타입이 base64(문자열) → Uint8Array 를 문자열로 오인. **`new Viewer(el, data, { type: "array" })`** 로 타입 명시 필수 |
| **hwp.js 를 Turbopack 이 번들하면 파싱 실패** | 프로덕션 최적화가 Viewer→parse→cfb.read 의 옵션 전달을 깨뜨려 `{type:'array'}` 가 안 닿음(빌드는 성공, 런타임만 실패 — 하네스로만 잡힘). → **원본 esm 을 `public/vendor/hwp.js` 로 벤더링**(node 'fs' import 만 빈 객체 치환)하고 `import(/* turbopackIgnore: true */ "/vendor/hwp.js")` 로 브라우저가 네이티브 로드. TS 는 벤더 경로 타입 없어 `@ts-expect-error`+캐스트 |
| hwp.js 가 브라우저에서 `Can't resolve 'fs'` | 내부 cfb 가 node 전용 `import from 'fs'`(런타임 미사용). 벤더 복사 스크립트가 그 한 줄만 `const _=... = {}` 로 치환(브라우저 네이티브 import 가능) |
| 파일 열기 시 서명 URL 이 **UUID 이름**으로 다운로드 | 원격 서명 URL(`/…/<uuid>.hwp`)을 새 탭으로 열면 이름이 UUID. → **blob+`a[download]`** 로 원래 파일명 다운로드(한글 이름 보존 — 위 다운로드 이슈와 같은 해법) |
| Capacitor Android 빌드 **경로 거부** | 프로젝트 경로에 한글(비-ASCII: `…/바탕 화면/pdf링크서비스`) → AGP 거부. `android/gradle.properties` 에 `android.overridePathCheck=true`. 장기적으론 ASCII 경로 권장 |
| PWA 매니페스트/SW 가 **로그인으로 리다이렉트** | `middleware.ts` matcher 가 `.webmanifest`·`.js` 미제외 → 인증 가드가 HTML 리다이렉트. matcher 제외 목록에 추가 |
| **네이티브 앱/PWA 에서 상단 바가 상태표시줄과 겹침** | 전체화면 웹뷰는 상태표시줄 밑까지 그림. `top-2`(8px)만으론 겹침. → `env(safe-area-inset-*)` 로 상단 바·하단 액션 바·뷰어를 안전영역만큼 밀기(globals.css `.inset-safe-top/bottom`·`.pad-safe-top`). 브라우저에선 env=0 이라 기존과 동일. **⚠️ 안드로이드 Capacitor 웹뷰에서 env() 가 채워지는지 미검증(§6 확인 대기)** |
| **불투명 메뉴 배경에 `var(--color-canvas)` 를 썼더니 완전 투명** | Tailwind v4 는 유틸·다른 규칙에서 참조 안 하는 `@theme` 변수를 `:root` 로 안 내보낼 수 있음 → 커스텀 CSS 의 `var(--color-canvas)` 미해결 → `background` 무효 → 배경 안 칠해지고 blur 도 빠져 오히려 더 비침. **커스텀 CSS 에선 리터럴(`#ffffff`)** 을 쓸 것(`.glass-solid`) |
| **오버레이(올가미·그리기)에서 Ctrl+휠이 브라우저 페이지 줌** | 오버레이는 RF 밖 형제 요소 — 휠이 캔버스에 안 닿고 기본 동작(페이지 줌)으로 샘. React `onWheel` 은 **passive 로 붙어 preventDefault 무효** → 네이티브 `addEventListener("wheel", fn, {passive:false})` 로 가로채 RF `setViewport` 직접 조작(`useWheelPanZoom`). 오버레이 좌표는 캡처 즉시 flow 로 변환해 둬야 중간 팬/줌에도 궤적이 안 틀어짐 |
| **뷰어에서 Esc 가 "가끔" 안 먹음** | 문서 미리보기는 **교차 출처 iframe**(오피스=Office Online, txt 등=서명 URL). 그 안을 클릭하면 포커스가 iframe 으로 넘어가고 **keydown 이 부모 창에 아예 안 닿는다**(브라우저 보안 경계 — 부모에서 키를 가로챌 방법 없음). PDF·이미지·한글은 iframe 이 아니라 원래 잘 닫혔다. → ① 열 때 대화상자(`tabIndex=-1`)에 포커스 ② **포인터가 iframe 밖(헤더·여백)으로 나오면 포커스 회수**(iframe 위에선 핸들러가 안 불려 문서 조작을 방해 안 함) ③ 히스토리 항목으로 뒤로가기 닫기. E2E 로 `iframe 포커스 상태 Esc → 닫힘=false` 재현 확인 |
| **모바일 뒤로가기가 뷰어가 아니라 보드를 벗어남** | 뷰어는 히스토리 항목이 아니었음 → back 이 이전 페이지로 감. 열 때 `history.pushState({lsViewer})`, `popstate` 에서 close. 닫기 버튼·Esc 는 `close()` 후 우리가 쌓은 항목이 현재 상태일 때만 `history.back()` 으로 정리(잔여 항목·중복 back 없음). dev StrictMode 이중 실행 대비 pushState 는 멱등 |
| **`tauri icon` 이 "Source image must be square" 거부** | 원본 `icons.png` 가 2400×1357(누끼 여백 포함). → 알파 bbox 를 찾아 정사각 크롭한 1024×1024 를 먼저 만들고 그걸 입력으로 준다 |
| **Tauri NSIS 번들 `액세스가 거부되었습니다 (os error 5)`** | `%LOCALAPPDATA%\tauri\nsis-3.11` 압축 해제가 중간에 끊겨 `makensis.exe` 가 2560바이트로 잘려 있었다(정상은 Bin\ 아래 468KB). **일시적 현상** — 그 폴더를 지우고 `tauri build` 재실행하니 정상 통과. 재발하면 Defender 가 NSIS 를 오탐하는지 확인(NSIS 는 설치 제작 도구라 흔히 오탐) |
| 데스크톱 앱 릴리스 빌드가 **7~15분** | `Cargo.toml` 릴리스 프로파일에 `lto=true`·`codegen-units=1`·`opt-level="s"` 를 줘 용량을 줄인 대가. 개발 중엔 `npm run desktop:dev`(디버그 프로파일) 를 쓸 것 |

---

## 6. 남아 있는 것 / 미완성 (동작엔 문제 없음)

- **⚠️ 확인 대기 (사용자가 직접 눈으로)**:
  - ① **데스크톱 클립보드 담기 실동작** — 앱을 켜고 링크를 복사한 뒤 `Ctrl+Shift+V` → "링크를 보드에 담았어요" 알림이 뜨고 보드에 카드가 생기는지. **전역 단축키는 실제 키 입력이 필요해 헤드리스로 검증 불가**(단축키 점유 자체는 검증됨). 안 되면 볼 곳: 로그인 세션 유무, `/share` 응답, `src-tauri/src/lib.rs` 의 폴링 판정 조건.
  - ② **상단 바 상태표시줄 겹침 수정**(`env(safe-area-inset-*)`)이 **안드로이드 Capacitor 웹뷰에서 실제로 먹는지** — 에뮬 재실행 → 앱 리로드로 확인. env() 가 0 이면 안 밀림 → `@capacitor/status-bar` 플러그인으로 `overlaysWebView:false`(네이티브 재빌드 필요). iOS/PWA 에선 표준대로 동작.
  - ③ **모바일 묶기 모드·그룹 추가** 실제 폰 조작감(코드 E2E 는 통과).
  - 안드로이드 방법: adb 로 `install -r android/app/build/outputs/apk/debug/app-debug.apk` → `am start -n app.linkscape/.MainActivity` → `exec-out screencap -p` 로 캡처. (앱은 `server.url`→Vercel 이라 푸시 후 배포되면 반영)
- **데스크톱 앱에 아직 없는 것**(요청 범위 밖이라 안 만듦): Windows 시작 시 자동 실행, 파일 드래그해서 담기, 자동 업데이트, 코드 서명(설치 시 SmartScreen 경고가 뜬다). 자동 시작은 `tauri-plugin-autostart` 로 몇 줄이면 붙는다.
- 데스크톱은 **원격 URL 하이브리드**라 인터넷이 없으면 폴백 화면만 뜬다(오프라인 사용 불가). `app-plan.md` P1 정적 번들이 그 전제.
- 확장이 담는 순간엔 링크가 여전히 **OG 메타 없음**(호스트명+파비콘만) — `/api/unfurl` 은 쿠키 세션 기반이라 확장에서 못 씀. **웹에서 보드를 열면 `useLinkBackfill` 이 채운다**(이번 세션 구현). 확장 팝업 자체 목록엔 여전히 호스트명만 보일 수 있음
- 태그 입력 UI 제거됨(사용자 요청). 필터바 코드·DB 스키마는 남아 있음
- Next 16 `middleware.ts` deprecation 경고(동작 무관, 방치)
- 실기기(폰·웨일 브라우저) 검증은 사용자 수동 확인 의존 — 코드 레벨 E2E 는 완료
- **파일 뷰어**: 오피스 문서는 **Office Online**(파일이 MS 서버로 전달 — 프라이버시 트레이드오프, 사용자가 수용). **한글은 hwp.js 로 인앱 렌더**(크롬·엣지·웨일 공통) — 단 **구형 .hwp(HWP 5.0 바이너리)만 지원**, 신형 **.hwpx(zip/xml)는 미지원 → 다운로드 폴백**. hwpx 도 필요하면 별도 파서(예: hwpx 언집+XML 파싱)나 자체 변환 검토
- **앱화(PWA/Capacitor)**: `app-plan.md` 참고. 남은 것 = P1 정적 번들(board 서버→클라, unfurl→Edge Function, `output:export`) → 네이티브 공유(Android ACTION_SEND / iOS Share Extension) → iOS 빌드(**Mac 필요**) → 스토어 제출(개발자 계정 없음). 현재 Capacitor 는 `server.url`→Vercel 하이브리드 PoC. **에뮬레이터 실행·설치·로그인·화면 렌더까지 확인됨**(adb `install`+`am start`, appId `app.linkscape`) — 남은 건 위 확인 대기 ①②
- **만들지 않은 것**: 페이지 스냅샷 아카이브 / PDF 하이라이트 / AI 자동 태깅

---

## 7. 환경변수 · API · 배포

- **환경변수 2개뿐**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - 로컬 `.env.local` 에 실제 키(gitignore). **Vercel 에도 설정 완료**. anon key 는 공개 가능(방어는 RLS). `service_role` 절대 금지
- **Supabase** `nfwthowdcyciorqabiae`: 마이그레이션 0001·0002 실행 완료, **이메일 확인 꺼짐**(가입 즉시 로그인).
  스키마/publication 변경은 `supabase/migrations/` 에 추가 후 **SQL Editor 에서 직접 실행**(CLI 없음, anon 키로 DDL 불가)
- **배포**: https://pdflinkin.vercel.app (Vercel 프로젝트명·배포 URL 은 옛 이름 `pdflinkin` 그대로)
- **Git**: `https://github.com/bugoms/linkscape` (main, GitHub 저장소는 `linkscape` 로 이름변경됨). 한글 커밋 메시지는 **파일로 쓰고 `git commit -F`**
- **E2E**: `node <스크립트>` (puppeteer-core + `C:/Program Files/Google/Chrome/Application/chrome.exe` headless).
  스크립트는 매 작업마다 스크래치패드에 임시로 작성(커밋 안 함). 패턴: 로그인 → `.react-flow__pane` 대기 → 상호작용 → REST(anon+access_token)로 DB 확인 → 테스트 데이터 청소.
  테스트 계정 `pdflinkin.e2e.test@gmail.com`(비밀번호는 Claude 메모리 `linkscape-e2e-setup`). 실사용자 보드와 분리
  - dev 서버가 port 3000 에 남아 있거나 전 페이지 404(Turbopack+OneDrive 글리치)면 서버 껐다 켜기
- **확장 설치**: `whale://extensions` → 개발자 모드 → 압축해제 → `whale-extension/`. 코드 수정 후 새로고침(⟳)
- **앱(Capacitor) 빌드**: `npm run cap:sync`(웹 변경 반영) → `npm run cap:android`(Studio 열기) → 에뮬레이터 Run. CLI 빌드: `android/` 에서 `JAVA_HOME`=Studio JBR(`C:\Program Files\Android\Android Studio\jbr`) 로 `.\gradlew.bat assembleDebug`. Android SDK=`%LOCALAPPDATA%\Android\Sdk`(`android/local.properties` 에 sdk.dir). **iOS 는 Mac 필요**. 상세는 `app-plan.md`
- **데스크톱(Tauri) 빌드**: `npm run desktop:dev`(빠른 디버그 실행) / `npm run desktop:build`(릴리스 + NSIS 설치파일, **7~15분**).
  - 요구사항: **Rust**(rustup, 설치됨) + **WebView2**(Win11 내장, 확인됨) + **VS 2022 C++ 빌드도구**(설치됨). `cargo` 가 PATH 에 없으면 `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`.
  - 산출물: 실행파일 `src-tauri/target/release/linkscape-desktop.exe`(3.43MB), 설치파일 `src-tauri/target/release/bundle/nsis/LinkScape_0.1.0_x64-setup.exe`(1.26MB).
  - 설치 시 **SmartScreen 경고**가 뜬다(코드 서명 안 함) — "추가 정보 → 실행"으로 진행.
  - 웹만 고쳤다면 데스크톱은 **재빌드 불필요**(원격 URL 로드라 Vercel 배포만 되면 반영).

---

## 8. 다음 채팅에서 가장 먼저 할 일

0. **워킹 트리 깨끗함** — 웹·확장·모바일·데스크톱 전부 커밋·푸시 완료. 미추적 `plan1.md`·`chrome-store-listing.skill`·`android/local.properties`·`src-tauri/target`·`src-tauri/gen`·`src-tauri/icon-source.png` 은 커밋 대상 아님(스크래치/gitignore). 한글 커밋은 `git commit -F`.
1. **데스크톱 클립보드 담기를 사용자가 눈으로 확인**(§6 확인 대기 ①) — 안 되면 그 피드백부터 처리.
2. **사용자 피드백 대기 상태** — 최근 흐름은 "실사용하며 UI/UX 다듬기". 새 요청이 오면 9번 규칙 안에서 바로 구현.
3. 앱화 진행은 `app-plan.md` 로드맵(P1 정적 번들 → 네이티브 공유 → iOS/스토어). 그 외 개선 후보:
   - 데스크톱: 자동 시작(`tauri-plugin-autostart`), 트레이로 파일 드래그해 담기, 자동 업데이트
   - 목록 보기(웹·확장) 정렬 기준 선택(색/최근/이름) · 보드 접기
   - 파일 뷰어 대안(한글 미리보기), 태그/AI 자동 분류(만든 적 없음)
3. 검증은 반드시 헤드리스 E2E 로 실동작 확인. 커밋 전 4종(9번 마지막) 필수.
   - **E2E 함정**: 스토리지 파일 존재 확인은 **GET 객체 엔드포인트 금지**(CDN 엣지 캐시가 삭제 후에도 stale 200) → `POST /storage/v1/object/list/files` (list) 로 확인.
   - 파일 업로드 E2E 는 `input[type=file]` 에 `elementHandle.uploadFile(path)`. 다운로드 파일명 검증은 `Page.setDownloadBehavior` 로 폴더 지정 후 `readdirSync`.
   - **드래그 후 DB 검증은 저장 큐와 레이스** — flush 는 500ms 디바운스 + 테이블별 순차 upsert 라, 단발 조회는 반쯤 저장된 상태(프레임은 새 값·카드는 옛 값)를 볼 수 있다. **기대 조건이 될 때까지 REST 폴링**으로 확인.
   - PostgREST **벌크 INSERT 는 모든 행의 키가 동일**해야 한다(`PGRST102`) — 한 행에만 frame_id 를 넣으면 400.
   - 스크래치패드의 ESM 스크립트에서 프로젝트 의존성은 `createRequire(<프로젝트>/package.json)` 로 로드(NODE_PATH 는 ESM 에 안 먹음).

---

## 9. 반드시 지켜야 할 조건 · 주의사항

### 아키텍처 (변경 금지)
- **저장은 스냅샷 diff 하나로만**: 모든 변경은 `useBoard.apply()`(히스토리)/`applyLive()`(드래그 중).
  Supabase 직접 write 금지 (예외: `extracted_text`, 휴지통 영구삭제(수동 + 15일 자동 `useTrashAutoPurge`), 보드 CRUD, 확장 REST 경로,
  목록의 **다른-보드 카드 소프트삭제**(스토어에 없어 apply 불가), PWA `/share` 담기)
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
- 그림자 예외 둘: `.product-shadow`(PDF 지면·사진), `.glass-float`(떠 있는 크롬). 텍스트 메뉴는 불투명 `.glass-solid`(뒤 비침 제거 — 리터럴 `#ffffff`)
- **그룹 프레임 배경은 불투명 파스텔**(FRAME_COLORS 고정 hex = 흰색+12%, 커스텀은 `color-mix(... 12%, #ffffff)`) — 반투명 알파 금지(점무늬 비침)
- 모양: rounded-full=액션 / apple-md(11px)=유틸 / apple-lg(18px)=카드·패널. 폰트 Pretendard 하나, 다크 모드 없음
- **확장 popup.css 는 웹 토큰 복제본** — 웹 토큰 바꾸면 같이 갱신

### 확장 (whale-extension)
- `sidebar_action` 절대 금지(MV2 전용). `api.js` 는 3환경 공용 — DOM API 금지(OffscreenCanvas), chrome.storage 없으면 localStorage 폴백
- `rest()` 빈 201 처리 유지. 이미지 다운로드는 CORS 때문에 반드시 background 에서
- 목록/검색은 **전 보드 조회 + board_id 포함**(RLS 가 한정). 새 카드 배치 = "가장 최근 카드 + 32px 계단식"

### 데스크톱 (src-tauri)
- **웹 코드를 데스크톱 때문에 고치지 않는다.** 네이티브가 필요한 건 전부 `src/lib.rs` 에서 해결하고, 담기는 웹의 `/share` 를 재사용한다 — 담기 규칙이 갈라지지 않게.
- **`capabilities/default.json` 에 `remote` 를 추가하지 말 것.** 추가하는 순간 원격 페이지가 Tauri IPC(클립보드·파일시스템 등)를 호출할 수 있게 된다. 지금은 의도적으로 닫혀 있다.
- 담기 결과는 **추정하지 말고 실제 이동 주소로 판정**한다(낙관적 "담았습니다" 금지).
- 릴리스 프로파일(`lto`·`codegen-units=1`)은 용량을 위한 것 — 빌드가 느려도 유지. 개발은 `desktop:dev`.
- 웹만 바뀌면 데스크톱 재빌드 불필요(원격 URL). `BASE_URL` 을 바꿀 땐 `tauri.conf.json` 의 창 `url` 도 같이.

### 코드·커밋
- Tailwind 클래스 동적 조립 금지 / effect 안 동기 setState 금지(React 19 lint — 렌더 중 조정 패턴)
- **커밋 전 4종**: `npx tsc --noEmit` + `npx eslint src --max-warnings=0` + `npm run build` + **헤드리스 E2E 실동작 확인**
  - 데스크톱(Rust)만 건드린 경우엔 4종 대신 `cargo check` + 실행 검증(트레이·단축키·창닫기)으로 대체한다 — 웹 코드가 안 바뀌므로.

---

## 변경 이력

- 2026-07-21: **Windows 데스크톱 앱 신규**(Tauri v2 — 트레이 상주·전역 단축키 Ctrl+Shift+V 로 클립보드 담기·창닫기=숨김, 실행파일 3.43MB/설치파일 1.26MB). 뷰어 Esc·뒤로가기 닫기 수정, 뷰어 중 캔버스 단축키 차단, 확장 새 아이콘·목록 행 정리(이름수정·중앙정렬·긴 제목 말줄임), 그리기=캔버스 잉크, 오버레이 Ctrl+휠 캔버스 줌, 그룹 유동 크기+겹침 방지, 프레임 불투명 배경, 팝업 메뉴 불투명(`.glass-solid`). 문서 구조 섹션의 깨진 줄바꿈 복구.
- 2026-07-20: 한글 뷰어(hwp.js), 확장 드롭존, 15일 자동 휴지통 정리, 상태표시줄 안전영역, 그룹 추가/모바일 묶기 모드. `HANDOFF.md` → `HANDOVER.md` 로 이름 변경.
- 2026-07-19: PWA 베이스라인(manifest·SW·`/share`) + Capacitor 안드로이드 프로젝트, `app-plan.md` 작성.
</content>
</invoke>
