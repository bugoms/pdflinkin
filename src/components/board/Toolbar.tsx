"use client";

import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴 밖 어디를 눌러도(캔버스의 카드·그룹 포함) 즉시 닫는다.
  // 오버레이 div 방식은 헤더의 backdrop-filter 가 fixed 기준을 가로채 동작하지 않았다.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
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
    <>
    <header className="glass-float absolute inset-x-2 top-2 z-30 flex h-[52px] items-center gap-2 rounded-full pl-5 pr-3 sm:inset-x-4 sm:px-5">
      <span className="shrink-0 select-none whitespace-nowrap text-[19px] font-semibold tracking-[-0.02em] text-ink">
        LinkScape
      </span>
      <span className="hidden whitespace-nowrap text-[14px] text-ink-48 xl:inline">
        {boardTitle}
      </span>

      {/* 검색·입력은 pill — "액션"의 문법. 좁은 화면에선 남는 폭을 전부 쓴다 */}
      <form onSubmit={submitUrl} className="min-w-0 flex-1 sm:ml-2 lg:max-w-80">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="링크 붙여넣고 Enter"
          className="h-9 w-full rounded-full border border-hairline bg-canvas px-4 text-[14px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
        />
      </form>

      {/* 카드 만들기·삭제·언두는 넓은 화면에선 상단 바에, 좁은 화면에선 하단 액션 바에 */}
      <div className="hidden items-center gap-2 lg:flex">
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
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SaveBadge state={saveState} />

        <div className="relative" ref={menuRef}>
          <button
            aria-label="메뉴"
            aria-expanded={menuOpen}
            onClick={() => {
              // 카드/그룹 설정창(인스펙터)이 떠 있으면 선택을 풀어 닫고 메뉴를 연다
              useSelection.getState().clear();
              setMenuOpen((v) => !v);
            }}
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

    {/* 좁은 화면 전용 하단 액션 바 — 엄지가 닿는 곳에 둔다 */}
    <nav className="glass-float absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1.5 lg:hidden">
      <Utility onClick={() => addNote(center())}>메모</Utility>
      <Utility onClick={() => addFrame(center())}>그룹</Utility>
      <Utility onClick={deleteSelected} disabled={!hasSelection}>
        삭제
      </Utility>
      <Utility onClick={undo} disabled={!canUndo}>
        ↶
      </Utility>
      <Utility onClick={redo} disabled={!canRedo}>
        ↷
      </Utility>
    </nav>
    </>
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
      className="shrink-0 whitespace-nowrap rounded-full border border-divider bg-pearl px-3.5 py-1.5 text-[14px] text-ink-80 transition hover:bg-parchment disabled:opacity-30 disabled:hover:bg-pearl"
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
    return (
      <span className="whitespace-nowrap px-1 text-[12px] text-ink-48 sm:px-2">
        저장 중…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span
        className="whitespace-nowrap px-1 text-[12px] text-ink-80 sm:px-2"
        title="잠시 후 자동으로 재시도합니다"
      >
        저장 실패 · 재시도 중
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap px-1 text-[12px] text-ink-48 sm:px-2">
      저장됨
    </span>
  );
}
