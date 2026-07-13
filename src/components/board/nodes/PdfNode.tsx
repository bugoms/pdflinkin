"use client";

/* eslint-disable @next/next/no-img-element */

import { type NodeProps } from "@xyflow/react";

import { useViewer } from "@/store/viewer";

import CardShell from "./CardShell";
import type { ItemNodeType } from "./types";

export default function PdfNode({ data, selected }: NodeProps<ItemNodeType>) {
  const { item, thumbUrl, dimmed } = data;
  const openViewer = useViewer((s) => s.open);

  const progress =
    item.last_read_page && item.page_count
      ? Math.round((item.last_read_page / item.page_count) * 100)
      : 0;

  return (
    <CardShell
      color={item.color}
      selected={Boolean(selected)}
      dimmed={dimmed}
      onOpen={() => openViewer(item.id)}
    >
      <div className="relative min-h-0 flex-1 bg-neutral-950">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-700">
            <span className="text-xs">썸네일 생성 중…</span>
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-md bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
          PDF
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            openViewer(item.id);
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"
        >
          <span className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-900">
            {item.last_read_page && item.last_read_page > 1
              ? `${item.last_read_page}쪽부터 이어 읽기`
              : "열기"}
          </span>
        </button>
      </div>

      <div className="shrink-0 border-t border-white/5 bg-black/20 px-3 py-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-neutral-100">
          {item.title || item.file_name || "PDF"}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-500">
          <span>{item.page_count ? `${item.page_count}쪽` : ""}</span>
          {progress > 0 && (
            <span className="ml-auto text-emerald-500">{progress}% 읽음</span>
          )}
        </div>
      </div>
    </CardShell>
  );
}
