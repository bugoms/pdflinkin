# LinkScape 앱 배포 기획 (app-plan)

> 작성: 2026-07-19 / 갱신: 2026-07-21(Windows 데스크톱 추가)
> 목적: 현재 웹(Next.js + Supabase) + 웨일/크롬 확장으로 된 LinkScape 를
> **iOS·Android 앱 + Windows 데스크톱 앱**으로 배포하기 위한 방향·아키텍처·계획.
> 전제: [HANDOFF.md](HANDOFF.md) 의 아키텍처 규칙(스냅샷 저장 단일 경로, RLS,
> PDF 전량 클라이언트, realtime=applyRemote)은 앱에서도 그대로 지킨다.

---

## 0. 한눈에 (TL;DR)

- **권장 경로: Capacitor 로 기존 웹 UI 를 네이티브 셸에 감싸 스토어 배포** + PWA 를 빠른 베이스라인으로.
  React Native 전면 재작성은 **비권장**(무한 캔버스 `@xyflow/react`·`pdfjs` 를 잃고 공수 폭증).
- **앱의 킬러 기능 = "공유로 담기"** — 아무 앱에서 링크·PDF·이미지를 공유 시트로 LinkScape 에 담기.
  데스크톱 확장이 하던 일의 모바일판. (확장 `whale-extension/api.js` 의 REST 담기 로직을 그대로 재사용)
- **백엔드는 이미 앱-친화적**: Supabase(Postgres·Auth·Storage·Realtime)는 기기에서 HTTPS 로 직접 붙는다.
  유일한 서버 함수 `/api/unfurl` 만 **Supabase Edge Function** 으로 옮기면 Next 서버 없이 앱이 자립한다
  (덤: 확장도 unfurl 을 쓸 수 있게 되어 기존 제약 하나가 풀린다).
- **웹은 그대로 유지**(데스크톱·확장 연동). 앱은 같은 클라이언트 코드를 재사용한다.

권장 순서: **Android(PWA→TWA/Capacitor) 먼저 → iOS(Capacitor) → 공유 확장 → 스토어 제출 → 푸시/오프라인 폴리시**.

---

## 진행 상태 (2026-07-19 구현·검증 완료)

> 개발자 계정 없이·에뮬레이터 미실행 상태에서 검증 가능한 선까지 구현.

### ✅ P0 — PWA 베이스라인 (완료, E2E 7/7)
- `src/app/manifest.ts` — 설치형 매니페스트(standalone·아이콘) + **`share_target`(GET `/share`)**.
- `public/sw.js` + `components/pwa/ServiceWorkerRegister.tsx` — 오프라인 셸(네트워크 우선, 외부·/api·쓰기 제외).
- `src/app/share/page.tsx` — 공유 착지: 세션 확인 → 가장 오래된 보드에 링크 카드 생성 → 담은 카드로 딥링크(`?item=`). (확장 담기 규칙과 동일, OG 메타는 `useLinkBackfill` 이 채움)
- `src/middleware.ts` — matcher 에 `js`·`webmanifest` 제외 추가(**PWA 자산이 인증 가드에 걸려 로그인 HTML 로 리다이렉트되던 버그 수정**).
- `layout.tsx` — `appleWebApp`·`viewportFit:"cover"`·SW 등록.
- **검증**: 매니페스트(`application/manifest+json`·standalone·share_target)·SW(200)·**공유로 담기 플로우(링크 공유→카드 생성→딥링크→URL 정리)** 전부 통과.
- 효과: 안드로이드에서 **설치 + "공유 시트로 LinkScape 담기"가 네이티브 코드 없이 동작**.

### ✅ P2 — Capacitor Android 프로젝트 (완료, gradle 빌드 검증 · 에뮬레이터 미실행)
- 의존성: `@capacitor/core`·`@capacitor/android`·`@capacitor/app`(+`@capacitor/cli`).
- `capacitor.config.ts` — appId `app.linkscape`, appName `LinkScape`, **1차는 `server.url`→Vercel 하이브리드 PoC**(에뮬레이터에서 바로 전체 기능 동작). `capacitor-shell/` 은 연결 전/실패 폴백.
- `npx cap add android` → `android/` 네이티브 프로젝트 생성. `npm run cap:android`(=`cap open android`)로 Studio 에서 열어 Run.
- **검증**: `gradlew assembleDebug` → **BUILD SUCCESSFUL, `app-debug.apk` 생성**.
- 주의:
  - **프로젝트 경로 한글**(`…/바탕 화면/pdf링크서비스`) → AGP 경로 검사 실패 → `android/gradle.properties` 에 `android.overridePathCheck=true` 로 우회. **장기적으론 ASCII 경로로 옮기는 걸 권장**(일부 네이티브 툴이 비-ASCII 경로에서 깨질 수 있음).
  - `android/local.properties`(SDK 경로)·빌드 산출물은 `.gitignore` 로 제외됨.

