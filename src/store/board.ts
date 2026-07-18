"use client";

import { create } from "zustand";

import { createClient } from "@/lib/supabase/client";
import type { EdgeRow, FrameRow, ItemRow, TagRow } from "@/lib/types";

/* ---------------------------------------------------------------------------
 * 언두/리두는 스냅샷 방식이다.
 * 모든 변경은 "이전 스냅샷 → 새 스냅샷"이고, 그 둘의 차이(diff)를 그대로
 * DB 저장 큐에 밀어 넣는다. 이렇게 하면 생성/수정/삭제/언두/리두가
 * 전부 같은 경로를 타므로 저장 로직이 한 곳에만 존재한다.
 * ------------------------------------------------------------------------- */

export type Snapshot = {
  items: Record<string, ItemRow>;
  frames: Record<string, FrameRow>;
  edges: Record<string, EdgeRow>;
};

type Table = keyof Snapshot;
type Row = ItemRow | FrameRow | EdgeRow;

type Op =
  | { kind: "upsert"; table: Table; row: Row }
  | { kind: "delete"; table: Table; id: string };

export type SaveState = "idle" | "saving" | "error";

const HISTORY_LIMIT = 100;
const FLUSH_DELAY = 500;

/* ---------------------------------------------------------------------------
 * 저장 큐
 * ------------------------------------------------------------------------- */

const queue = new Map<string, Op>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function enqueue(op: Op) {
  const id = op.kind === "upsert" ? op.row.id : op.id;
  queue.set(`${op.table}:${id}`, op);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), FLUSH_DELAY);
}

export async function flush(): Promise<void> {
  if (flushing || queue.size === 0) return;
  flushing = true;

  const ops = [...queue.values()];
  queue.clear();
  useBoard.setState({ saveState: "saving" });

  try {
    const supabase = createClient();

    const upserts: Record<Table, Row[]> = { items: [], frames: [], edges: [] };
    const deletes: Record<Table, string[]> = { items: [], frames: [], edges: [] };

    for (const op of ops) {
      if (op.kind === "upsert") upserts[op.table].push(op.row);
      else deletes[op.table].push(op.id);
    }

    // 삭제를 먼저 하면 방금 만든 걸 지워버릴 수 있으므로 upsert 를 먼저 한다.
    for (const table of ["frames", "items", "edges"] as const) {
      const rows = upserts[table];
      if (rows.length === 0) continue;
      // extracted_text 는 브라우저로 내려보내지 않는다(초기 로딩이 무거워짐).
      // 따라서 여기서 되돌려 쓰면 DB의 본문을 null 로 날려버린다 — 항상 제외한다.
      const payload =
        table === "items"
          ? rows.map((row) => {
              const clone = { ...row } as Partial<ItemRow>;
              delete clone.extracted_text;
              return clone;
            })
          : rows;

      // @ts-expect-error 테이블별 Row 타입이 런타임에는 이미 정확하다
      const { error } = await supabase.from(table).upsert(payload);
      if (error) throw error;
    }

    // 삭제는 자식(edges/items) → 부모(frames) 순서로.
    for (const table of ["edges", "items", "frames"] as const) {
      const ids = deletes[table];
      if (ids.length === 0) continue;
      const { error } = await supabase.from(table).delete().in("id", ids);
      if (error) throw error;
    }

    useBoard.setState({ saveState: queue.size > 0 ? "saving" : "idle" });
  } catch (err) {
    console.error("[flush] 저장 실패", err);
    // 실패한 작업은 다시 큐에 넣어 다음 기회에 재시도한다.
    for (const op of ops) {
      const id = op.kind === "upsert" ? op.row.id : op.id;
      if (!queue.has(`${op.table}:${id}`)) queue.set(`${op.table}:${id}`, op);
    }
    useBoard.setState({ saveState: "error" });
  } finally {
    flushing = false;
    if (queue.size > 0) scheduleFlush();
  }
}

