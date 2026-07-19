"use client";

import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  CARD_COLORS,
  COLOR_TOKENS,
  isCustomColor,
  type ColorToken,
} from "@/lib/palette";
import { signPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { flush, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

/* ---------------------------------------------------------------------------
 * 웹 목록 보기 — 웨일 확장의 "목록 보기"를 웹에 그대로 옮긴 것.
 * 모든 보드의 활성 카드를 보드별 → 그룹(프레임)별 · 색깔 순서로 나열하고,
 * 키워드 검색(PDF 본문 포함) · 행 삭제(휴지통) · 클릭 시 그 카드로 이동(딥링크)을 제공한다.
 * (확장 popup.js 의 renderGrouped / renderSearch / openItem / trashItem 과 대응)
 * ------------------------------------------------------------------------- */

type ListItem = {
  id: string;
  kind: string;
  title: string | null;
  file_name: string | null;
  note: string | null;
  color: string | null;
  frame_id: string | null;
  url: string | null;
  storage_path: string | null;
  og_image_url: string | null;
  board_id: string;
};

type ListFrame = {
  id: string;
  title: string | null;
  color: string | null;
  board_id: string;
};

type ListBoard = { id: string; title: string };

const ITEM_COLUMNS =
  "id, kind, title, file_name, note, color, frame_id, url, storage_path, og_image_url, board_id";

/** PostgREST 의 or() 필터를 깨뜨리는 문자를 제거한다 (SearchPalette 와 동일). */
function sanitize(query: string) {
  return query.replace(/[,()*\\"']/g, " ").trim();
}

function colorIndex(color: string | null) {
  const idx = COLOR_TOKENS.indexOf((color ?? "neutral") as ColorToken);
  return idx === -1 ? COLOR_TOKENS.length : idx; // 커스텀 색은 토큰들 뒤에
}

function sortByColor<T extends { color: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => colorIndex(a.color) - colorIndex(b.color));
}

function label(item: ListItem) {
  return item.title || item.file_name || item.note || "제목 없음";
}

export default function ListPanel({ onClose }: { onClose: () => void }) {
  const currentBoardId = useBoard((s) => s.boardId);
  const selectOnly = useSelection((s) => s.selectOnly);
  const { setCenter } = useReactFlow();
  const router = useRouter();

  const [boards, setBoards] = useState<ListBoard[]>([]);
  const [frames, setFrames] = useState<ListFrame[]>([]);
  const [items, setItems] = useState<ListItem[] | null>(null); // null = 로딩 중
  const [failed, setFailed] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ term: string; rows: ListItem[] }>({
    term: "",
    rows: [],
  });

  const term = sanitize(query);

  /* 전체 목록 로드 (모든 보드) */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const [boardsRes, framesRes, itemsRes] = await Promise.all([
        supabase.from("boards").select("id, title").order("created_at"),
        supabase
          .from("frames")
          .select("id, title, color, board_id")
          .order("created_at"),
        supabase
          .from("items")
          .select(ITEM_COLUMNS)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (!alive) return;
      if (itemsRes.error) {
        setFailed(true);
        setItems([]);
        return;
      }
      setBoards((boardsRes.data ?? []) as ListBoard[]);
      setFrames((framesRes.data ?? []) as ListFrame[]);
      setItems((itemsRes.data ?? []) as ListItem[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* 검색 (모든 보드, RLS 가 내 것으로 한정) */
  useEffect(() => {
    if (term.length < 1) return;
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const supabase = createClient();
        const like = `*${term}*`;
        const { data } = await supabase
          .from("items")
          .select(ITEM_COLUMNS)
          .eq("status", "active")
          .or(
            [
              `title.ilike.${like}`,
              `description.ilike.${like}`,
              `note.ilike.${like}`,
              `file_name.ilike.${like}`,
              `url.ilike.${like}`,
              `extracted_text.ilike.${like}`,
            ].join(","),
          )
          .limit(30);
        if (!alive) return;
        setHits({ term, rows: (data ?? []) as ListItem[] });
      })();
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term]);

  const boardsById = useMemo(
    () => Object.fromEntries(boards.map((b) => [b.id, b.title])),
    [boards],
  );

  /** 목록에서 카드를 누르면 그 카드가 있는 보드로 화면을 옮기고 선택한다(딥링크).
   *  바로 열지 않고 위치를 보여준다 — "그 근처에 있었지"가 이 앱의 핵심이다. */
  async function jump(item: ListItem) {
    onClose();
    if (item.board_id === currentBoardId) {
      const storeItem = useBoard.getState().items[item.id];
      if (!storeItem) return;
      selectOnly(storeItem.id);
      const boardFrames = useBoard.getState().frames;
      const frame = storeItem.frame_id
        ? boardFrames[storeItem.frame_id]
        : undefined;
      const x = (frame?.x ?? 0) + storeItem.x + storeItem.w / 2;
      const y = (frame?.y ?? 0) + storeItem.y + storeItem.h / 2;
      void setCenter(x, y, { zoom: 1.1, duration: 500 });
      return;
    }
    // 다른 보드 — 저장 큐를 먼저 비우고(유실 방지) 딥링크로 이동한다.
    await flush();
    router.push(`/board?board=${item.board_id}&item=${item.id}`);
  }

  /** 행 클릭 = 그 문서/링크 자체를 연다 (확장 목록 openItem 과 같은 규칙). */
  async function openItem(item: ListItem) {
    // 1) 링크 카드 — url 로 바로 이동 (http 이미지 링크는 og_image_url 폴백)
    const isHttp = (u: string | null) =>
      typeof u === "string" && /^https?:\/\//.test(u);
    const directUrl = item.url || (isHttp(item.og_image_url) ? item.og_image_url : null);
    if (directUrl) {
      window.open(directUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // 2) 업로드 파일(pdf/image/file) — 서명 URL 로 원본 열기.
    //    서명은 비동기라 팝업 차단을 피하려 탭을 먼저 열고 주소를 채운다.
    if (item.storage_path) {
      const tab = window.open("about:blank", "_blank");
      const url = await signPath(createClient(), item.storage_path);
      if (url) {
        if (tab) tab.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (tab) tab.close();
    }
    // 3) 열 문서가 없으면(메모 등) 그 카드 위치로 이동한다.
    await jump(item);
  }

  /** 행 삭제 = 휴지통(소프트 삭제). */
  async function remove(item: ListItem) {
    setItems((prev) => (prev ?? []).filter((it) => it.id !== item.id));
    setHits((prev) => ({ ...prev, rows: prev.rows.filter((h) => h.id !== item.id) }));

    if (item.board_id === currentBoardId && useBoard.getState().items[item.id]) {
      // 현재 보드 카드 — 캔버스·저장·언두를 함께 타는 정식 경로(소프트 삭제 + 연결선 정리)
      useBoard.getState().apply((d) => {
        const it = d.items[item.id];
        if (it) d.items[item.id] = { ...it, status: "trashed" };
        for (const edge of Object.values(d.edges)) {
          if (
            edge.source_item_id === item.id ||
            edge.target_item_id === item.id
          ) {
            delete d.edges[edge.id];
          }
        }
      });
      return;
    }
    // 다른 보드 카드 — 스토어에 없으므로 REST 로 직접 소프트 삭제한다
    // (확장 목록의 삭제와 같은 관리 경로. 캔버스가 아닌 목록에서의 정리).
    const { error } = await createClient()
      .from("items")
      .update({ status: "trashed" })
      .eq("id", item.id);
    if (error) console.warn("[list] 삭제 실패", error);
  }

  const searching = term.length > 0;
  const searchRows = hits.term === term ? hits.rows : [];
  const totalCount = items?.length ?? 0;

  // async 액션은 void 로 감싸 이벤트 핸들러 타입(=> void)에 맞춘다 (코드베이스 컨벤션).
  const onOpen = (it: ListItem) => void openItem(it);
  const onJump = (it: ListItem) => void jump(it);
  const onRemove = (it: ListItem) => void remove(it);

  const body =
    items === null
      ? null
      : searching
        ? buildSearch(searchRows, boards, boardsById, onOpen, onJump, onRemove)
        : buildGrouped(items, frames, boards, boardsById, onOpen, onJump, onRemove);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-apple-lg border border-hairline bg-canvas"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
            목록
          </h2>
          <span className="text-[13px] text-ink-48">{totalCount}개</span>
          <button
            onClick={onClose}
            className="ml-auto text-[14px] text-action transition"
          >
            닫기
          </button>
        </header>

        <div className="border-b border-divider px-4 py-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                if (query) setQuery("");
                else onClose();
              }
            }}
            placeholder="제목 · 메모 · 파일명 · PDF 본문 검색…"
            className="h-10 w-full rounded-full border border-hairline bg-canvas px-4 text-[14px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {items === null && (
            <p className="px-5 py-10 text-center text-[13px] text-ink-48">
              불러오는 중…
            </p>
          )}
          {failed && (
            <p className="px-5 py-10 text-center text-[13px] text-ink-48">
              목록을 불러오지 못했습니다
            </p>
          )}
          {items !== null && !failed && <ul>{body}</ul>}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 목록 조립 (확장 popup.js 의 renderGrouped / renderSearch 대응)
 * ------------------------------------------------------------------------- */

/** 보드 순서 — 보드 목록 순, 목록에 없는 board_id 는 뒤에 (확장과 동일). */
function boardOrder(rows: { board_id: string }[], boards: ListBoard[]): string[] {
  const order = boards.map((b) => b.id);
  const extra: string[] = [];
  for (const r of rows) {
    if (r.board_id && !order.includes(r.board_id) && !extra.includes(r.board_id)) {
      extra.push(r.board_id);
    }
  }
  return [...order, ...extra];
}

function buildGrouped(
  all: ListItem[],
  allFrames: ListFrame[],
  boards: ListBoard[],
  boardsById: Record<string, string>,
  onOpen: (item: ListItem) => void,
  onJump: (item: ListItem) => void,
  onRemove: (item: ListItem) => void,
) {
  if (all.length === 0 && allFrames.length === 0) {
    return <Empty>보드가 비어 있습니다</Empty>;
  }

  const nodes: React.ReactNode[] = [];
  for (const bId of boardOrder([...all, ...allFrames], boards)) {
    const boardItems = all.filter((it) => it.board_id === bId);
    const boardFrames = allFrames.filter((f) => f.board_id === bId);
    if (boardItems.length === 0 && boardFrames.length === 0) continue;

    nodes.push(
      <BoardHeader key={`b:${bId}`} title={boardsById[bId] || "무제 보드"} />,
    );

    const frameIds = new Set(boardFrames.map((f) => f.id));
    const grouped = new Map<string, ListItem[]>();
    const loose: ListItem[] = [];
    for (const item of boardItems) {
      if (item.frame_id && frameIds.has(item.frame_id)) {
        const arr = grouped.get(item.frame_id);
        if (arr) arr.push(item);
        else grouped.set(item.frame_id, [item]);
      } else {
        loose.push(item);
      }
    }

    for (const frame of boardFrames) {
      const children = grouped.get(frame.id) ?? [];
      nodes.push(
        <GroupHeader
          key={`f:${frame.id}`}
          title={frame.title || "무제 그룹"}
          color={frame.color ?? "sky"}
          count={children.length}
        />,
      );
      for (const item of sortByColor(children)) {
        nodes.push(
          <Row
            key={item.id}
            item={item}
            isChild
            onOpen={onOpen}
            onJump={onJump}
            onRemove={onRemove}
          />,
        );
      }
    }
    for (const item of sortByColor(loose)) {
      nodes.push(
        <Row key={item.id} item={item} onOpen={onOpen} onJump={onJump} onRemove={onRemove} />,
      );
    }
  }
  return nodes;
}

function buildSearch(
  rows: ListItem[],
  boards: ListBoard[],
  boardsById: Record<string, string>,
  onOpen: (item: ListItem) => void,
  onJump: (item: ListItem) => void,
  onRemove: (item: ListItem) => void,
) {
  if (rows.length === 0) return <Empty>결과가 없습니다</Empty>;

  const nodes: React.ReactNode[] = [];
  for (const bId of boardOrder(rows, boards)) {
    const boardHits = rows.filter((h) => h.board_id === bId);
    if (boardHits.length === 0) continue;
    nodes.push(
      <BoardHeader key={`b:${bId}`} title={boardsById[bId] || "무제 보드"} />,
    );
    for (const item of sortByColor(boardHits)) {
      nodes.push(
        <Row key={item.id} item={item} onOpen={onOpen} onJump={onJump} onRemove={onRemove} />,
      );
    }
  }
  return nodes;
}

/* ---------------------------------------------------------------------------
 * 조각 컴포넌트
 * ------------------------------------------------------------------------- */

function Row({
  item,
  isChild,
  onOpen,
  onJump,
  onRemove,
}: {
  item: ListItem;
  isChild?: boolean;
  onOpen: (item: ListItem) => void;
  onJump: (item: ListItem) => void;
  onRemove: (item: ListItem) => void;
}) {
  return (
    <li className="group/row relative">
      {/* 행 클릭 = 그 문서/링크 열기 */}
      <button
        onClick={() => onOpen(item)}
        className={[
          "flex w-full items-center gap-2 py-2 pr-16 text-left transition hover:bg-black/[0.04]",
          isChild ? "pl-6" : "pl-4",
        ].join(" ")}
      >
        {isChild && (
          <span
            aria-hidden
            className="-mt-1.5 h-2.5 w-2.5 shrink-0 rounded-bl-[4px] border-b border-l border-divider"
          />
        )}
        <ColorDot color={item.color} />
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
          {label(item)}
        </span>
      </button>

      {/* 보조 아이콘 — 행 hover 시 등장: 보드에서 보기(딥링크) · 삭제 */}
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover/row:opacity-100">
        <button
          onClick={() => onJump(item)}
          title="보드에서 보기"
          aria-label="보드에서 보기"
          className="flex h-7 w-7 items-center justify-center rounded-apple-sm text-ink-48 transition hover:bg-black/[0.06] hover:text-ink-80"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => onRemove(item)}
          title="삭제"
          aria-label="삭제"
          className="flex h-7 w-7 items-center justify-center rounded-apple-sm text-ink-48 transition hover:bg-[#fbeaec] hover:text-[#d0455a]"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 4.5h10M6.5 4.5V3.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.3M5 4.5l.5 8a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95l.5-8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}

function ColorDot({ color }: { color: string | null }) {
  if (isCustomColor(color)) {
    return (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
    );
  }
  const token: ColorToken =
    color && (COLOR_TOKENS as string[]).includes(color)
      ? (color as ColorToken)
      : "neutral";
  return (
    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CARD_COLORS[token].swatch}`} />
  );
}

function BoardHeader({ title }: { title: string }) {
  return (
    <li className="flex items-center gap-1.5 px-4 pb-1 pt-3.5 first:pt-1.5">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="shrink-0 text-ink-48"
      >
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M2 6.2h12" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-48">
        {title}
      </span>
    </li>
  );
}

function GroupHeader({
  title,
  color,
  count,
}: {
  title: string;
  color: string;
  count: number;
}) {
  return (
    <li className="flex items-center gap-2 px-4 pb-0.5 pt-1.5">
      <ColorDot color={color} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-80">
        {title}
      </span>
      <span className="shrink-0 rounded-full bg-pearl px-1.5 text-[11px] text-ink-48">
        {count}
      </span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-5 py-10 text-center text-[13px] text-ink-48">{children}</li>
  );
}
