/* Supabase REST 헬퍼 — supabase-js 없이 fetch 만 쓴다 (번들러 불필요).
 * 세션은 chrome.storage.local 에 저장하고, 확장 밖(일반 탭)에서 열리면
 * localStorage 로 폴백한다 (개발/테스트용).
 */

/* global LS_CONFIG */

const SESSION_KEY = "linkscape-session";

/* ------------------------------------------------------------------------- */
/* 저장소 추상화                                                              */
/* ------------------------------------------------------------------------- */

const kv = {
  async get(key) {
    if (globalThis.chrome?.storage?.local) {
      const out = await chrome.storage.local.get(key);
      return out[key] ?? null;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },
  async set(key, value) {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key) {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.remove(key);
      return;
    }
    localStorage.removeItem(key);
  },
};

/* ------------------------------------------------------------------------- */
/* 인증                                                                       */
/* ------------------------------------------------------------------------- */

function saveShape(payload) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    userId: payload.user?.id,
    email: payload.user?.email,
  };
}

async function authRequest(grantType, body) {
  const res = await fetch(
    `${LS_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`,
    {
      method: "POST",
      headers: {
        apikey: LS_CONFIG.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description ?? json.msg ?? "인증에 실패했습니다");
  }
  return json;
}

async function signIn(email, password) {
  const payload = await authRequest("password", { email, password });
  const session = saveShape(payload);
  await kv.set(SESSION_KEY, session);
  return session;
}

async function signOut() {
  await kv.remove(SESSION_KEY);
}

/** 저장된 세션을 돌려준다. 만료가 가까우면 조용히 갱신, 실패하면 null. */
async function getSession() {
  const session = await kv.get(SESSION_KEY);
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session;

  try {
    const payload = await authRequest("refresh_token", {
      refresh_token: session.refreshToken,
    });
    const next = saveShape(payload);
    // refresh 응답에 user 가 없을 수 있으므로 기존 값을 보존한다
    next.userId = next.userId ?? session.userId;
    next.email = next.email ?? session.email;
    await kv.set(SESSION_KEY, next);
    return next;
  } catch {
    await kv.remove(SESSION_KEY);
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* PostgREST / Storage                                                        */
/* ------------------------------------------------------------------------- */

async function rest(session, path, options = {}) {
  const res = await fetch(`${LS_CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: LS_CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`요청 실패 (${res.status}): ${text.slice(0, 200)}`);
  }
  // INSERT 성공은 본문 없는 201 로 온다 — JSON 파싱을 강요하지 않는다
  return text ? JSON.parse(text) : null;
}

/** 첫 보드를 찾고, 없으면 만든다. */
async function ensureBoard(session) {
  const rows = await rest(session, "boards?select=id&order=created_at.asc&limit=1");
  if (rows.length > 0) return rows[0].id;

  const created = await rest(session, "boards", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: session.userId }),
  });
  return created[0].id;
}

/** 새 카드를 놓을 자리 — 가장 최근 카드에서 조금 비껴 놓는다. */
async function nextPosition(session, boardId) {
  const rows = await rest(
    session,
    `items?board_id=eq.${boardId}&frame_id=is.null&status=eq.active&select=x,y&order=created_at.desc&limit=1`,
  );
  if (rows.length === 0) return { x: 0, y: 0 };
  return { x: rows[0].x + 32, y: rows[0].y + 32 };
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 웹사이트 lib/url.ts 의 normalizeUrl / extractUrls 와 같은 규칙 */
function normalizeUrl(raw) {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text)
    ? text
    : /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)
      ? `https://${text}`
      : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrls(text) {
  return text
    .split(/[\s\n]+/)
    .map(normalizeUrl)
    .filter(Boolean);
}

/** 보드 안 키워드 검색 — 웹사이트 SearchPalette 와 같은 대상(제목·설명·메모·
 * 파일명·URL·PDF 본문)을 부분일치로 찾는다. */
async function searchItems(session, rawTerm) {
  // PostgREST 의 or() 필터를 깨뜨리는 문자를 제거한다 (웹과 동일 규칙)
  const term = rawTerm.replace(/[,()*\\"']/g, " ").trim();
  if (!term) return [];

  const like = `*${term}*`;
  const orExpr = [
    "title",
    "description",
    "note",
    "file_name",
    "url",
    "extracted_text",
  ]
    .map((field) => `${field}.ilike.${like}`)
    .join(",");

  // 모든 보드에서 검색 (RLS 가 내 것으로 한정). board_id 로 어느 보드인지 표시
  return rest(
    session,
    `items?select=id,kind,title,file_name,note,domain,color,url,storage_path,og_image_url,board_id` +
      `&status=eq.active` +
      `&or=${encodeURIComponent(`(${orExpr})`)}&limit=20`,
  );
}

/** 내 모든 보드 (목록 보기의 보드 구분용) */
async function listBoards(session) {
  return rest(session, `boards?select=id,title&order=created_at.asc`);
}

/** 내 모든 보드의 활성 카드 (목록 보기용). board_id 포함 */
async function listItems(session) {
  return rest(
    session,
    `items?select=id,kind,title,file_name,note,color,frame_id,url,storage_path,og_image_url,board_id` +
      `&status=eq.active&order=created_at.desc&limit=500`,
  );
}

/** 업로드해 둔 파일(pdf/image/file)의 서명 URL. 실패하면 null.
 *  비공개 버킷이므로 원본을 열려면 매번 서명해야 한다. */
async function signStorageUrl(session, path, expiresIn = 3600) {
  const res = await fetch(
    `${LS_CONFIG.SUPABASE_URL}/storage/v1/object/sign/files/${path}`,
    {
      method: "POST",
      headers: {
        apikey: LS_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    },
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  // REST 는 "/object/sign/files/...?token=..." 상대 경로를 준다 (supabase-js 의 signedUrl 과 필드명이 다름)
  const rel = json?.signedURL ?? json?.signedUrl;
  return rel ? `${LS_CONFIG.SUPABASE_URL}/storage/v1${rel}` : null;
}

/** 내 모든 보드의 그룹(프레임) 전체. board_id 포함 */
async function listFrames(session) {
  return rest(
    session,
    `frames?select=id,title,color,board_id&order=created_at.asc`,
  );
}

/** 카드를 휴지통으로 (웹과 동일한 소프트 삭제 — status='trashed'). 스토리지 파일은 보존. */
async function trashItem(session, id) {
  await rest(session, `items?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "trashed" }),
  });
}

/** 카드 이름(제목) 변경 — 목록 보기의 연필 아이콘이 쓴다 */
async function renameItem(session, id, title) {
  await rest(session, `items?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ title }),
  });
}

async function addLinkItem(session, boardId, url, pos, title) {
  await rest(session, "items", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      user_id: session.userId,
      kind: "link",
      x: pos.x,
      y: pos.y,
      w: 260,
      h: 220,
      title: title || hostname(url),
      url,
      domain: hostname(url),
      favicon_url: `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname(url))}`,
    }),
  });
}

/** 웹의 이미지를 "미리보기가 그 이미지인 링크 카드"로 담는다.
 * 파일 자체를 내려받으려면 모든 사이트 접근 권한이 필요해서 v1 은 핫링크로 간다.
 */
async function addImageLinkItem(session, boardId, srcUrl, title, pos) {
  // data: URL 은 DB 에 그대로 들어가므로 지나치게 크면 거른다
  if (srcUrl.startsWith("data:") && srcUrl.length > 200_000) {
    throw new Error("이미지 데이터가 너무 큽니다");
  }
  const isHttp = /^https?:\/\//.test(srcUrl);
  await rest(session, "items", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      user_id: session.userId,
      kind: "link",
      x: pos.x,
      y: pos.y,
      w: 260,
      h: 240,
      title: title || "이미지",
      url: isHttp ? srcUrl : null,
      domain: isHttp ? hostname(srcUrl) : null,
      og_image_url: srcUrl,
      favicon_url: isHttp
        ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname(srcUrl))}`
        : null,
    }),
  });
}

async function addNoteItem(session, boardId, text, pos) {
  await rest(session, "items", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId,
      user_id: session.userId,
      kind: "note",
      x: pos.x,
      y: pos.y,
      w: 240,
      h: 180,
      color: "amber",
      note: text,
    }),
  });
}

async function uploadToStorage(session, path, blob, contentType) {
  const res = await fetch(
    `${LS_CONFIG.SUPABASE_URL}/storage/v1/object/files/${path}`,
    {
      method: "POST",
      headers: {
        apikey: LS_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: blob,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`업로드 실패 (${res.status}): ${text.slice(0, 200)}`);
  }
}

/** 이미지를 작은 JPEG 썸네일로 (긴 변 640px).
 * OffscreenCanvas 를 써서 팝업과 서비스 워커 양쪽에서 동작한다.
 */
async function makeImageThumb(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
}

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 버킷 제한과 동일

/** 파일 하나를 업로드하고 카드로 만든다.
 * PDF·이미지는 웹사이트가 보드를 열 때 썸네일/본문을 채우고,
 * 그 밖(워드·한글·압축 등)은 미리보기 없는 "일반 파일 카드"로 담긴다.
 */
async function addFileItem(session, boardId, file, pos) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("50MB를 넘는 파일은 담을 수 없습니다");
  }
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  const kind = isPdf ? "pdf" : isImage ? "image" : "file";

  const id = crypto.randomUUID();
  const ext = isPdf ? "pdf" : (file.name.split(".").pop() ?? "bin");
  const filePath = `${session.userId}/${id}.${ext}`;

  await uploadToStorage(
    session,
    filePath,
    file,
    file.type || "application/octet-stream",
  );

  let thumbPath = null;
  if (isImage) {
    try {
      const thumb = await makeImageThumb(file);
      thumbPath = `${session.userId}/${id}-thumb.jpg`;
      await uploadToStorage(session, thumbPath, thumb, "image/jpeg");
    } catch {
      thumbPath = null; // 썸네일은 없어도 카드는 유효하다
    }
  }

  await rest(session, "items", {
    method: "POST",
    body: JSON.stringify({
      id,
      board_id: boardId,
      user_id: session.userId,
      kind,
      x: pos.x,
      y: pos.y,
      w: isImage ? 260 : 240,
      h: isPdf ? 280 : 200,
      title: file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: filePath,
      thumb_path: thumbPath,
    }),
  });
}

/* popup.js / background.js / dropzone.js 가 쓰는 공개 API */
const api = {
  signIn,
  signOut,
  getSession,
  ensureBoard,
  nextPosition,
  extractUrls,
  normalizeUrl,
  hostname,
  searchItems,
  listBoards,
  listItems,
  listFrames,
  trashItem,
  renameItem,
  signStorageUrl,
  addLinkItem,
  addImageLinkItem,
  addNoteItem,
  addFileItem,
};
