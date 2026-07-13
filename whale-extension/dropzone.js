/* 페이지 드롭존 — 링크/이미지/텍스트를 드래그하기 시작하면 화면 우하단에
 * "LinkScape에 놓기" 타겟이 나타난다. OS 에서 파일을 끌고 들어와도 뜬다.
 *
 * - Shadow DOM 으로 페이지 CSS 와 격리
 * - 링크·메모·파일은 이 스크립트가 직접 저장 (api.js 공유, 세션은 chrome.storage)
 * - 이미지는 CORS 우회가 필요해 백그라운드 워커에 넘겨 다운로드한다
 */

/* global api */

(() => {
  if (window.top !== window) return; // iframe 에는 심지 않는다

  let shadowHost = null;
  let zone = null;
  let toast = null;
  let toastTimer = null;
  let osDragDepth = 0;

  /* ----------------------------------------------------------------------- */
  /* UI                                                                       */
  /* ----------------------------------------------------------------------- */

  function ensureUi() {
    if (shadowHost) return;

    shadowHost = document.createElement("div");
    shadowHost.id = "linkscape-dropzone-host";
    shadowHost.style.cssText = "all: initial;";
    const root = shadowHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    /* 웹사이트 디자인 토큰 복제 — 흰 면, 헤어라인, Action Blue, 18px 라운드 */
    style.textContent = `
      #zone {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        width: 232px;
        padding: 20px 16px;
        box-sizing: border-box;
        background: #ffffff;
        border: 1.5px dashed #e0e0e0;
        border-radius: 18px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
        font-family: "Pretendard Variable", Pretendard, -apple-system,
          BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Malgun Gothic",
          sans-serif;
        letter-spacing: -0.01em;
        text-align: center;
        color: #1d1d1f;
      }
      #zone.over {
        border-color: #0066cc;
        background: #f4f8fd;
      }
      #zone .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        background: #0066cc;
        color: #fff;
        font-size: 19px;
        font-weight: 600;
        margin-bottom: 8px;
        pointer-events: none;
      }
      #zone .main {
        font-size: 14px;
        font-weight: 600;
        pointer-events: none;
      }
      #zone .sub {
        font-size: 12px;
        color: #7a7a7a;
        margin-top: 3px;
        pointer-events: none;
      }
      #toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        max-width: 280px;
        padding: 10px 16px;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 999px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
        font-family: "Pretendard Variable", Pretendard, -apple-system,
          BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Malgun Gothic",
          sans-serif;
        font-size: 13px;
        letter-spacing: -0.01em;
        color: #1d1d1f;
      }
      #toast.ok { color: #0066cc; }
      #toast.fail { color: #d70015; }
      [hidden] { display: none !important; }
    `;

    zone = document.createElement("div");
    zone.id = "zone";
    zone.hidden = true;
    zone.innerHTML = `
      <span class="badge">L</span>
      <div class="main">여기에 놓으면 LinkScape로</div>
      <div class="sub">링크 · 이미지 · 파일 · 텍스트</div>
    `;

    toast = document.createElement("div");
    toast.id = "toast";
    toast.hidden = true;

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideZone();
      void handleDrop(e.dataTransfer);
    });

    root.append(style, zone, toast);
    document.documentElement.appendChild(shadowHost);
  }

  function showZone() {
    ensureUi();
    toast.hidden = true;
    zone.hidden = false;
  }

  function hideZone() {
    if (!zone) return;
    zone.hidden = true;
    zone.classList.remove("over");
    osDragDepth = 0;
  }

  function showToast(message, ok) {
    ensureUi();
    toast.textContent = message;
    toast.className = ok ? "ok" : "fail";
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  /* ----------------------------------------------------------------------- */
  /* 담기                                                                     */
  /* ----------------------------------------------------------------------- */

  async function handleDrop(dt) {
    const files = Array.from(dt.files ?? []);
    const html = dt.getData("text/html") ?? "";
    const uri = dt.getData("text/uri-list") ?? "";
    const text = dt.getData("text/plain") ?? "";

    try {
      const session = await api.getSession();
      if (!session) {
        showToast("로그인이 필요합니다 — 확장 아이콘을 눌러 로그인하세요", false);
        return;
      }
      const boardId = await api.ensureBoard(session);
      const pos = await api.nextPosition(session, boardId);

      /* 1. OS 에서 끌고 온 파일 */
      if (files.length > 0) {
        let saved = 0;
        for (const [index, file] of files.entries()) {
          try {
            await api.addFileItem(session, boardId, file, {
              x: pos.x + index * 32,
              y: pos.y + index * 32,
            });
            saved += 1;
          } catch (err) {
            showToast(String(err.message ?? err), false);
          }
        }
        if (saved > 0) showToast(`${saved}개 담았습니다`, true);
        return;
      }

      /* 2. 페이지의 이미지 — 다운로드는 백그라운드가 (CORS 우회) */
      if (/<img[\s>]/i.test(html)) {
        const src = uri || (html.match(/src="([^"]+)"/i)?.[1] ?? "");
        if (!src) {
          showToast("이미지 주소를 읽지 못했습니다", false);
          return;
        }
        const res = await chrome.runtime.sendMessage({
          type: "linkscape-save-image",
          srcUrl: src,
          title: document.title,
        });
        if (res?.ok) showToast("이미지를 담았습니다", true);
        else showToast(res?.error ?? "이미지 담기 실패", false);
        return;
      }

      /* 3. 링크 */
      const urls = api.extractUrls(uri || text);
      if (urls.length > 0) {
        for (const [index, url] of urls.entries()) {
          await api.addLinkItem(session, boardId, url, {
            x: pos.x + index * 32,
            y: pos.y + index * 32,
          });
        }
        showToast(urls.length > 1 ? `링크 ${urls.length}개 담았습니다` : "링크를 담았습니다", true);
        return;
      }

      /* 4. 일반 텍스트 → 메모 */
      if (text.trim()) {
        await api.addNoteItem(session, boardId, text.trim(), pos);
        showToast("메모로 담았습니다", true);
        return;
      }

      showToast("담을 수 있는 내용이 없습니다", false);
    } catch (err) {
      showToast(`담기 실패: ${String(err.message ?? err).slice(0, 60)}`, false);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* 드래그 감지                                                              */
  /* ----------------------------------------------------------------------- */

  /* 페이지 안에서 시작한 드래그 (링크·이미지·선택 텍스트) */
  document.addEventListener(
    "dragstart",
    (e) => {
      if (shadowHost && e.composedPath().includes(shadowHost)) return;
      showZone();
    },
    true,
  );
  document.addEventListener("dragend", hideZone, true);

  /* OS 파일 드래그 — dragstart 가 없으므로 dragenter 의 Files 타입으로 감지 */
  document.addEventListener(
    "dragenter",
    (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      osDragDepth += 1;
      showZone();
    },
    true,
  );
  document.addEventListener(
    "dragleave",
    (e) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      osDragDepth = Math.max(0, osDragDepth - 1);
      if (osDragDepth === 0) hideZone();
    },
    true,
  );
  /* 드롭존 밖에 떨어뜨리면 그냥 접는다 (페이지 기본 동작은 건드리지 않음) */
  document.addEventListener("drop", hideZone, true);
})();
