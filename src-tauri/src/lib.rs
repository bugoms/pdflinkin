//! LinkScape 데스크톱 셸.
//!
//! 전략은 Capacitor 안드로이드와 같다 — **원격 URL 하이브리드**.
//! 웹 본체(Vercel)를 WebView2 로 그대로 띄우고, 네이티브가 얹는 것만 담당한다:
//!   · 시스템 트레이 상주 (창을 닫아도 종료되지 않음)
//!   · 전역 단축키 → 클립보드의 링크를 보드에 담기
//! `app-plan.md` 의 P1(정적 번들)이 끝나면 `BASE_URL` 을 로컬 번들로 바꾸면 된다.
//!
//! 담기는 **웹의 기존 `/share` 경로를 그대로 재사용**한다(PWA share_target 착지점).
//! 덕분에 담는 규칙(보드 확보·계단식 좌표·OG 백필)이 웹/확장/모바일과 한 곳에 유지된다.

use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;

/// 웹 본체. 배포 주소는 옛 이름 그대로다(HANDOVER §7).
const BASE_URL: &str = "https://pdflinkin.vercel.app";
/// 담기 전용 숨은 창의 라벨 — 보드 창(main)을 건드리지 않으려고 따로 둔다.
const CAPTURE_LABEL: &str = "capture";
const SHORTCUT: &str = "CmdOrCtrl+Shift+V";
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

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
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
                show_main(&handle);
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
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::ShortcutState;
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // 눌림에만 반응 — 떼는 순간까지 처리하면 두 번 담긴다
                    if event.state() == ShortcutState::Pressed {
                        capture_clipboard(app);
                    }
                })
                .build(),
        );
    }

    builder
        .setup(|app| {
            let open_item =
                MenuItem::with_id(app, "open", "보드 열기", true, None::<&str>)?;
            let capture_item = MenuItem::with_id(
                app,
                "capture",
                "클립보드에서 담기  (Ctrl+Shift+V)",
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
                .tooltip("LinkScape — 클립보드 담기 Ctrl+Shift+V")
                .menu(&menu)
                // 왼쪽 클릭은 창 열기, 메뉴는 오른쪽 클릭으로 (윈도우 트레이 관행)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
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
                        show_main(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                if let Err(err) = app.global_shortcut().register(SHORTCUT) {
                    // 다른 앱이 선점했을 수 있다 — 앱은 계속 뜬다(트레이 메뉴로 담기 가능)
                    eprintln!("[linkscape] 전역 단축키({SHORTCUT}) 등록 실패: {err}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 보드 창의 X 는 종료가 아니라 트레이로 숨기기
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("LinkScape 데스크톱 실행 실패");
}
