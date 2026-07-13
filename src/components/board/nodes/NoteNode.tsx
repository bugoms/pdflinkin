"use client";

import { type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";

import { useBoard } from "@/store/board";

import CardShell from "./CardShell";
import type { ItemNodeType } from "./types";

export default function NoteNode({ data, selected }: NodeProps<ItemNodeType>) {
  const { item, dimmed } = data;
  const apply = useBoard((s) => s.apply);

  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  function commit(value: string) {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (value === (item.note ?? "")) return;
    apply((d) => {
      const target = d.items[item.id];
      if (target) d.items[item.id] = { ...target, note: value };
    });
  }

  return (
    <CardShell
      color={item.color ?? "amber"}
      selected={Boolean(selected)}
      dimmed={dimmed}
      onOpen={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          // 마운트될 때의 값으로 초기화한다 (effect 로 동기화하지 않기 위함)
          defaultValue={item.note ?? ""}
          autoFocus
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
          className="nodrag h-full w-full resize-none bg-transparent p-3 text-[13px] leading-relaxed text-neutral-100 outline-none"
          placeholder="메모를 적으세요… (Ctrl+Enter 저장, Esc 취소)"
        />
      ) : (
        <div className="h-full w-full overflow-hidden whitespace-pre-wrap p-3 text-[13px] leading-relaxed text-neutral-100">
          {item.note || (
            <span className="text-neutral-500">더블클릭해서 메모 작성</span>
          )}
        </div>
      )}
    </CardShell>
  );
}