### ✅ P2-D — Windows 데스크톱 앱 (Tauri, 완료)
- `src-tauri/` — Tauri v2. **전략은 Capacitor 안드로이드와 동일한 원격 URL 하이브리드**(`app.windows[0].url` → Vercel). P1 정적 번들이 끝나면 로컬 번들로 바꾸기만 하면 된다.
- 네이티브가 얹는 것만 담당:
  - **시스템 트레이 상주** — 창의 X 는 종료가 아니라 숨기기(`CloseRequested` → `prevent_close` + `hide`). 트레이 좌클릭=창 열기, 우클릭=메뉴(보드 열기 / 클립보드에서 담기 / 종료).
  - **전역 단축키 `Ctrl+Shift+V`** — 어느 앱에 있든 클립보드의 링크를 보드에 담는다. 확장이 브라우저 안에서 하던 일의 OS 판.
- **담기는 웹의 기존 `/share` 를 재사용**(PWA share_target 착지점). 숨은 창을 `/share?text=…` 로 띄우고, 그 창이 이동하는 주소를 폴링해 **실제 결과**로 알림을 띄운다(`/board?…item=` = 성공, `/login` = 로그인 필요). 담기 규칙이 웹/확장/모바일/데스크톱 한 곳에 유지된다.
- **보안**: `capabilities/default.json` 에 `remote` 를 두지 않아 **원격(Vercel) 페이지는 Tauri IPC 를 전혀 호출할 수 없다**. 클립보드·알림·트레이는 전부 Rust 쪽에서만 쓴다.
- **용량**: WebView2(Win11 내장)를 쓰므로 Electron(150MB+) 대비 매우 작다. 릴리스 프로파일에 `opt-level="s"`·LTO·strip 적용.
- 빌드: `npm run desktop:dev`(개발) / `npm run desktop:build`(NSIS 설치파일). 요구사항 = Rust + WebView2 + VS C++ 빌드도구.
- **iOS/안드로이드는 이 크레이트와 무관** — 모바일은 계속 Capacitor.

### 아직 안 한 것 (다음 단계)
- **P1 정적 번들**: `board/page` 서버→클라 로더, `middleware` 인증→클라 가드, `/api/unfurl`→Supabase Edge Function, Next `output: export`. → 앱 자립(오프라인·네이티브 공유의 전제).
- **네이티브 공유(P3)**: 위 정적 번들 위에서 Android `ACTION_SEND` intent + iOS **Share Extension**(REST 담기). 현재 `server.url` 하이브리드에선 PWA `share_target` 이 그 역할(안드로이드).
- **iOS**: `npx cap add ios` 는 **macOS/Xcode 필요**(현재 Windows). 설정(appId)은 준비됨.
- **스토어 제출·푸시·오프라인**: 계정 확보 후.

### 에뮬레이터에서 실행하는 법 (사용자가 직접)
1. `npm run cap:android` → Android Studio 에서 `android/` 열림.
2. 상단 기기 드롭다운에서 에뮬레이터 선택 → ▶ Run.
   (또는 CLI: `npx cap run android` — 단, 이건 에뮬레이터/기기를 띄운다.)
3. 앱이 뜨면 Vercel 의 LinkScape 를 로드 → 로그인 후 전체 기능 사용.

---

## 1. 목표와 범위

### 하려는 것
- 폰에서 설치해 쓰는 LinkScape 앱 (무한 캔버스 열람·편집, 담기, 검색, PDF 열람).
- **모바일 네이티브 "공유로 담기"**: Safari/Chrome/카톡 등에서 링크·PDF·이미지를 공유 → LinkScape 보드로.
- App Store / Google Play 배포(또는 최소 PWA 설치).

