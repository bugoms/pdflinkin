"use client";

import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { extractUrls } from "@/lib/url";
import { flush, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

import { useBoardActions } from "./useBoardActions";
import { useIngest } from "./useIngest";

export default function Toolbar({
  boardTitle,
  userEmail,
  onOpenSearch,
  onOpenTrash,
}: {
  boardTitle: string;
  userEmail: string;
  onOpenSearch: () => void;
  onOpenTrash: () => void;
}) {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();
  const { addLinks, addNote, addFrame } = useIngest();

  const saveState = useBoard((s) => s.saveState);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);
  const canUndo = useBoard((s) => s.undoStack.length > 0);
  const canRedo = useBoard((s) => s.redoStack.length > 0);

  const { deleteSelected } = useBoardActions();
  const hasSelection = useSelection(
    (s) => s.nodeIds.size > 0 || s.edgeIds.size > 0,
  );

  const [url, setUrl] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /** 화면 한가운데의 캔버스 좌표 */
  function center() {
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const urls = extractUrls(url);
    if (urls.length === 0) return;
    addLinks(urls, center());
    setUrl("");
  }

  async function signOut() {
    await flush();
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="glass-float absolute inset-x-4 top-2 z-30 flex h-[52px] items-center gap-2 rounded-full px-5">
      <span className="select-none text-[19px] font-semibold tracking-[-0.02em] text-ink">
        LinkScape
      </span>
      <span className="hidden text-[14px] text-ink-48 sm:inline">{boardTitle}</span>

      {/* 검색·입력은 pill — "액션"의 문법 */}
      <form onSubmit={submitUrl} className="ml-3 w-80">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="링크 붙여넣고 Enter"
          className="h-9 w-full rounded-full border border-hairline bg-canvas px-4 text-[14px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
        />
      </form>

      <Divider />

      <Utility onClick={() => addNote(center())}>메모</Utility>
      <Utility onClick={() => addFrame(center())}>그룹</Utility>

      <Divider />

      <Utility onClick={deleteSelected} disabled={!hasSelection} title="Delete">
        삭제
      </Utility>

      <Divider />

      <Utility onClick={undo} disabled={!canUndo} title="Ctrl+Z">
        ↶
      </Utility>
      <Utility onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
        ↷
      </Utility>

      <div className="ml-auto flex items-center gap-2">
        <SaveBadge state={saveState} />

        <div className="relative">
          <button
            aria-label="메뉴"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-pearl text-ink-80 transition hover:bg-parchment"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2 4.5h12M2 8h12M2 11.5h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {menuOpen && (
            <>
              {/* 바깥 클릭으로 닫기 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="glass-float absolute right-0 top-[calc(100%+10px)] z-50 w-60 overflow-hidden rounded-apple-lg py-1.5">
                <MenuItem
                  hint="Ctrl+K"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSearch();
                  }}
                >
                  검색
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenTrash();
                  }}
                >
                  휴지통
                </MenuItem>

                <div className="mx-3 my-1.5 h-px bg-divider" />

                <p className="truncate px-4 pb-1 pt-1.5 text-[12px] text-ink-48">
                  {userEmail}
                </p>
                <MenuItem onClick={() => void signOut()}>로그아웃</MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Pearl 캡슐 — 유틸리티 버튼. 파랑이 아니다(파랑은 진짜 액션 전용). */
function Utility({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-full border border-divider bg-pearl px-3.5 py-1.5 text-[14px] text-ink-80 transition hover:bg-parchment disabled:opacity-30 disabled:hover:bg-pearl"
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  hint,
  onClick,
}: {
  children: React.ReactNode;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-2 text-left text-[14px] text-ink transition hover:bg-black/[0.04]"
    >
      <span>{children}</span>
      {hint && <span className="text-[12px] text-ink-48">{hint}</span>}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-divider" />;
}

function SaveBadge({ state }: { state: "idle" | "saving" | "error" }) {
  if (state === "saving") {
    return <span className="px-2 text-[12px] text-ink-48">저장 중…</span>;
  }
  if (state === "error") {
    return (
      <span
        className="px-2 text-[12px] text-ink-80"
        title="잠시 후 자동으로 재시도합니다"
      >
        저장 실패 · 재시도 중
      </span>
    );
  }
  return <span className="px-2 text-[12px] text-ink-48">저장됨</span>;
}
