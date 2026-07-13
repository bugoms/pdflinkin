"use client";

import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { extractUrls } from "@/lib/url";
import { flush, useBoard } from "@/store/board";

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

  const [url, setUrl] = useState("");

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
    <header className="z-20 flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950/90 px-3 py-2 backdrop-blur">
      <span className="select-none text-sm font-semibold tracking-tight text-neutral-200">
        pdflinkin
      </span>
      <span className="hidden text-xs text-neutral-600 sm:inline">/ {boardTitle}</span>

      <form onSubmit={submitUrl} className="ml-3 w-72">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="링크 붙여넣고 Enter (캔버스에 Ctrl+V 해도 됩니다)"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs outline-none placeholder:text-neutral-600 focus:border-neutral-600"
        />
      </form>

      <div className="mx-1 h-5 w-px bg-neutral-800" />

      <ToolbarButton onClick={() => addNote(center())}>+ 메모</ToolbarButton>
      <ToolbarButton onClick={() => addFrame(center())}>+ 그룹</ToolbarButton>

      <div className="mx-1 h-5 w-px bg-neutral-800" />

      <ToolbarButton onClick={undo} disabled={!canUndo} title="Ctrl+Z">
        ↶
      </ToolbarButton>
      <ToolbarButton onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
        ↷
      </ToolbarButton>

      <div className="ml-auto flex items-center gap-2">
        <SaveBadge state={saveState} />

        <ToolbarButton onClick={onOpenSearch} title="Ctrl+K">
          검색
        </ToolbarButton>
        <ToolbarButton onClick={onOpenTrash}>휴지통</ToolbarButton>

        <div className="mx-1 h-5 w-px bg-neutral-800" />

        <span className="hidden max-w-40 truncate text-xs text-neutral-600 md:inline">
          {userEmail}
        </span>
        <ToolbarButton onClick={signOut}>로그아웃</ToolbarButton>
      </div>
    </header>
  );
}

function ToolbarButton({
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
      className="rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "error" }) {
  if (state === "saving") {
    return <span className="text-xs text-neutral-500">저장 중…</span>;
  }
  if (state === "error") {
    return (
      <span className="text-xs text-red-400" title="잠시 후 자동으로 재시도합니다">
        저장 실패 · 재시도 중
      </span>
    );
  }
  return <span className="text-xs text-neutral-700">저장됨</span>;
}
