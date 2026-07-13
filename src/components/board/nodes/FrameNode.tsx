"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";

import { frameColor } from "@/lib/palette";
import { useBoard } from "@/store/board";

import { FRAME_MIN_H, FRAME_MIN_W, type FrameNodeType } from "./types";

export default function FrameNode({ data, selected }: NodeProps<FrameNodeType>) {
  const { frame } = data;
  const apply = useBoard((s) => s.apply);
  const beginInteraction = useBoard((s) => s.beginInteraction);
  const endInteraction = useBoard((s) => s.endInteraction);
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
          "card-shell h-full w-full rounded-2xl border-2 border-dashed transition-colors",
          palette.frame,
        ].join(" ")}
      >
        <div className="absolute -top-7 left-1 flex items-center gap-2">
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
              className="nodrag rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-sm outline-none"
            />
          ) : (
            <button
              onDoubleClick={() => setEditing(true)}
              className={`text-sm font-semibold ${palette.title}`}
            >
              {frame.title || "무제"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
