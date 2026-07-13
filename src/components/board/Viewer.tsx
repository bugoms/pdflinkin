"use client";

/* eslint-disable @next/next/no-img-element */

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

import { destroyPdf, loadPdfFromUrl, renderPageToCanvas } from "@/lib/pdf";
import { signPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { useBoard } from "@/store/board";
import { useViewer } from "@/store/viewer";

export default function Viewer() {
  const itemId = useViewer((s) => s.itemId);
  const close = useViewer((s) => s.close);
  const item = useBoard((s) => (itemId ? s.items[itemId] : undefined));

  useEffect(() => {
    if (!itemId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemId, close]);

  if (!itemId || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2.5">
        <span className="truncate text-sm font-medium text-neutral-200">
          {item.title || item.file_name || "보기"}
        </span>
        <button
          onClick={close}
          className="ml-auto rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          닫기 (Esc)
        </button>
      </header>

      {item.kind === "pdf" ? (
        <PdfBody key={item.id} itemId={item.id} />
      ) : (
        <ImageBody key={item.id} itemId={item.id} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

type Source = { url: string | null; error: string | null };

function useSignedSource(storagePath: string | null): Source {
  const [result, setResult] = useState<Source>({ url: null, error: null });

  useEffect(() => {
    if (!storagePath) return;
    let alive = true;

    void (async () => {
      const signed = await signPath(createClient(), storagePath);
      if (!alive) return;
      setResult(
        signed
          ? { url: signed, error: null }
          : { url: null, error: "파일을 불러오지 못했습니다" },
      );
    })();

    return () => {
      alive = false;
    };
  }, [storagePath]);

  if (!storagePath) return { url: null, error: "파일이 아직 업로드되지 않았습니다" };
  return result;
}

function ImageBody({ itemId }: { itemId: string }) {
  const item = useBoard((s) => s.items[itemId]);
  const { url, error } = useSignedSource(item?.storage_path ?? null);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <p className="text-sm text-neutral-500">불러오는 중…</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function PdfBody({ itemId }: { itemId: string }) {
  const item = useBoard((s) => s.items[itemId]);
  const apply = useBoard((s) => s.apply);

  const { url, error } = useSignedSource(item?.storage_path ?? null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(item?.page_count ?? 0);
  const [page, setPage] = useState(Math.max(1, item?.last_read_page ?? 1));
  const [width, setWidth] = useState(900);

  const loading = !doc && !error;

  // 문서 로드 (이 컴포넌트는 item 별로 key 되어 있으므로 url 은 사실상 한 번만 바뀐다)
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        loaded = await loadPdfFromUrl(url);
        if (!alive) {
          destroyPdf(loaded);
          return;
        }
        setDoc(loaded);
        setNumPages(loaded.numPages);
      } catch (err) {
        console.error("[viewer] PDF 로드 실패", err);
      }
    })();

    return () => {
      alive = false;
      destroyPdf(loaded);
    };
  }, [url]);

  // 페이지 렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    let cancelled = false;
    void (async () => {
      try {
        await renderPageToCanvas(doc, page, canvas, width);
      } catch (err) {
        if (!cancelled) console.error("[viewer] 렌더 실패", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, width]);

  // 읽던 페이지 기억
  const savePage = useCallback(
    (next: number) => {
      if (!item || item.last_read_page === next) return;
      apply((d) => {
        const target = d.items[item.id];
        if (target) {
          d.items[item.id] = {
            ...target,
            last_read_page: next,
            read_at: new Date().toISOString(),
          };
        }
      });
    },
    [apply, item],
  );

  useEffect(() => {
    const timer = setTimeout(() => savePage(page), 800);
    return () => clearTimeout(timer);
  }, [page, savePage]);

  const go = useCallback(
    (delta: number) =>
      setPage((p) => Math.min(Math.max(1, p + delta), Math.max(1, numPages))),
    [numPages],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto w-fit">
          {loading ? (
            <p className="py-24 text-center text-sm text-neutral-500">PDF 여는 중…</p>
          ) : (
            <canvas ref={canvasRef} className="rounded-lg bg-white shadow-2xl" />
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-neutral-800 bg-neutral-950/80 px-4 py-2.5">
        <button
          onClick={() => go(-1)}
          disabled={page <= 1}
          className="rounded-md px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
        >
          ← 이전
        </button>

        <input
          type="number"
          min={1}
          max={numPages || 1}
          value={page}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) {
              setPage(Math.min(Math.max(1, next), Math.max(1, numPages)));
            }
          }}
          className="w-16 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-center text-sm outline-none"
        />
        <span className="text-sm text-neutral-500">/ {numPages || "?"}</span>

        <button
          onClick={() => go(1)}
          disabled={page >= numPages}
          className="rounded-md px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
        >
          다음 →
        </button>

        <span className="mx-2 h-4 w-px bg-neutral-800" />

        <button
          onClick={() => setWidth((w) => Math.max(400, w - 150))}
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
          title="축소"
        >
          −
        </button>
        <button
          onClick={() => setWidth((w) => Math.min(2000, w + 150))}
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800"
          title="확대"
        >
          +
        </button>
      </footer>
    </>
  );
}