### 비목표(이번 범위 밖)
- 새 UI 프레임워크로의 재작성. 캔버스/PDF 는 웹뷰 재사용.
- 오프라인 완전 편집(1차는 온라인 전제, 오프라인은 후순위 폴리시).
- 데스크톱 확장 대체(확장은 그대로 둔다).

### 현재 유리한 점 (재사용 자산)
- 반응형·터치 이미 구현: 하단 플로팅 액션바, 인스펙터 하단 시트, 한 손가락 팬(올가미 off) — `Canvas.tsx` 의 `isMobile` 분기.
- 앱 아이콘 원본 존재: `icon.svg`·`apple-icon.png`·`favicon.ico`(미니 캔버스 심벌) → 앱 아이콘/스플래시로 재사용.
- 담기 로직이 이미 "REST 로 Supabase 직접 쓰기"로 확장에 구현됨(`whale-extension/api.js`: `ensureBoard`·`nextPosition`·`addLinkItem`·`addFileItem`) → 모바일 공유 핸들러가 그대로 참고/재사용.
- 저장 큐(`store/board.ts`)가 오프라인 내구성의 토대(네트워크 끊겨도 큐에 쌓였다 재시도).

### 격차 (앱화하려면 메워야 할 것)
- Next.js 서버 의존: `board/page.tsx`(서버 컴포넌트 로드), `middleware.ts`(인증 가드), `/api/unfurl`(서버 함수) — 앱 번들에는 서버가 없다.
- 네이티브 공유 수신(iOS Share Extension / Android ACTION_SEND) 부재.
- 세션 영속·딥링크(OAuth 콜백)·파일 피커·다운로드 저장의 네이티브 처리.
- PWA manifest / 서비스워커 없음(현재 `src/app/` 에 manifest 없음, `next.config.ts` 비어 있음).

---

## 2. 접근 방식 비교

| 방식 | 재사용 | 스토어 | 공유 수신 | 공수 | 판정 |
| --- | --- | --- | --- | --- | --- |
| **PWA**(manifest+SW) | 100% | ✗(설치형) | Android만(share_target) | 소 | 베이스라인·폴백 |
| **Capacitor**(웹뷰 셸) | ~100% | iOS·Android ✓ | 네이티브 확장으로 ✓ | 중 | **권장** |
| **TWA**(Android PWA 래핑) | 100% | Play만 | share_target | 소 | Android 보조 |
| **React Native/Expo** | ~0%(UI 재작성, 캔버스·PDF 대체 필요) | ✓ | ✓ | 특대 | 비권장 |

**권장: Capacitor(+PWA 베이스라인).** 무한 캔버스와 pdfjs 를 그대로 살리면서 네이티브 공유·파일·푸시를 붙일 수 있는 유일하게 합리적인 경로.

---

## 3. 대상 아키텍처 (모바일)

핵심 결정: **앱 안에는 "정적 클라이언트 번들"을 넣고, 기기에서 Supabase 에 직접 붙는다.** Next 서버는 앱에서 제거.

```
┌────────────────────────── 모바일 앱 (Capacitor 셸) ──────────────────────────┐
│  WebView: LinkScape 클라이언트 (React 19 + @xyflow/react + pdfjs, 정적 번들) │
│    - 인증/데이터/스토리지/Realtime  →  @supabase/supabase-js 로 직접 (HTTPS/WSS)│
│    - PDF 처리 전량 클라이언트 (기존 원칙 유지)                                │
│  네이티브 브리지(Capacitor 플러그인):                                        │
│    - Share Extension/Intent → 공유된 링크·파일을 담기 (api.js REST 재사용)    │
│    - Filesystem(다운로드 저장) · Preferences/SecureStorage(세션)             │
│    - App/Deep links(딥링크 /board?item=) · Browser(OAuth) · Push(후순위)     │
└──────────────────────────────────────────────────────────────────────────────┘
              │ HTTPS / WSS
              ▼
   Supabase (Postgres+RLS · Auth · Storage · Realtime)
   + Edge Function: unfurl (기존 /api/unfurl 의 SSRF 방어 로직 이식)

   [별도 유지] Vercel 웹앱(데스크톱) · 웨일/크롬 확장
```

