"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { removePaths } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { flush } from "@/store/board";

type Board = { id: string; title: string };

export default function BoardSwitcher({
  boardId,
  boards: propBoards,
  userId,
  open,
  onToggle,
  onClose,
  rootRef,
}: {
  boardId: string;
  boards: Board[];
  userId: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>(propBoards);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 렌더 중 상태 조정 (effect 대신 — React 권장 패턴)
  // 네비게이션(전환·생성·삭제) 후 서버가 새 목록을 내려주면 그걸 진실로 삼는다
  const [prevProps, setPrevProps] = useState(propBoards);
  if (prevProps !== propBoards) {
    setPrevProps(propBoards);
    setBoards(propBoards);
  }
  // 드롭다운이 닫히면 편집 중이던 상태를 정리
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setEditingId(null);
  }

  const current = boards.find((b) => b.id === boardId);

  /** 보드 전환 — 저장 큐를 먼저 비우고(유실 방지) 이동한다. */
  async function goTo(id: string) {
    onClose();
    if (id === boardId) return;
    await flush();
    router.push(`/board?board=${id}`);
  }

  async function createBoard() {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await createClient()
        .from("boards")
        .insert({ user_id: userId, title: "새 보드" })
        .select("id, title")
        .single();
      if (error || !data) throw error ?? new Error("no data");
      onClose();
      await flush();
      router.push(`/board?board=${data.id}`);
    } catch {
      window.alert("보드를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(id: string, raw: string) {
    const next = raw.trim();
    setEditingId(null);
    const prev = boards.find((b) => b.id === id)?.title ?? "";
    if (!next || next === prev) return;
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, title: next } : b)));
    const { error } = await createClient()
      .from("boards")
      .update({ title: next })
      .eq("id", id);
    if (error) {
      setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, title: prev } : b)));
      window.alert("이름을 바꾸지 못했습니다.");
    }
  }

  async function deleteBoard(id: string) {
    if (boards.length <= 1 || busy) return;
    const target = boards.find((b) => b.id === id);
    if (
      !window.confirm(
        `"${target?.title ?? "보드"}" 보드와 그 안의 모든 카드가 삭제됩니다. 계속할까요?`,
      )
    )
      return;
    setBusy(true);
    try {
      await flush();
      const supabase = createClient();

      // DB 행(카드·프레임·엣지)은 FK cascade 로 지워지지만 스토리지 파일은
      // 자동으로 지워지지 않는다 — 보드 삭제 전에 고아가 될 파일을 먼저 정리한다.
      const { data: files } = await supabase
        .from("items")
        .select("storage_path, thumb_path")
        .eq("board_id", id);
      const paths = (files ?? [])
        .flatMap((r) => [r.storage_path, r.thumb_path])
        .filter((p): p is string => Boolean(p));
      if (paths.length > 0) await removePaths(supabase, paths);

      const { error } = await supabase.from("boards").delete().eq("id", id);
      if (error) throw error;
      const remaining = boards.filter((b) => b.id !== id);
      setBoards(remaining);
      onClose();
      if (id === boardId) router.push(`/board?board=${remaining[0].id}`);
    } catch {
      window.alert("보드를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={onToggle}
        aria-expanded={open}
        title="보드 전환"
        className="flex max-w-[120px] items-center gap-1 rounded-full border border-divider bg-pearl px-3 py-1.5 text-[13px] text-ink-80 transition hover:bg-parchment sm:max-w-[200px]"
      >
        <span className="truncate">{current?.title ?? "보드"}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="glass-float absolute left-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-apple-lg py-1.5">
          <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-48">
            보드
          </p>

          <ul className="max-h-[50vh] overflow-y-auto">
            {boards.map((b) => (
              <li key={b.id} className="group/board relative">
                {editingId === b.id ? (
                  <input
                    autoFocus
                    defaultValue={b.title}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => void commitRename(b.id, e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="mx-2 my-0.5 h-8 w-[calc(100%-16px)] rounded-apple-sm border border-hairline bg-canvas px-2 text-[14px] text-ink outline-none transition focus:border-action-focus"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => void goTo(b.id)}
                      className="flex w-full items-center gap-2 py-2 pl-4 pr-16 text-left text-[14px] transition hover:bg-black/[0.04]"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          b.id === boardId ? "bg-action" : "bg-transparent"
                        }`}
                      />
                      <span className="truncate text-ink">{b.title}</span>
                    </button>

                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover/board:opacity-100">
                      <IconBtn label="이름 바꾸기" onClick={() => setEditingId(b.id)}>
                        <path
                          d="M9.5 3.5 12.5 6.5M3 13l1-3 6.5-6.5a1.4 1.4 0 0 1 2 2L6 12l-3 1Z"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </IconBtn>
                      {boards.length > 1 && (
                        <IconBtn
                          label="삭제"
                          danger
                          onClick={() => void deleteBoard(b.id)}
                        >
                          <path
                            d="M3 4.5h10M6.5 4.5V3.2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.3M5 4.5l.5 8a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95l.5-8"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </IconBtn>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="mx-3 my-1 h-px bg-divider" />
          <button
            onClick={() => void createBoard()}
            disabled={busy}
            className="w-full px-4 py-2 text-left text-[14px] text-action transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            + 새 보드
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "flex h-7 w-7 items-center justify-center rounded-apple-sm text-ink-48 transition",
        danger ? "hover:bg-[#fbeaec] hover:text-[#d0455a]" : "hover:bg-black/[0.06] hover:text-ink-80",
      ].join(" ")}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
