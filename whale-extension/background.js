/* 백그라운드 서비스 워커.
 * - 우클릭 메뉴 4종 (링크/이미지/선택 텍스트/페이지)
 * - 드롭존 콘텐츠 스크립트의 이미지 담기 요청 처리
 * - <all_urls> 권한이 있으므로 이미지는 실제로 내려받아 스토리지에 올린다
 *   (실패하면 핫링크 카드로 폴백)
 * 결과는 확장 아이콘 배지로: 파란 ✓ = 성공, 빨간 ! = 실패/미로그인.
 */

/* global LS_CONFIG, api */

importScripts("config.js", "api.js");

const MENU = {
  link: "linkscape-link",
  image: "linkscape-image",
  selection: "linkscape-selection",
  page: "linkscape-page",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU.link,
    title: "LinkScape에 링크 담기",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: MENU.image,
    title: "LinkScape에 이미지 담기",
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: MENU.selection,
    title: "LinkScape에 메모로 담기",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU.page,
    title: "LinkScape에 이 페이지 담기",
    contexts: ["page"],
  });
});

/** 아이콘 배지로 결과를 잠깐 보여준다 */
async function flashBadge(tabId, ok) {
  const scope = tabId != null ? { tabId } : {};
  await chrome.action.setBadgeBackgroundColor({
    ...scope,
    color: ok ? "#0066cc" : "#d70015",
  });
  await chrome.action.setBadgeText({ ...scope, text: ok ? "✓" : "!" });
  setTimeout(() => {
    void chrome.action.setBadgeText({ ...scope, text: "" });
  }, 1600);
}

/** 이미지를 실제로 내려받아 파일 카드로 저장한다. 실패하면 핫링크 카드로. */
async function saveImage(session, boardId, srcUrl, title, pos) {
  try {
    const res = await fetch(srcUrl); // <all_urls> 권한으로 CORS 우회
    if (!res.ok) throw new Error(`이미지 응답 ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) throw new Error("이미지가 아님");

    const ext = (blob.type.split("/")[1] ?? "img").split("+")[0].slice(0, 5);
    const name = `${(title || "이미지").slice(0, 60)}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    await api.addFileItem(session, boardId, file, pos);
  } catch {
    await api.addImageLinkItem(session, boardId, srcUrl, title, pos);
  }
}

async function handleMenuClick(info, tab) {
  const tabId = tab?.id;
  try {
    const session = await api.getSession();
    if (!session) {
      await flashBadge(tabId, false);
      await chrome.action.setTitle({ title: "LinkScape — 로그인이 필요합니다" });
      return;
    }
    await chrome.action.setTitle({ title: "LinkScape에 담기" });

    const boardId = await api.ensureBoard(session);
    const pos = await api.nextPosition(session, boardId);

    switch (info.menuItemId) {
      case MENU.link: {
        const url = api.normalizeUrl(info.linkUrl ?? "");
        if (!url) throw new Error("담을 수 없는 링크");
        await api.addLinkItem(session, boardId, url, pos);
        break;
      }
      case MENU.image: {
        if (!info.srcUrl) throw new Error("이미지 주소 없음");
        await saveImage(session, boardId, info.srcUrl, tab?.title, pos);
        break;
      }
      case MENU.selection: {
        const text = (info.selectionText ?? "").trim();
        if (!text) throw new Error("선택된 텍스트 없음");
        await api.addNoteItem(session, boardId, text, pos);
        break;
      }
      case MENU.page: {
        const url = api.normalizeUrl(info.pageUrl ?? tab?.url ?? "");
        if (!url) throw new Error("담을 수 없는 페이지");
        await api.addLinkItem(session, boardId, url, pos, tab?.title);
        break;
      }
      default:
        return;
    }

    await flashBadge(tabId, true);
  } catch (err) {
    console.warn("[linkscape] 담기 실패", err);
    await flashBadge(tabId, false);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});

/* 드롭존(콘텐츠 스크립트)의 이미지 담기 요청 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "linkscape-save-image") return undefined;

  void (async () => {
    try {
      const session = await api.getSession();
      if (!session) {
        sendResponse({ ok: false, error: "로그인이 필요합니다" });
        return;
      }
      const boardId = await api.ensureBoard(session);
      const pos = await api.nextPosition(session, boardId);
      await saveImage(session, boardId, message.srcUrl, message.title, pos);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: String(err.message ?? err).slice(0, 80) });
    }
  })();

  return true; // 비동기 응답
});
