"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";

import type { EdgeRow, FrameRow, ItemRow, TagRow } from "@/lib/types";
import { installFlushOnUnload, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

import Canvas from "./Canvas";
import Inspector from "./Inspector";
import ListPanel from "./ListPanel";
import SearchPalette from "./SearchPalette";
import Toolbar from "./Toolbar";
import TrashPanel from "./TrashPanel";
import { useLinkBackfill } from "./useLinkBackfill";
import { usePdfBackfill } from "./usePdfBackfill";
import { useRealtime } from "./useRealtime";
import Viewer from "./Viewer";

export default function BoardClient(props: {
  boardId: string;
  boardTitle: string;
  boards: { id: string; title: string }[];
  userId: string;
  userEmail: string;
  focusItemId: string | null;
  items: ItemRow[];
  frames: FrameRow[];
  edges: EdgeRow[];
  tags: TagRow[];
  itemTags: Record<string, string[]>;
  signedUrls: Record<string, string>;
}) {
  const init = useBoard((s) => s.init);
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    init({
      boardId: props.boardId,
      userId: props.userId,
      items: props.items,
      frames: props.frames,
      edges: props.edges,
      tags: props.tags,
      itemTags: props.itemTags,
      signedUrls: props.signedUrls,
    });
    useSelection.getState().clear();
  }, [init, props]);

  useEffect(() => installFlushOnUnload(), []);

  // 확장 등에서 썸네일 없이 올라온 PDF 를 열람 시점에 보정한다
  usePdfBackfill();

  // 확장으로 담은 링크 카드(호스트명뿐)를 열람 시점에 OG 메타로 채운다
  useLinkBackfill();

  // 확장/다른 기기에서 담은 카드가 새로고침 없이 나타나게 한다
  useRealtime(props.boardId);

  // 스토어 기준으로 실시간 판정 — 첫 카드가 생기는 순간 안내가 사라진다.
  // (init 전에는 boardId 가 비어 있으므로 잘못 떠 있지 않는다)
  const ready = useBoard((s) => s.boardId !== "");
  const storeEmpty = useBoard(
    (s) =>
      Object.keys(s.frames).length === 0 &&
      !Object.values(s.items).some((i) => i.status === "active"),
  );

  return (
    <ReactFlowProvider>
      <div className="relative h-dvh">
        <Canvas
          focusItemId={props.focusItemId}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <Toolbar
          boardId={props.boardId}
          boards={props.boards}
          userId={props.userId}
          userEmail={props.userEmail}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenTrash={() => setTrashOpen(true)}
          onOpenList={() => setListOpen(true)}
        />

        <TagFilterBar />
        <Inspector />
        {ready && storeEmpty && <EmptyHint />}
      </div>

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
      {listOpen && <ListPanel onClose={() => setListOpen(false)} />}
      <Viewer />
    </ReactFlowProvider>
  );
}

/* ------------------------------------------------------------------------- */

function TagFilterBar() {
  const tags = useBoard((s) => s.tags);
  const activeTagIds = useBoard((s) => s.activeTagIds);
  const toggleTagFilter = useBoard((s) => s.toggleTagFilter);
  const clearTagFilter = useBoard((s) => s.clearTagFilter);

  if (tags.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-4 top-[76px] z-20 flex max-w-[60%] flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const active = activeTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTagFilter(tag.id)}
            className={[
              "pointer-events-auto rounded-full border px-3 py-1.5 text-[13px] transition",
              active
                ? "border-action bg-action text-white"
                : "border-hairline bg-canvas text-ink-80 hover:bg-parchment",
            ].join(" ")}
          >
            {tag.name}
          </button>
        );
      })}

      {activeTagIds.length > 0 && (
        <button
          onClick={clearTagFilter}
          className="pointer-events-auto px-2 py-1.5 text-[13px] text-action"
        >
          필터 해제
        </button>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
      <div className="glass-float w-full max-w-[320px] rounded-apple-lg px-6 py-5 text-center">
        <h2 className="text-[19px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
          빈 캔버스입니다
        </h2>
        <p className="mt-1 text-[13px] leading-[1.4] text-ink-48">
          링크와 PDF를 여기에 던져 넣으세요.
        </p>

        <ul className="mx-auto mt-4 space-y-1.5 text-left text-[13px] text-ink-80">
          <Hint keys="Ctrl+V">복사한 링크를 마우스 자리에 카드로</Hint>
          <Hint>PDF · 이미지 드래그앤드롭</Hint>
          <Hint>빈 곳 더블클릭 → 메모 카드</Hint>
          <Hint keys="Ctrl+K">검색 · Ctrl+Z 되돌리기</Hint>
        </ul>
      </div>
    </div>
  );
}

function Hint({ keys, children }: { keys?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2.5">
      {keys ? (
        <kbd className="shrink-0 rounded-full border border-hairline bg-canvas px-2 py-px font-sans text-[11px] text-ink">
          {keys}
        </kbd>
      ) : (
        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ink-48" />
      )}
      <span>{children}</span>
    </li>
  );
}