### 왜 "정적 클라이언트 + 직접 Supabase" 인가
- 앱이 자립(서버 왕복 없이 시작·동작) → 네이티브 앱다운 반응성·오프라인 여지.
- 이미 브라우저에서 `@supabase/ssr` 대신 브라우저 클라이언트로 대부분 처리 중 → 서버 컴포넌트만 걷어내면 됨.
- 보안 경계는 지금도 **RLS**(anon key 공개 전제) → 기기 직결이어도 방어선 동일.

### 대안(참고): Capacitor `server.url` = Vercel 원격 로드
- 가장 빠르지만 앱이 "웹뷰 래퍼"에 가깝고, 애플 심사 4.2(최소 기능) 지적 여지·네트워크 필수·업데이트가 스토어 심사 우회.
- **1차 프로토타입/내부 테스트용으로만** 고려하고, 정식 배포는 위 "정적 번들"로 간다.

---

## 4. 확인이 필요한 결정 (사용자 선택)

| # | 결정 | 권장 |
| --- | --- | --- |
| D1 | 대상 OS | **둘 다**, 단 Android 먼저(심사 가벼움·PWA/TWA 빠름) |
| D2 | 배포 형태 | 스토어(Capacitor). PWA 는 병행 베이스라인 |
| D3 | 개발자 계정 | Apple Developer($99/년)·Google Play($25 1회) 필요 — 보유 여부 확인 |
| D4 | 1차 스코프 | 열람·담기·검색·PDF + **공유로 담기**까지. 푸시·오프라인은 2차 |
| D5 | unfurl 이전 | `/api/unfurl` → Supabase Edge Function 이전 승인(웹·확장·앱 공용) |
| D6 | 번들 방식 | 정적 클라이언트 번들(권장) vs 원격 URL 래퍼(빠른 PoC) |

> 이 표는 구현 착수 전에 합의할 항목. 나머지는 아래 계획대로 진행.

---

## 5. 기능별 모바일 구현 계획

