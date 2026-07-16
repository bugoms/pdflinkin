/* 팝업 로직 — 붙여넣기 / 드래그앤드롭 / URL 입력 / 현재 탭 담기 */

/* global LS_CONFIG, api */

const $ = (sel) => document.querySelector(sel);

let session = null;
let boardId = null;

/* 웹사이트 카드 색 토큰 순서 (lib/palette.ts 의 COLOR_TOKENS 와 동일) */
const COLOR_ORDER = ["neutral", "sky", "emerald", "amber", "rose", "violet"];

/* Supabase 영문 오류를 사람이 읽을 수 있게 (웹사이트 login/page.tsx 와 동일 규칙) */
function translate(message) {
  const m = String(message).toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (m.includes("email not confirmed")) return "이메일 확인이 아직 안 됐습니다.";
  return String(message);
}

/* ------------------------------------------------------------------------- */
/* 화면 전환                                                                  */
/* ------------------------------------------------------------------------- */

function showLogin() {
  $("#login-view").hidden = false;
  $("#main-view").hidden = true;
  $("#list-view").hidden = true;
}

function showMain() {
  $("#login-view").hidden = true;
  $("#main-view").hidden = false;
  $("#list-view").hidden = true;
  $("#account-email").textContent = session.email ?? "";
}

function showList() {
  $("#login-view").hidden = true;
  $("#main-view").hidden = true;
  $("#list-view").hidden = false;
}

/* ------------------------------------------------------------------------- */
/* 작업 목록 (담는 중 → 완료/실패)                                             */
/* ------------------------------------------------------------------------- */

function addTask(label) {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.className = "label";
  name.textContent = label;
  const state = document.createElement("span");
  state.className = "state";
  state.textContent = "담는 중…";
  li.append(name, state);
  $("#tasks").prepend(li);

  return {
    done() {
      li.classList.add("done");
      state.textContent = "완료";
    },
    fail(message) {
      li.classList.add("fail");
      state.textContent = message || "실패";
    },
  };
}

/* ------------------------------------------------------------------------- */
/* 담기 동작                                                                  */
/* ------------------------------------------------------------------------- */

async function ready() {
  if (!boardId) boardId = await api.ensureBoard(session);
  return boardId;
}

async function ingestLinks(urls) {
  await ready();
  const base = await api.nextPosition(session, boardId);
  await Promise.all(
    urls.map(async (url, index) => {
      const task = addTask(api.hostname(url));
      try {
        await api.addLinkItem(session, boardId, url, {
          x: base.x + index * 32,
          y: base.y + index * 32,
        });
        task.done();
      } catch (err) {
        task.fail(translate(err.message));
      }
    }),
  );
}

async function ingestNote(text) {
  await ready();
  const base = await api.nextPosition(session, boardId);
  const task = addTask(`메모: ${text.slice(0, 30)}`);
  try {
    await api.addNoteItem(session, boardId, text, base);
    task.done();
  } catch (err) {
    task.fail(translate(err.message));
  }
}

async function ingestFiles(files) {
  await ready();
  const base = await api.nextPosition(session, boardId);
  await Promise.all(
    files.map(async (file, index) => {
      const task = addTask(file.name);
      try {
        await api.addFileItem(session, boardId, file, {
          x: base.x + index * 32,
          y: base.y + index * 32,
        });
        task.done();
      } catch (err) {
        task.fail(translate(err.message));
      }
    }),
  );
}

/* ------------------------------------------------------------------------- */
/* 이벤트                                                                     */
/* ------------------------------------------------------------------------- */

function bindLogin() {
  $("#signup-link").href = `${LS_CONFIG.WEB_URL}/login`;

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = $("#login-submit");
    const errorEl = $("#login-error");
    button.disabled = true;
    button.textContent = "처리 중…";
    errorEl.hidden = true;

    try {
      session = await api.signIn(
        $("#login-email").value.trim(),
        $("#login-password").value,
      );
      showMain();
    } catch (err) {
      errorEl.textContent = translate(err.message);
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "로그인";
    }
  });
}

