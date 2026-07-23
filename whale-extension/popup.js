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

  /* 폴더에서 파일 선택 → 업로드 (PDF·이미지·워드·한글 등) */
  $("#pick-file").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void ingestFiles(files);
    e.target.value = ""; // 같은 파일 다시 고를 수 있도록 초기화
  });

  /* 목록 보기 — 색깔 순서로 제목 나열 + 키워드 검색 */
  $("#open-board-list").href = `${LS_CONFIG.WEB_URL}/board`;

  const searchInput = $("#search-input");
  const listEl = $("#item-list");
  let allItems = []; // 목록 보기를 열 때마다 새로 받는 전체 카드(모든 보드)
  let allFrames = []; // 그룹(프레임) 목록(모든 보드)
  let allBoards = []; // 내 보드 목록
  let boardsById = {}; // board_id → 보드 제목
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

  /** 새 탭에서 연다. 확장 팝업이면 chrome.tabs(팝업 차단 안 걸림), 아니면 window.open. */
  function openTab(url) {
    if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url });
    else window.open(url, "_blank", "noreferrer");
  }

  /** 일반 파일을 원래 이름으로 내려받는다(한글 이름도 안 깨짐).
   *  네이버 웨일 등은 내려받은 로컬 파일을 자체 문서 뷰어로 띄운다. */
  async function downloadStored(item) {
    await ready();
    const signed = await api.signStorageUrl(session, item.storage_path);
    if (!signed) return false;
    try {
      const res = await fetch(signed);
      if (!res.ok) return false;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = item.file_name || item.title || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return true;
    } catch {
      return false;
    }
  }

  /** 행 클릭 = 그 문서/링크 자체를 연다 (보드가 아니라). */
  async function openItem(item) {
    // 1) 링크 카드 — url 로 바로 이동 (http 이미지 링크는 og_image_url 폴백)
    const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);
    const directUrl = item.url || (isHttp(item.og_image_url) ? item.og_image_url : null);
    if (directUrl) {
      openTab(directUrl);
      return;
    }
    // 2) 일반 파일(워드·한글 등) — 원래 이름으로 다운로드(웨일 뷰어가 로컬 파일을 연다)
    if (item.kind === "file" && item.storage_path) {
      try {
        if (await downloadStored(item)) return;
      } catch {
        /* 실패하면 아래 폴백 */
      }
    }
    // 3) PDF·이미지 등 — 서명 URL 로 새 탭에서 인라인 보기
    if (item.storage_path) {
      try {
        await ready();
        const signed = await api.signStorageUrl(session, item.storage_path);
        if (signed) {
          openTab(signed);
          return;
        }
      } catch {
        /* 실패하면 아래 보드 폴백 */
      }
    }
    // 4) 메모 등 열 대상이 없으면 그 카드가 있는 보드로 이동한다
    openOnBoard(item);
  }

  /** 보조(↦ 보드에서 보기): 그 카드가 있는 보드로 이동해 위치를 보여준다(딥링크).
   *  웹이 ?item=… 을 받아 해당 카드로 화면을 옮기고 선택한다. */
  function openOnBoard(item) {
    const board = item.board_id
      ? `board=${encodeURIComponent(item.board_id)}&`
      : "";
    openTab(
      `${LS_CONFIG.WEB_URL}/board?${board}item=${encodeURIComponent(item.id)}`,
    );
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
    button.addEventListener("click", () => void openItem(item));

    // 이름(제목) 수정 — 행에 마우스를 올리면 삭제 왼쪽에 나타난다. 인라인 입력으로 바꾼다.
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "row-rename";
    rename.title = "이름 수정";
    rename.setAttribute("aria-label", "이름 수정");
    rename.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<path d="M9.9 3.1l3 3L6 13H3v-3l6.9-6.9ZM11.4 1.6a1.2 1.2 0 0 1 1.7 0l1.3 1.3a1.2 1.2 0 0 1 0 1.7l-.8.8-3-3 .8-.8Z" ' +
      'fill="currentColor"/></svg>';
    rename.addEventListener("click", (e) => {
      e.stopPropagation();
      startRename();
    });

    function startRename() {
      if (li.querySelector(".row-edit")) return;
      const input = document.createElement("input");
      input.className = "row-edit";
      input.value = item.title || item.file_name || item.note || "";
      li.classList.add("editing");
      li.append(input);
      input.focus();
      input.select();

      let closed = false;
      const finish = async (commit) => {
        if (closed) return;
        closed = true;
        const next = input.value.trim();
        input.remove();
        li.classList.remove("editing");
        if (!commit || !next || next === (item.title ?? "")) return;
        const prevText = title.textContent;
        title.textContent = next; // 낙관적 반영
        try {
          await ready();
          await api.renameItem(session, item.id, next);
          item.title = next;
        } catch {
          title.textContent = prevText; // 실패 시 원복
        }
      };

      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") void finish(true);
        if (e.key === "Escape") void finish(false);
      });
      input.addEventListener("blur", () => void finish(true));
      input.addEventListener("click", (e) => e.stopPropagation());
    }

    // 삭제(휴지통) — 행에 마우스를 올리면 나타난다. 확인창 없이 바로 휴지통행.
    const del = document.createElement("button");
    del.type = "button";
    del.className = "row-delete";
    del.title = "삭제";
    del.setAttribute("aria-label", "삭제");
    del.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<path d="M3 4.5h10M6.5 4.5V3.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.3M5 4.5l.5 8a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95l.5-8" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      del.disabled = true;
      try {
        await ready();
        await api.trashItem(session, item.id);
        allItems = allItems.filter((it) => it.id !== item.id);
        // 그룹 카운트가 바뀌므로 목록이면 다시 그리고, 검색 결과면 그 행만 제거
        if (searchInput.value.trim()) li.remove();
        else renderGrouped();
      } catch {
        del.disabled = false;
        del.classList.add("failed");
      }
    });

    // 아이콘 둘을 flex 컨테이너 하나에 담아 행 우측 세로 중앙에 고정한다
    const actions = document.createElement("span");
    actions.className = "row-actions";
    actions.append(rename, del);

    li.append(button, actions);
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

  function boardHeader(title) {
    const li = document.createElement("li");
    li.className = "board-header";

    const icon = document.createElement("span");
    icon.className = "board-icon";
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/>' +
      '<path d="M2 6.2h12" stroke="currentColor" stroke-width="1.2"/></svg>';

    const name = document.createElement("span");
    name.className = "board-name";
    name.textContent = title;

    li.append(icon, name);
    return li;
  }

  function emptyRow(message) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = message;
    return li;
  }

  /** 한 보드 안의 카드를 그룹(프레임)별로 그린다 */
  function renderBoardBody(boardItems, boardFrames) {
    const frameIds = new Set(boardFrames.map((f) => f.id));
    const grouped = new Map(); // frame_id → items
    const loose = [];
    for (const item of boardItems) {
      if (item.frame_id && frameIds.has(item.frame_id)) {
        if (!grouped.has(item.frame_id)) grouped.set(item.frame_id, []);
        grouped.get(item.frame_id).push(item);
      } else {
        loose.push(item);
      }
    }
    for (const frame of boardFrames) {
      const children = grouped.get(frame.id) ?? [];
      listEl.append(
        groupHeader(frame.title || "무제 그룹", frame.color ?? "sky", children.length),
      );
      for (const item of sortByColor(children)) listEl.append(itemRow(item, true));
    }
    for (const item of sortByColor(loose)) listEl.append(itemRow(item, false));
  }

  /** 보드 순서 — 보드 목록 순, 목록에 없는 board_id 는 뒤에 */
  function boardOrderKeys(rows) {
    const order = allBoards.map((b) => b.id);
    const extra = [];
    for (const r of rows) {
      if (r.board_id && !order.includes(r.board_id) && !extra.includes(r.board_id)) {
        extra.push(r.board_id);
      }
    }
    return [...order, ...extra];
  }

  /** 전체 목록 — 보드별로 묶고, 보드 안은 그룹(프레임)별 · 색깔 순서로 */
  function renderGrouped() {
    listEl.textContent = "";

    if (allItems.length === 0 && allFrames.length === 0) {
      listEl.append(emptyRow("보드가 비어 있습니다"));
      return;
    }

    for (const bId of boardOrderKeys([...allItems, ...allFrames])) {
      const boardItems = allItems.filter((it) => it.board_id === bId);
      const boardFrames = allFrames.filter((f) => f.board_id === bId);
      if (boardItems.length === 0 && boardFrames.length === 0) continue;

      listEl.append(boardHeader(boardsById[bId] || "무제 보드"));
      renderBoardBody(boardItems, boardFrames);
    }
  }

  /** 검색 결과 — 보드별로 묶고, 보드 안은 색깔 순서로 */
  function renderSearch(hits) {
    listEl.textContent = "";
    if (hits.length === 0) {
      listEl.append(emptyRow("결과가 없습니다"));
      return;
    }

    for (const bId of boardOrderKeys(hits)) {
      const boardHits = hits.filter((h) => h.board_id === bId);
      if (boardHits.length === 0) continue;
      listEl.append(boardHeader(boardsById[bId] || "무제 보드"));
      for (const item of sortByColor(boardHits)) listEl.append(itemRow(item, false));
    }
  }

  async function openList() {
    showList();
    searchInput.value = "";
    listEl.textContent = "";
    listEl.append(emptyRow("불러오는 중…"));

    try {
      await ready();
      [allItems, allFrames, allBoards] = await Promise.all([
        api.listItems(session),
        api.listFrames(session),
        api.listBoards(session),
      ]);
      boardsById = Object.fromEntries(allBoards.map((b) => [b.id, b.title]));
      renderGrouped();
    } catch {
      listEl.textContent = "";
      listEl.append(emptyRow("목록을 불러오지 못했습니다"));
    }
  }

  async function runSearch(term) {
    try {
      await ready();
      const hits = await api.searchItems(session, term);
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
