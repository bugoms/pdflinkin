"use client";

/* eslint-disable @next/next/no-img-element */

import { type NodeProps } from "@xyflow/react";
import { useState } from "react";

import CardShell from "./CardShell";
import type { ItemNodeType } from "./types";

export default function LinkNode({ data, selected }: NodeProps<ItemNodeType>) {
  const { item, dimmed } = data;
  const [imageBroken, setImageBroken] = useState(false);
  const [faviconBroken, setFaviconBroken] = useState(false);

  const open = () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const title = item.title || item.url || "링크";
  const showImage = Boolean(item.og_image_url) && !imageBroken;

  return (
    <CardShell
      color={item.color}
      selected={Boolean(selected)}
      dimmed={dimmed}
      onOpen={open}
    >
      {showImage ? (
        <div className="relative min-h-0 flex-1 bg-neutral-950">
          <img
            src={item.og_image_url!}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-950/60 px-4">
          <span className="line-clamp-3 text-center text-xs text-neutral-500">
            {item.description || item.domain || "미리보기 없음"}
          </span>
        </div>
      )}

      <div className="shrink-0 border-t border-white/5 bg-black/20 px-3 py-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-neutral-100">
          {title}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {item.favicon_url && !faviconBroken ? (
            <img
              src={item.favicon_url}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFaviconBroken(true)}
              className="h-3.5 w-3.5 rounded-sm"
            />
          ) : (
            <span className="h-3.5 w-3.5 rounded-sm bg-neutral-700" />
          )}
          <span className="truncate text-[11px] text-neutral-500">
            {item.domain ?? ""}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-500 opacity-0 transition hover:bg-white/10 hover:text-neutral-200 group-hover:opacity-100"
          >
            열기 ↗
          </button>
        </div>
      </div>
    </CardShell>
  );
}
