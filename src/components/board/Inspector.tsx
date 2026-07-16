"use client";

import { useRef, useState } from "react";

import { CARD_COLORS, PICKER_TOKENS, isCustomColor } from "@/lib/palette";
import { downloadFileName, downloadStoredFile } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";
import { useViewer } from "@/store/viewer";

const KIND_LABEL: Record<string, string> = {
  link: "링크",
  pdf: "PDF",
  image: "이미지",
  note: "메모",
  file: "파일",
};

export default function Inspector() {
  const nodeIds = useSelection((s) => s.nodeIds);
  const items = useBoard((s) => s.items);
  const frames = useBoard((s) => s.frames);
  const apply = useBoard((s) => s.apply);
  const openViewer = useViewer((s) => s.open);

  const colorTimer = useRef<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const selectedId = nodeIds.size === 1 ? [...nodeIds][0] : null;
  const item = selectedId ? items[selectedId] : undefined;
  const frame = selectedId ? frames[selectedId] : undefined;

  if (!selectedId || (!item && !frame)) return null;

  const currentTitle = item?.title ?? frame?.title ?? "";
  const currentColor = item?.color ?? frame?.color ?? null;

  function saveTitle(raw: string) {
    const next = raw.trim() || null;
    if (next === (currentTitle || null)) return;
    apply((d) => {
      if (item && d.items[item.id]) {
        d.items[item.id] = { ...d.items[item.id], title: next };
      } else if (frame && d.frames[frame.id]) {
        d.frames[frame.id] = { ...d.frames[frame.id], title: next ?? "무제" };
      }
    });
  }

  function setColor(color: string) {
    apply((d) => {
      if (item && d.items[item.id]) {
        d.items[item.id] = { ...d.items[item.id], color };
      } else if (frame && d.frames[frame.id]) {
        d.frames[frame.id] = { ...d.frames[frame.id], color };
      }
    });
  }

  /** 컬러 피커는 드래그하는 동안 input 이벤트가 연발된다 — 멈췄을 때 한 번만 커밋 */
  function setColorDebounced(color: string) {
    if (colorTimer.current !== null) window.clearTimeout(colorTimer.current);
    colorTimer.current = window.setTimeout(() => setColor(color), 250);
  }

  async function download() {
    if (!item?.storage_path || downloading) return;
    setDownloading(true);
    try {
      const ok = await downloadStoredFile(
        createClient(),
        item.storage_path,
        downloadFileName(item.title, item.file_name, item.storage_path),
      );
      if (!ok) window.alert("다운로드 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <aside className="glass-float absolute inset-x-2 bottom-[72px] z-20 rounded-apple-lg p-4 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[76px] sm:w-[264px]">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-48">
        {frame ? "그룹" : (KIND_LABEL[item?.kind ?? ""] ?? "")}
      </p>

      <input
        // 선택이 바뀌거나 외부에서 제목이 갱신되면 새 값으로 다시 마운트된다
        key={`${selectedId}:${currentTitle}`}
        defaultValue={currentTitle}
        onBlur={(e) => saveTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="제목"
        className="mt-2 h-10 w-full rounded-apple-md border border-hairline bg-canvas px-3 text-[15px] text-ink outline-none transition placeholder:text-ink-48 focus:border-action-focus"
      />

      <div className="mt-4">
        <p className="mb-2 text-[12px] text-ink-48">색</p>
        <div className="flex gap-2">
          {PICKER_TOKENS.map((token) => (
            <button
              key={token}
              onClick={() => setColor(token)}
              className={[
                "h-6 w-6 rounded-full transition",
                CARD_COLORS[token].swatch,
                currentColor === token
                  ? "ring-2 ring-action-focus ring-offset-2 ring-offset-canvas"
                  : "opacity-70 hover:opacity-100",
              ].join(" ")}
              aria-label={token}
            />
          ))}

          {/* 여섯 번째 자리 — 아무 색이나 직접 고르는 팔레트 */}
          <label
            title="원하는 색 직접 고르기"
            className={[
              "relative h-6 w-6 cursor-pointer rounded-full transition",
              isCustomColor(currentColor)
                ? "ring-2 ring-action-focus ring-offset-2 ring-offset-canvas"
                : "opacity-70 hover:opacity-100",
            ].join(" ")}
            style={{
              background: isCustomColor(currentColor)
                ? currentColor
                : "conic-gradient(#e0687a, #e5a83c, #4cae72, #5aa9f5, #8c6fe0, #e0687a)",
            }}
          >
            <input
              key={selectedId}
              type="color"
              defaultValue={isCustomColor(currentColor) ? currentColor : "#8c6fe0"}
              onChange={(e) => setColorDebounced(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="직접 색 고르기"
            />
          </label>
        </div>
      </div>

      {item && (
        <>
          {(item.url || item.kind === "pdf" || item.kind === "image") && (
            <div className="mt-4 flex gap-2">
              {item.url && (
                <button
                  onClick={() => window.open(item.url!, "_blank", "noopener,noreferrer")}
                  className="flex-1 rounded-full bg-action px-3 py-2 text-[14px] text-white transition"
                >
                  원본 열기 ↗
                </button>
              )}
              {(item.kind === "pdf" || item.kind === "image") && (
                <button
                  onClick={() => openViewer(item.id)}
                  className="flex-1 rounded-full bg-action px-3 py-2 text-[14px] text-white transition"
                >
                  열기
                </button>
              )}
            </div>
          )}

          {/* 업로드해 둔 원본이 있으면 다시 내려받을 수 있다 */}
          {item.storage_path && (
            <button
              onClick={() => void download()}
              disabled={downloading}
              className="mt-2 w-full rounded-full border border-divider bg-pearl px-3 py-2 text-[14px] text-ink-80 transition hover:bg-parchment disabled:opacity-40"
            >
              {downloading ? "다운로드 중…" : "다운로드 ↓"}
            </button>
          )}
        </>
      )}
    </aside>
  );
}
