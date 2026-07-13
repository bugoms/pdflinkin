"use client";

/* eslint-disable @next/next/no-img-element */

import { type NodeProps } from "@xyflow/react";

import { useViewer } from "@/store/viewer";

import CardShell from "./CardShell";
import type { ItemNodeType } from "./types";

export default function ImageNode({ data, selected }: NodeProps<ItemNodeType>) {
  const { item, thumbUrl, dimmed } = data;
  const openViewer = useViewer((s) => s.open);

  return (
    <CardShell
      color={item.color}
      selected={Boolean(selected)}
      dimmed={dimmed}
      onOpen={() => openViewer(item.id)}
    >
      <div className="relative h-full w-full bg-neutral-950">
        {thumbUrl ? (
          <img src={thumbUrl} alt={item.title ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-700">
            불러오는 중…
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 opacity-0 transition group-hover:opacity-100">
          <p className="line-clamp-1 text-[12px] text-neutral-200">
            {item.title || item.file_name}
          </p>
        </div>
      </div>
    </CardShell>
  );
}
