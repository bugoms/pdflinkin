/* 백그라운드 서비스 워커 — 우클릭 메뉴로 담기.
 * 팝업을 열 필요 없이 링크/이미지/선택 텍스트/페이지를 바로 저장한다.
 * 결과는 확장 아이콘 배지로 알려준다 (파란 ✓ = 성공, 빨간 ! = 실패/미로그인).
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

async function handleMenuClick(info, tab) {
  const tabId = tab?.id;
  try {
    const session = await api.getSession();
    if (!session) {
      // 로그인 필요 — 배지로 알리고, 팝업 제목에도 남긴다
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
        await api.addImageLinkItem(session, boardId, info.srcUrl, tab?.title, pos);
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
