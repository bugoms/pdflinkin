/* 팝업 로직 — 붙여넣기 / 드래그앤드롭 / URL 입력 / 현재 탭 담기 */

/* global LS_CONFIG, api */

const $ = (sel) => document.querySelector(sel);

let session = null;
let boardId = null;

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
}

function showMain() {
  $("#login-view").hidden = true;
  $("#main-view").hidden = false;
  $("#account-email").textContent = session.email ?? "";
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

  /* URL 직접 입력 */
  $("#url-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#url-input");
    const urls = api.extractUrls(input.value);
    if (urls.length === 0) return;
    input.value = "";
    await ingestLinks(urls);
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
