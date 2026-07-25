//! LinkScape 데스크톱 셸.
//!
//! 전략은 Capacitor 안드로이드와 같다 — **원격 URL 하이브리드**.
//! 웹 본체(Vercel)를 WebView2 로 그대로 띄우고, 네이티브가 얹는 것만 담당한다:
//!   · 시스템 트레이 상주 (창을 닫아도 종료되지 않음)
//!   · 트레이 메뉴에서 클립보드의 링크를 보드에 담기
//! `app-plan.md` 의 P1(정적 번들)이 끝나면 `BASE_URL` 을 로컬 번들로 바꾸면 된다.
//!
//! **메모리**: WebView2(크로미움 엔진)는 창이 떠 있는 동안만 무겁다(~150MB+).
//! 그래서 창을 닫으면 **숨기지 않고 파괴**해 WebView2 를 통째로 해제하고, 트레이
//! 상주 중에는 가벼운 Rust 호스트만 남긴다(창 없이도 살아 있도록 ExitRequested 를
//! prevent_exit). 다시 열 땐 창을 새로 만들어 페이지를 로드한다 — 세션은 WebView2
//! 데이터 폴더에 남아 재로그인은 없다.
//!
//! 담기는 **웹의 기존 `/share` 경로를 그대로 재사용**한다(PWA share_target 착지점).
//! 덕분에 담는 규칙(보드 확보·계단식 좌표·OG 백필)이 웹/확장/모바일과 한 곳에 유지된다.

use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;

/// 웹 본체. 배포 주소는 옛 이름 그대로다(HANDOVER §7).
const BASE_URL: &str = "https://pdflinkin.vercel.app";
/// 보드 창 라벨 — 닫으면 파괴되고, 트레이에서 다시 만든다.
const MAIN_LABEL: &str = "main";
/// 담기 전용 숨은 창의 라벨 — 보드 창을 건드리지 않으려고 따로 둔다.
const CAPTURE_LABEL: &str = "capture";
const WIN_W: f64 = 1280.0;
const WIN_H: f64 = 860.0;
/// 담기 결과 판정 폴링 (400ms × 40 = 최대 16초)
const POLL_INTERVAL_MS: u64 = 400;
const POLL_TRIES: u32 = 40;

fn notify(app: &AppHandle, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title("LinkScape")
        .body(body)
        .show();
}

/// 보드 창을 새로 만든다(트레이 상주 중 파괴돼 있을 때). tauri.conf.json 의
/// 시작 창과 같은 크기/주소 — 여기 값이 바뀌면 conf 도 같이 맞출 것.
fn build_main_window(app: &AppHandle) {
    let Ok(url) = format!("{BASE_URL}/board").parse() else {
        return;
    };
    let _ = WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::External(url))
        .title("LinkScape")
        .inner_size(WIN_W, WIN_H)
        .min_inner_size(520.0, 480.0)
        .center()
        .build();
}

/// 보드 창을 앞으로 — 살아 있으면 보이기, 파괴돼 있으면 새로 만든다.
fn open_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        build_main_window(app);
    }
}

/// 클립보드의 링크를 보드에 담는다.
///
/// 숨은 창을 `/share?text=…` 로 띄우면 웹의 SharePage 가 카드를 만들고
/// 성공 시 `/board?…item=…`, 세션이 없으면 `/login` 으로 이동한다.
/// 그 이동 주소를 폴링해 **실제 결과**로 알림을 띄운다(낙관적 추정 금지).
fn capture_clipboard(app: &AppHandle) {
    let text = app.clipboard().read_text().unwrap_or_default();
    let text = text.trim().to_string();
    if text.is_empty() {
        notify(app, "클립보드가 비어 있어요.");
        return;
    }

    let target = format!("{BASE_URL}/share?text={}", urlencoding::encode(&text));
    let Ok(parsed) = target.parse() else {
        notify(app, "담을 주소를 만들지 못했어요.");
        return;
    };

    // 이전 담기 창이 남아 있으면 정리하고 새로 띄운다(재사용보다 확실하다)
    if let Some(existing) = app.get_webview_window(CAPTURE_LABEL) {
        let _ = existing.destroy();
    }

    if WebviewWindowBuilder::new(app, CAPTURE_LABEL, WebviewUrl::External(parsed))
        .title("LinkScape 담는 중")
        .visible(false)
        .skip_taskbar(true)
        .build()
        .is_err()
    {
        notify(app, "담기를 시작하지 못했어요.");
        return;
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        for _ in 0..POLL_TRIES {
            tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;

            let Some(window) = handle.get_webview_window(CAPTURE_LABEL) else {
                return; // 사용자가 종료했거나 다음 담기가 이 창을 치웠다
            };
            let Ok(current) = window.url() else { continue };
            let path = current.path();
            let query = current.query().unwrap_or_default();

            if path.starts_with("/board") && query.contains("item=") {
                let _ = window.destroy();
                notify(&handle, "링크를 보드에 담았어요.");
                return;
            }
            if path.starts_with("/login") {
                let _ = window.destroy();
                notify(&handle, "먼저 로그인해 주세요.");
                open_main(&handle);
                return;
            }
        }

        if let Some(window) = handle.get_webview_window(CAPTURE_LABEL) {
            let _ = window.destroy();
        }
        notify(&handle, "담지 못했어요. 클립보드에 링크가 있는지 확인해 주세요.");
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let open_item =
                MenuItem::with_id(app, "open", "보드 열기", true, None::<&str>)?;
            let capture_item = MenuItem::with_id(
                app,
                "capture",
                "클립보드에서 담기",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open_item, &capture_item, &separator, &quit_item],
            )?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("LinkScape")
                .menu(&menu)
                // 왼쪽 클릭은 창 열기, 메뉴는 오른쪽 클릭으로 (윈도우 트레이 관행)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => open_main(app),
                    "capture" => capture_clipboard(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        open_main(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("LinkScape 데스크톱 실행 실패")
        // 트레이 상주 앱 — 창을 모두 닫아도(=파괴돼 WebView2 메모리 해제) 프로세스는
        // 살려 둔다. 종료는 오직 트레이 메뉴 "종료"(app.exit)로만.
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
