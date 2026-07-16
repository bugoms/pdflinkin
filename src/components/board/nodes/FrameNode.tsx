"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";

import { frameColor, isCustomColor } from "@/lib/palette";
import { useBoard } from "@/store/board";

import { FRAME_MIN_H, FRAME_MIN_W, type FrameNodeType } from "./types";

export default function FrameNode({ data, selected }: NodeProps<FrameNodeType>) {
  const { frame } = data;
  const apply = useBoard((s) => s.apply);
  const beginInteraction = useBoard((s) => s.beginInteraction);
  const endInteraction = useBoard((s) => s.endInteraction);
  // 커스텀 hex 색은 인라인 스타일로 — 배경은 같은 색의 5% 알파(#rrggbb0d)
  const customColor = isCustomColor(frame.color) ? frame.color : null;
  const palette = frameColor(frame.color);

  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  function commit(value: string) {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = value.trim() || "무제";
    if (next === (frame.title ?? "")) return;
    apply((d) => {
      const target = d.frames[frame.id];
      if (target) d.frames[frame.id] = { ...target, title: next };
    });
  }

  return (
    <>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={FRAME_MIN_W}
        minHeight={FRAME_MIN_H}
        onResizeStart={beginInteraction}
        onResizeEnd={endInteraction}
      />

      <div
        className={[
          "card-shell h-full w-full rounded-apple-lg border transition-colors",
          customColor ? "" : palette.frame,
        ].join(" ")}
        style={
          customColor
            ? { borderColor: customColor, backgroundColor: `${customColor}0d` }
            : undefined
        }
      >
        <div className="absolute -top-8 left-1 flex items-center gap-2">
          {editing ? (
            <input
              defaultValue={frame.title ?? ""}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  cancelled.current = true;
                  e.currentTarget.blur();
                }
              }}
              className="nodrag rounded-apple-sm border border-hairline bg-canvas px-2 py-1 text-[14px] text-ink outline-none transition focus:border-action-focus"
            />
          ) : (
            <button
              onDoubleClick={() => setEditing(true)}
              className={`text-[14px] font-semibold tracking-[-0.01em] ${customColor ? "" : palette.title}`}
              style={customColor ? { color: customColor } : undefined}
            >
              {frame.title || "무제"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