function bindMain() {
  $("#open-board").href = `${LS_CONFIG.WEB_URL}/board`;

  $("#sign-out").addEventListener("click", async () => {
    await api.signOut();
    session = null;
    boardId = null;
    showLogin();
  });

  /* 현재 탭 담기 — 확장 컨텍스트에서만 노출 */
  if (globalThis.chrome?.tabs) {
    const button = $("#capture-tab");
    button.hidden = false;
    button.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? "";
      if (!/^https?:\/\//.test(url)) {
        addTask("이 탭은 담을 수 없습니다").fail("주소 없음");
        return;
      }
      await ingestLinks([url]);
    });
  }

  /* 목록 보기 — 색깔 순서로 제목 나열 + 키워드 검색 */
  $("#open-board-list").href = `${LS_CONFIG.WEB_URL}/board`;

  const searchInput = $("#search-input");
  const listEl = $("#item-list");
  let allItems = []; // 목록 보기를 열 때마다 새로 받는 전체 카드
  let allFrames = []; // 그룹(프레임) 목록
  let searchTimer = null;

  /** "#rrggbb" 는 웹의 컬러 피커로 직접 고른 커스텀 색 */
  function isCustomColor(color) {
    return typeof color === "string" && color.startsWith("#");
  }

  /** 색 점 — 토큰이면 클래스, 커스텀 hex 면 인라인 배경 */
  function colorDot(color) {
    const dot = document.createElement("span");
    if (isCustomColor(color)) {
      dot.className = "dot";
      dot.style.background = color;
    } else {
      dot.className = `dot ${COLOR_ORDER.includes(color) ? color : "neutral"}`;
    }
    return dot;
  }

  function colorIndex(color) {
    const idx = COLOR_ORDER.indexOf(color ?? "neutral");
    return idx === -1 ? COLOR_ORDER.length : idx; // 커스텀 색은 토큰들 뒤에
  }

  function sortByColor(items) {
    return [...items].sort((a, b) => colorIndex(a.color) - colorIndex(b.color));
  }

  function itemRow(item, isChild) {
    const li = document.createElement("li");
    if (isChild) li.className = "child";

    const button = document.createElement("button");
    button.type = "button";

    if (isChild) {
      // 그룹에 종속됨을 나타내는 ㄴ자 연결선
      const tree = document.createElement("span");
      tree.className = "tree";
      button.append(tree);
    }

    const dot = colorDot(item.color);

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title || item.file_name || item.note || "제목 없음";

    button.append(dot, title);
    button.addEventListener("click", () => {
      window.open(`${LS_CONFIG.WEB_URL}/board`, "_blank", "noreferrer");
    });
    li.append(button);
    return li;
  }

  function groupHeader(label, color, count) {
    const li = document.createElement("li");
    li.className = "group-header";

    const dot = colorDot(color);

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = label;

    const badge = document.createElement("span");
    badge.className = "group-count";
    badge.textContent = String(count);

    li.append(dot, name, badge);
    return li;
  }

  function emptyRow(message) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = message;
    return li;
  }

  /** 전체 목록 — 그룹별로 묶고, 각 묶음 안은 색깔 순서로 */
  function renderGrouped() {
    listEl.textContent = "";

    if (allItems.length === 0 && allFrames.length === 0) {
      listEl.append(emptyRow("보드가 비어 있습니다"));
      return;
    }

    const frameIds = new Set(allFrames.map((f) => f.id));
    const grouped = new Map(); // frame_id → items
    const loose = [];
    for (const item of allItems) {
      if (item.frame_id && frameIds.has(item.frame_id)) {
        if (!grouped.has(item.frame_id)) grouped.set(item.frame_id, []);
        grouped.get(item.frame_id).push(item);
      } else {
        loose.push(item);
      }
    }

    for (const frame of allFrames) {
      const children = grouped.get(frame.id) ?? [];
      listEl.append(
        groupHeader(frame.title || "무제 그룹", frame.color ?? "sky", children.length),
      );
      for (const item of sortByColor(children)) {
        listEl.append(itemRow(item, true));
      }
    }

    if (loose.length > 0) {
      if (allFrames.length > 0) {
        listEl.append(groupHeader("그룹 밖", "neutral", loose.length));
      }
      for (const item of sortByColor(loose)) listEl.append(itemRow(item, false));
    }
  }

  /** 검색 결과 — 그룹 구분 없이 색깔 순서로 */
  function renderSearch(hits) {
    listEl.textContent = "";
    if (hits.length === 0) {
      listEl.append(emptyRow("결과가 없습니다"));
      return;
    }
    for (const item of sortByColor(hits)) listEl.append(itemRow(item));
  }

  async function openList() {
    showList();
    searchInput.value = "";
    listEl.textContent = "";
    listEl.append(emptyRow("불러오는 중…"));

    try {
      await ready();
      [allItems, allFrames] = await Promise.all([
        api.listItems(session, boardId),
        api.listFrames(session, boardId),
      ]);
      renderGrouped();
    } catch {
      listEl.textContent = "";
      listEl.append(emptyRow("목록을 불러오지 못했습니다"));
    }
  }

  async function runSearch(term) {
    try {
      await ready();
      const hits = await api.searchItems(session, boardId, term);
      if (searchInput.value.trim() !== term) return; // 뒤늦은 응답 무시
      renderSearch(hits);
    } catch {
      renderSearch([]);
    }
  }

  $("#open-list").addEventListener("click", () => void openList());
  $("#back-to-main").addEventListener("click", showMain);

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = searchInput.value.trim();
    if (!term) {
      renderGrouped();
      return;
    }
    searchTimer = setTimeout(() => void runSearch(term), 250);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      renderGrouped();
    }
  });

  /* Ctrl+V — 파일이면 업로드, URL 이면 링크, 그 외 텍스트는 메모 */
  document.addEventListener("paste", (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) return; // 입력창은 기본 동작

    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
      return;
    }

    const text = e.clipboardData?.getData("text/plain") ?? "";
    const urls = api.extractUrls(text);
    if (urls.length > 0) {
      e.preventDefault();
      void ingestLinks(urls);
      return;
    }
    if (text.trim()) {
      e.preventDefault();
      void ingestNote(text.trim());
    }
  });

  /* 드래그앤드롭 */
  const dropzone = $("#dropzone");
  for (const type of ["dragover", "dragenter"]) {
    document.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add("over");
    });
  }
  for (const type of ["dragleave", "dragend"]) {
    document.addEventListener(type, () => dropzone.classList.remove("over"));
  }
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("over");

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      void ingestFiles(files);
      return;
    }
    const text =
      e.dataTransfer?.getData("text/uri-list") ||
      e.dataTransfer?.getData("text/plain") ||
      "";
    const urls = api.extractUrls(text);
    if (urls.length > 0) void ingestLinks(urls);
  });
}

/* ------------------------------------------------------------------------- */

async function init() {
  bindLogin();
  bindMain();

  session = await api.getSession();
  if (session) showMain();
  else showLogin();
}

document.addEventListener("DOMContentLoaded", () => void init());