### 5.1 공유로 담기 (⭐ 플래그십)
데스크톱 확장의 모바일판. "아무 앱 → 공유 → LinkScape".
- **Android**: `AndroidManifest` 에 `ACTION_SEND` intent-filter (text/plain, application/pdf, image/*).
  수신 플러그인(예: `send-intent`)으로 payload 를 받아 담기 라우트로.
- **iOS**: **Share Extension**(별도 앱 확장 타깃, Swift). App Group + Keychain 으로 세션 토큰 공유 →
  확장에서 **Supabase REST 직접 insert**(웨일 확장 `api.js` 의 `ensureBoard`/`nextPosition`/`addLinkItem`/`addFileItem` 와 동일 규칙).
- **재사용 포인트**: 담는 규칙(URL 정규화·좌표 계단식·빈 201 처리·이미지 썸네일 업로드)은 `api.js` 에 이미 있음 → 공용 로직으로 승격.
- 완료 후 배지/토스트 피드백(확장의 ✓/! 와 동일 UX).

### 5.2 인증 (Auth)
- 이메일/비번 로그인은 그대로(Supabase). **세션 영속을 네이티브 보안 저장소**에 두기
  (Capacitor `Preferences` 는 평문 → iOS Keychain/Android Keystore 기반 secure storage 플러그인 사용).
- `middleware.ts` 의 서버 가드 → **클라이언트 가드**(세션 없으면 `/login`)로 대체.
- (선택) 소셜 로그인 추가 시 딥링크로 OAuth 콜백(`/auth/callback`) 처리 — `Browser` 플러그인 + custom scheme/universal link.

### 5.3 캔버스 · 터치
- 이미 `isMobile` 분기로 팬/핀치 처리, 올가미 off. 웹뷰에서 대체로 그대로 동작 예상.
- 확인/보정: 페이지 전체 확대 방지(`viewport` `maximum-scale=1, user-scalable=no` 또는 셸 설정), safe-area inset(노치/홈바) 패딩, 오버스크롤 바운스 차단(이미 `overscroll-none`), 롱프레스=우클릭 메뉴 매핑.

### 5.4 PDF
- pdfjs 전량 클라이언트 유지. 워커(`public/pdf.worker.min.mjs`)를 번들에 포함(현재 prebuild 스크립트가 복사).
- 모바일 메모리 한계: 큰 PDF 렌더 타일링·페이지 언로드 점검, 썸네일 백필(`usePdfBackfill`)은 그대로.

### 5.5 파일 업로드 · 다운로드
- 업로드: 네이티브 파일 피커/사진 라이브러리(공유·`Camera`/`Filesystem` 플러그인) → 기존 `useIngest.addFiles` 경로.
- 다운로드 원본 저장: 웹의 `downloadStoredFile`(blob) 대신 **Capacitor `Filesystem`** 로 기기 저장 + "파일 앱/갤러리" 노출. 한글 파일명 처리 주의(웹에서 겪은 인코딩 이슈 재확인).

### 5.6 실시간 (Realtime)
- WebSocket 은 웹뷰에서 동작. `useRealtime` 그대로(구독 전 `setAuth` 순서 유지).
- 백그라운드 진입 시 소켓 정리/복귀 시 재구독(앱 라이프사이클 `App` 플러그인 훅).
- (2차) 앱이 꺼져 있을 때 "새 카드 담김" 알림 → Supabase DB Webhook → FCM/APNs 푸시.

### 5.7 딥링크
- `/board?item=<id>`(이번 세션에 만든 딥링크)·공유 결과 열기를 **Universal Links(iOS)/App Links(Android)** 로.
- Capacitor `App.addListener('appUrlOpen')` → 라우터 이동. 이미 `?item=` 포커스 로직 존재하므로 재사용.

### 5.8 오프라인 (2차)
- 셸·마지막 보드 캐시(서비스워커/Preferences)로 읽기 오프라인.
- 저장 큐가 이미 재시도 구조 → 오프라인 편집분 온라인 복귀 시 flush(에지 케이스 점검).

---

## 6. Next.js / 백엔드 변경

정적 클라이언트 번들을 만들기 위한 리팩터링(웹 데스크톱은 계속 SSR 로 둘 수도, 통일할 수도 있음 — D6 에 따름).

1. **`board/page.tsx`(서버) → 클라이언트 로더**: 서버에서 하던 boards/frames/items/edges/tags 로드·썸네일 서명을 브라우저 Supabase 클라이언트 로더로 이전(`BoardClient` 는 이미 클라이언트). `extracted_text` 제외 규칙 유지.
2. **`middleware.ts`(인증 가드) → 클라이언트 가드**(세션 없으면 로그인). middleware 는 deprecation 경고도 있음(→ `proxy`).
3. **`/api/unfurl` → Supabase Edge Function**: SSRF 방어(사설/링크로컬 차단·리다이렉트 재검사)·`<head>` 파싱·`link_meta_cache` 로직 그대로 Deno 로 이식. JWT 로 호출자 인증(남용 방지). → 웹·확장·앱 공용.
4. **정적 출력**: 앱 번들용 `output: 'export'`(또는 앱 전용 클라이언트 엔트리) 구성. `pdf.worker` 등 정적 자산 포함.
5. **env**: `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY` 만(지금과 동일, 공개 가능). `service_role` 절대 앱에 넣지 않음.

> 이 리팩터링은 웹의 동작을 바꾸지 않게 점진 적용(서버 컴포넌트를 걷어내도 같은 데이터/화면).

---

## 7. 새 의존성 · 툴링

- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
- 플러그인: `@capacitor/app`(라이프사이클·딥링크), `@capacitor/browser`, `@capacitor/filesystem`, `@capacitor/preferences`, 보안 저장소 플러그인, 공유 수신 플러그인(`send-intent` 등), (2차)`@capacitor/push-notifications`
- iOS: Xcode + Apple Developer, Share Extension 타깃, fastlane(선택)
- Android: Android Studio + JDK, ACTION_SEND intent-filter, Play Console
- 앱 아이콘/스플래시 생성(`@capacitor/assets`) — 기존 미니 캔버스 심벌 재사용

---

## 8. 스토어 제출 요건

- **비용**: Apple $99/년, Google $25(1회).
- **애플 심사 리스크**: 4.2(최소 기능) — "웹 래퍼" 지적 방지 위해 정적 번들 + 네이티브 공유 확장 + 오프라인 셸로 "앱다움" 확보.
- **개인정보**: 수집 항목 라벨(이메일·사용자 콘텐츠). 개인정보처리방침 URL 필요.
- **권한 사유 문구**: 사진/파일 접근(업로드·공유 저장)에 대한 usage description.
- **자산**: 스크린샷(기기별), 아이콘, 설명, 연령등급.
- **테스트 트랙**: TestFlight(iOS)·내부 테스트(Play) 로 단계 배포.

---

## 9. 디자인 · UX 모바일 대응

- Safe-area inset(상단 상태바·하단 홈바) 패딩 — 상단 헤더/하단 액션바 겹침 방지.
- 스플래시·상태바 스타일(밝은 테마 고정, 다크모드 없음 — 기존 원칙).
- 스크롤/줌: 페이지 확대 방지, 캔버스 핀치만 허용.
- 햅틱(담기 성공·삭제) 소소한 네이티브감(선택).
- 디자인 토큰은 `globals.css` 단일 출처 유지(확장 popup.css 처럼 복제본 만들지 않기).

---

## 10. 보안

- 방어선은 계속 **RLS**(모든 테이블) + 비공개 버킷 + 서명 URL. `service_role` 앱 반입 금지.
- 세션 토큰은 **보안 저장소**(Keychain/Keystore). 공유 확장과는 App Group/Keychain 로만 공유.
- unfurl Edge Function: JWT 검증 + 기존 SSRF 방어(사설/루프백/링크로컬·리다이렉트 재검사) 유지.
- 딥링크 입력 검증(`?item=` 등 파라미터 화이트리스트).

---

## 11. 단계별 로드맵 (대략 공수)

| 단계 | 내용 | 산출물 | 공수(러프) |
| --- | --- | --- | --- |
| **P0** | PWA 베이스라인 | manifest + 서비스워커 + 아이콘, "홈 추가" 설치 | 0.5~1일 |
| **P1** | 정적 클라이언트화 | board 서버→클라 로더, 미들웨어→클라 가드, unfurl→Edge Function | 2~4일 |
| **P2** | Capacitor 셸 | iOS·Android 프로젝트 생성, 번들 로드, 로그인·보드·PDF 실기기 동작 | 2~3일 |
| **P3** | 공유로 담기 | Android ACTION_SEND + iOS Share Extension(REST 담기) | 3~5일 |
| **P4** | 네이티브 폴리시 | 파일 저장·딥링크·safe-area·세션 보안저장·아이콘/스플래시 | 2~3일 |
| **P5** | 스토어 제출 | 계정·심사 자산·TestFlight/내부테스트 → 정식 | 2~4일(+심사 대기) |
| **P6(2차)** | 푸시·오프라인 | DB Webhook→FCM/APNs, 오프라인 읽기 캐시 | 후순위 |

> Android 우선(P0→TWA 로 조기 체험 가능), iOS 는 P2 부터 병행.

---

## 12. 리스크 · 오픈 이슈

- **애플 4.2 심사**: 웹뷰 성격 지적 가능 → 네이티브 공유·오프라인 셸로 완화(안 되면 기능 보강 재제출).
- **OneDrive+Turbopack dev 글리치**(기존): CI/빌드 안정성 점검(정적 export 시 특히).
- **WebView 편차**: iOS WKWebView vs Android WebView 에서 pdfjs·React Flow 제스처·메모리 차이 실기기 검증 필수.
- **세션 만료/갱신**을 웹뷰·공유확장 양쪽에서 일관되게(확장이 겪은 `getSession` 갱신 패턴 참고).
- **한글 파일명 저장**(웹에서 겪음)·큰 PDF 메모리·백그라운드 소켓 정리.
- **unfurl 이전**은 웹·확장에도 영향(회귀 테스트 필요) — 이전 시 3면(웹/확장/앱) E2E.

---

## 13. 완료 기준 (Definition of Done)

- 실기기(iOS·Android)에서: 로그인 → 보드 열람/편집 → 담기 → 검색 → PDF 열람 정상.
- **타 앱에서 공유 → LinkScape 보드에 카드 생성** 확인(링크·PDF·이미지).
- 딥링크(`/board?item=`)로 특정 카드 진입.
- 스토어 내부 테스트 트랙 배포 성공(TestFlight·Play 내부).
- HANDOFF 4종 검증(tsc·eslint·build·E2E)에 **모바일 스모크(실기기/에뮬레이터)** 추가.

---

## 14. 다음 단계

1. **§4 결정표(D1~D6) 합의** — 특히 대상 OS·개발자 계정·unfurl 이전 승인.
2. P0(PWA) 로 빠르게 "설치되는 앱" 체감 → P1 정적 클라이언트화 착수.
3. 각 단계는 실기기 검증 + 커밋 전 4종 검증을 그대로 적용.
