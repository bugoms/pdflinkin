"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useState } from "react";

import type { EdgeRow, FrameRow, ItemRow, TagRow } from "@/lib/types";
import { installFlushOnUnload, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

import Canvas from "./Canvas";
import Inspector from "./Inspector";
import SearchPalette from "./SearchPalette";
import Toolbar from "./Toolbar";
import TrashPanel from "./TrashPanel";
import Viewer from "./Viewer";

export default function BoardClient(props: {
  boardId: string;
  boardTitle: string;
  userId: string;
  userEmail: string;
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

  const isEmpty = props.items.length === 0 && props.frames.length === 0;

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col">
        <Toolbar
          boardTitle={props.boardTitle}
          userEmail={props.userEmail}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenTrash={() => setTrashOpen(true)}
        />

        <div className="relative min-h-0 flex-1">
          <Canvas onOpenSearch={() => setSearchOpen(true)} />
          <TagFilterBar />
          <Inspector />
          {isEmpty && <EmptyHint />}
        </div>
      </div>

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} />}
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
    <div className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[60%] flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const active = activeTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTagFilter(tag.id)}
            className={[
              "pointer-events-auto rounded-full border px-2.5 py-1 text-[11px] transition",
              active
                ? "border-sky-500 bg-sky-500/20 text-sky-200"
                : "border-neutral-800 bg-neutral-900/90 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200",
            ].join(" ")}
          >
            {tag.name}
          </button>
        );
      })}

      {activeTagIds.length > 0 && (
        <button
          onClick={clearTagFilter}
          className="pointer-events-auto rounded-full px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-200"
        >
          필터 해제
        </button>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/80 px-6 py-5 text-center backdrop-blur">
        <p className="text-sm font-medium text-neutral-200">
          빈 캔버스입니다. 여기에 던져 넣으세요.
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-neutral-500">
          <li>
            <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              Ctrl+V
            </kbd>{" "}
            복사한 링크를 마우스 자리에 카드로
          </li>
          <li>PDF · 이미지 파일을 캔버스로 드래그앤드롭</li>
          <li>빈 곳을 더블클릭하면 메모 카드</li>
          <li>
            <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              Ctrl+K
            </kbd>{" "}
            검색 ·{" "}
            <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
              Ctrl+Z
            </kbd>{" "}
            되돌리기
          </li>
        </ul>
      </div>
    </div>
  );
}