/** 두 스냅샷의 차이를 저장 큐에 넣는다. */
function enqueueDiff(prev: Snapshot, next: Snapshot) {
  for (const table of ["items", "frames", "edges"] as const) {
    const before = prev[table] as Record<string, Row>;
    const after = next[table] as Record<string, Row>;

    for (const id of Object.keys(after)) {
      if (before[id] !== after[id]) {
        enqueue({ kind: "upsert", table, row: after[id] });
      }
    }
    for (const id of Object.keys(before)) {
      if (!(id in after)) {
        enqueue({ kind: "delete", table, id });
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * 스토어
 * ------------------------------------------------------------------------- */

type BoardState = Snapshot & {
  boardId: string;
  userId: string;

  tags: TagRow[];
  itemTags: Record<string, string[]>;
  activeTagIds: string[];

  /** storage 경로 → 서명 URL */
  signedUrls: Record<string, string>;

  saveState: SaveState;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  /** 드래그/리사이즈 시작 시점의 스냅샷 */
  interaction: Snapshot | null;

  init(payload: {
    boardId: string;
    userId: string;
    items: ItemRow[];
    frames: FrameRow[];
    edges: EdgeRow[];
    tags: TagRow[];
    itemTags: Record<string, string[]>;
    signedUrls: Record<string, string>;
  }): void;

  /** 히스토리에 남기고 저장하는 변경 */
  apply(recipe: (draft: Snapshot) => void): void;
  /** 히스토리에도 저장 큐에도 넣지 않는 변경 (드래그 중 위치 등) */
  applyLive(recipe: (draft: Snapshot) => void): void;
  /** 원격(realtime) 수신을 표시에만 반영 — 저장 큐·언두를 절대 타지 않는다 */
  applyRemote(recipe: (draft: Snapshot) => void): void;

  beginInteraction(): void;
  endInteraction(): void;

  undo(): void;
  redo(): void;

  setSignedUrl(path: string, url: string): void;
  toggleTagFilter(tagId: string): void;
  clearTagFilter(): void;
  setTags(tags: TagRow[]): void;
  setItemTags(itemId: string, tagIds: string[]): void;
};

function snapshot(s: Snapshot): Snapshot {
  return { items: { ...s.items }, frames: { ...s.frames }, edges: { ...s.edges } };
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const row of rows) map[row.id] = row;
  return map;
}

export const useBoard = create<BoardState>((set, get) => ({
  boardId: "",
  userId: "",
  items: {},
  frames: {},
  edges: {},
  tags: [],
  itemTags: {},
  activeTagIds: [],
  signedUrls: {},
  saveState: "idle",
  undoStack: [],
  redoStack: [],
  interaction: null,

  init: (payload) =>
    set({
      boardId: payload.boardId,
      userId: payload.userId,
      items: byId(payload.items),
      frames: byId(payload.frames),
      edges: byId(payload.edges),
      tags: payload.tags,
      itemTags: payload.itemTags,
      signedUrls: payload.signedUrls,
      undoStack: [],
      redoStack: [],
      interaction: null,
    }),

  apply: (recipe) => {
    const state = get();
    const prev = snapshot(state);
    const draft = snapshot(state);
    recipe(draft);

    set({
      ...draft,
      undoStack: [...state.undoStack, prev].slice(-HISTORY_LIMIT),
      redoStack: [],
    });
    enqueueDiff(prev, draft);
  },

  applyLive: (recipe) => {
    const draft = snapshot(get());
    recipe(draft);
    set(draft);
  },

  // applyLive 와 동작은 같지만 "원격 수신 표시용"임을 이름으로 분리한다.
  // 저장 큐(enqueueDiff)·언두 스택을 건드리지 않으므로 에코 루프가 없다.
  applyRemote: (recipe) => {
    const draft = snapshot(get());
    recipe(draft);
    set(draft);
  },

  beginInteraction: () => {
    if (get().interaction) return;
    set({ interaction: snapshot(get()) });
  },

  endInteraction: () => {
    const state = get();
    const before = state.interaction;
    if (!before) return;

    const after = snapshot(state);
    set({
      interaction: null,
      undoStack: [...state.undoStack, before].slice(-HISTORY_LIMIT),
      redoStack: [],
    });
    enqueueDiff(before, after);
  },

  undo: () => {
    const state = get();
    const prev = state.undoStack.at(-1);
    if (!prev) return;

    const current = snapshot(state);
    set({
      ...prev,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current].slice(-HISTORY_LIMIT),
    });
    enqueueDiff(current, prev);
  },

  redo: () => {
    const state = get();
    const next = state.redoStack.at(-1);
    if (!next) return;

    const current = snapshot(state);
    set({
      ...next,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, current].slice(-HISTORY_LIMIT),
    });
    enqueueDiff(current, next);
  },

  setSignedUrl: (path, url) =>
    set((s) => ({ signedUrls: { ...s.signedUrls, [path]: url } })),

  toggleTagFilter: (tagId) =>
    set((s) => ({
      activeTagIds: s.activeTagIds.includes(tagId)
        ? s.activeTagIds.filter((t) => t !== tagId)
        : [...s.activeTagIds, tagId],
    })),

  clearTagFilter: () => set({ activeTagIds: [] }),

  setTags: (tags) => set({ tags }),

  setItemTags: (itemId, tagIds) =>
    set((s) => ({ itemTags: { ...s.itemTags, [itemId]: tagIds } })),
}));

/* ---------------------------------------------------------------------------
 * 편의 함수
 * ------------------------------------------------------------------------- */

/** 화면에 그릴 아이템 (휴지통 제외) */
export function activeItems(state: BoardState): ItemRow[] {
  return Object.values(state.items).filter((i) => i.status === "active");
}

/** 새 아이템의 기본값 */
export function makeItem(
  base: Pick<ItemRow, "board_id" | "user_id" | "kind"> & Partial<ItemRow>,
): ItemRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    frame_id: null,
    x: 0,
    y: 0,
    w: 260,
    h: 200,
    z: 0,
    status: "active",
    title: null,
    note: null,
    color: null,
    pinned: false,
    url: null,
    domain: null,
    description: null,
    favicon_url: null,
    og_image_url: null,
    storage_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    page_count: null,
    thumb_path: null,
    extracted_text: null,
    last_read_page: null,
    read_at: null,
    created_at: now,
    updated_at: now,
    ...base,
  };
}

export function makeFrame(
  base: Pick<FrameRow, "board_id" | "user_id"> & Partial<FrameRow>,
): FrameRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "새 그룹",
    color: "sky",
    x: 0,
    y: 0,
    w: 640,
    h: 440,
    created_at: now,
    updated_at: now,
    ...base,
  };
}

/** 페이지를 떠나기 전에 남은 저장을 밀어낸다. */
export function installFlushOnUnload() {
  const handler = () => {
    if (queue.size > 0) void flush();
  };
  window.addEventListener("beforeunload", handler);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handler();
  });
  return () => window.removeEventListener("beforeunload", handler);
}

export function hasPendingWrites() {
  return queue.size > 0;
}

/** 이 행이 아직 저장 큐에 대기 중인가 — realtime 에코(내가 방금 쓴 것) 무시에 쓴다 */
export function hasPending(table: Table, id: string) {
  return queue.has(`${table}:${id}`);
}
