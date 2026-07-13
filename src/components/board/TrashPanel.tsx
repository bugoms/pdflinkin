"use client";

import { useEffect, useState } from "react";

import { removePaths } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { ItemRow } from "@/lib/types";
import { useBoard } from "@/store/board";

/** 부모가 열릴 때만 마운트한다. rows 가 null 이면 로딩 중. */
export default function TrashPanel({ onClose }: { onClose: () => void }) {
  const boardId = useBoard((s) => s.boardId);
  const apply = useBoard((s) => s.apply);

  const [rows, setRows] = useState<ItemRow[] | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const { data } = await createClient()
        .from("items")
        .select("*")
        .eq("board_id", boardId)
        .eq("status", "trashed")
        .order("updated_at", { ascending: false });

      if (!alive) return;
      setRows(
        ((data ?? []) as ItemRow[]).map((row) => ({ ...row, extracted_text: null })),
      );
    })();

    return () => {
      alive = false;
    };
  }, [boardId]);

  function restore(row: ItemRow) {
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
    apply((d) => {
      d.items[row.id] = { ...row, status: "active" };
    });
  }

  async function purge(row: ItemRow) {
    if (!confirm(`"${row.title ?? row.file_name ?? "이 카드"}" 를 완전히 지울까요?`)) {
      return;
    }
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));

    const supabase = createClient();
    const paths = [row.storage_path, row.thumb_path].filter(
      (p): p is string => Boolean(p),
    );
    if (paths.length > 0) await removePaths(supabase, paths);
    await supabase.from("items").delete().eq("id", row.id);
  }

  async function emptyAll() {
    const current = rows ?? [];
    if (current.length === 0) return;
    if (!confirm(`휴지통의 ${current.length}개를 완전히 지울까요? 되돌릴 수 없습니다.`)) {
      return;
    }
    setRows([]);

    const supabase = createClient();
    const paths = current
      .flatMap((row) => [row.storage_path, row.thumb_path])
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) await removePaths(supabase, paths);
    await supabase
      .from("items")
      .delete()
      .in(
        "id",
        current.map((row) => row.id),
      );
  }

  const list = rows ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-medium text-neutral-200">휴지통</h2>
          <span className="text-xs text-neutral-600">{list.length}개</span>
          <button
            onClick={() => void emptyAll()}
            disabled={list.length === 0}
            className="ml-auto rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-950/50 disabled:opacity-30"
          >
            전부 비우기
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            닫기
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows === null && (
            <p className="px-4 py-8 text-center text-xs text-neutral-600">
              불러오는 중…
            </p>
          )}
          {rows !== null && list.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-neutral-600">
              휴지통이 비어 있습니다
            </p>
          )}

          {list.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-2.5"
            >
              <span className="shrink-0 rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {row.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-300">
                {row.title || row.file_name || row.note || "제목 없음"}
              </span>
              <button
                onClick={() => restore(row)}
                className="rounded-md px-2 py-1 text-xs text-sky-400 hover:bg-neutral-800"
              >
                복원
              </button>
              <button
                onClick={() => void purge(row)}
                className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-red-950/50 hover:text-red-400"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
