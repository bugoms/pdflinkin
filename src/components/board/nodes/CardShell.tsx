"use client";

import { Handle, NodeResizer, Position } from "@xyflow/react";

import { cardColor } from "@/lib/palette";
import { useBoard } from "@/store/board";

import { ITEM_MIN_H, ITEM_MIN_W } from "./types";

export default function CardShell({
  color,
  selected,
  dimmed,
  children,
  onOpen,
}: {
  color: string | null;
  selected: boolean;
  dimmed: boolean;
  children: React.ReactNode;
  onOpen?: () => void;
}) {
  const beginInteraction = useBoard((s) => s.beginInteraction);
  const endInteraction = useBoard((s) => s.endInteraction);
  const palette = cardColor(color);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={ITEM_MIN_W}
        minHeight={ITEM_MIN_H}
        onResizeStart={beginInteraction}
        onResizeEnd={endInteraction}
      />

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {/* 그림자 없음. 면은 헤어라인으로만 만든다. (DESIGN-apple.md) */}
      <div
        onDoubleClick={onOpen}
        className={[
          "card-shell group flex h-full w-full flex-col overflow-hidden rounded-apple-lg transition-opacity",
          palette.card,
          dimmed ? "opacity-25" : "opacity-100",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  );
}
