"use client";

import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

type Hit = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  file_name: string | null;
  domain: string | null;
  note: string | null;
};

const KIND_LABEL: Record<string, string> = {
  link: "링크",
  pdf: "PDF",
  image: "이미지",
  note: "메모",
  file: "파일",
};

/** PostgREST 의 or() 필터를 깨뜨리는 문자를 제거한다. */
function sanitize(query: string) {
  return query.replace(/[,()*\\"']/g, " ").trim();
}

/**
 * 부모가 열릴 때만 마운트한다 (open prop 없음).
 * 그래야 상태 초기화를 effect 안에서 하지 않아도 된다.
 */
export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const boardId = useBoard((s) => s.boardId);
  const items = useBoard((s) => s.items);
  const selectOnly = useSelection((s) => s.selectOnly);
  const { setCenter } = useReactFlow();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ term: string; hits: Hit[] }>({
    term: "",
    hits: [],
  });
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);

  const term = sanitize(query);
  // 검색어가 바뀌면 이전 결과는 즉시 무효 — state 를 건드리지 않고 파생한다.
  const hits = results.term === term ? results.hits : [];
  const active = Math.min(cursor, Math.max(0, hits.length - 1));

  useEffect(() => {
    if (term.length < 1) return;

    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        const supabase = createClient();
        const like = `*${term}*`;

        const { data, error } = await supabase
          .from("items")
          .select("id, kind, title, description, file_name, domain, note")
          .eq("board_id", boardId)
          .eq("status", "active")
          .or(
            [
              `title.ilike.${like}`,
              `description.ilike.${like}`,
              `note.ilike.${like}`,
              `file_name.ilike.${like}`,
              `url.ilike.${like}`,
              `extracted_text.ilike.${like}`,
            ].join(","),
          )
          .limit(30);

        if (!alive) return;
        if (error) console.warn("[search] 실패", error);
        setResults({ term, hits: (data ?? []) as Hit[] });
        setCursor(0);
        setLoading(false);
      })();
    }, 180);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, boardId]);

  /** 결과를 고르면 캔버스를 그 카드로 데려간다. 바로 열지는 않는다. */
  const jump = useCallback(
    (hit: Hit) => {
      const item = items[hit.id];
      onClose();
      if (!item) return;

      selectOnly(item.id);

      const frames = useBoard.getState().frames;
      const frame = item.frame_id ? frames[item.frame_id] : undefined;
      const x = (frame?.x ?? 0) + item.x + item.w / 2;
      const y = (frame?.y ?? 0) + item.y + item.h / 2;

      void setCenter(x, y, { zoom: 1.1, duration: 500 });
    },
    [items, onClose, selectOnly, setCenter],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor(Math.min(active + 1, hits.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor(Math.max(active - 1, 0));
            }
            if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              jump(hits[active]);
            }
          }}
          placeholder="제목 · 설명 · 메모 · PDF 본문 검색…"
          className="w-full border-b border-neutral-800 bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-neutral-600"
        />

        <div className="max-h-[52vh] overflow-y-auto">
          {loading && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-neutral-600">찾는 중…</p>
          )}

          {!loading && term.length > 0 && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-neutral-600">
              결과가 없습니다
            </p>
          )}

          {hits.map((hit, index) => (
            <button
              key={hit.id}
              onMouseEnter={() => setCursor(index)}
              onClick={() => jump(hit)}
              className={[
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                index === active ? "bg-neutral-800" : "hover:bg-neutral-800/50",
              ].join(" ")}
            >
              <span className="shrink-0 rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {KIND_LABEL[hit.kind] ?? hit.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-neutral-100">
                  {hit.title || hit.file_name || hit.note || "제목 없음"}
                </span>
                <span className="block truncate text-[11px] text-neutral-500">
                  {hit.domain || hit.description || ""}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-600">
          ↑↓ 이동 · Enter 로 해당 카드로 이동 · Esc 닫기
        </div>
      </div>
    </div>
  );
}
