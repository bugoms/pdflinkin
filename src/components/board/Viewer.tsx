"use client";

/* eslint-disable @next/next/no-img-element */

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

import { destroyPdf, loadPdfFromUrl, renderPageToCanvas } from "@/lib/pdf";
import { downloadFileName, downloadStoredFile, signPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { useBoard } from "@/store/board";
import { useViewer } from "@/store/viewer";

export default function Viewer() {
  const itemId = useViewer((s) => s.itemId);
  const close = useViewer((s) => s.close);
  const item = useBoard((s) => (itemId ? s.items[itemId] : undefined));
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!item?.storage_path || downloading) return;
    setDownloading(true);
    try {
      const ok = await downloadStoredFile(
        createClient(),
        item.storage_path,
        downloadFileName(item.title, item.file_name, item.storage_path),
      );
      if (!ok) window.alert("다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDownloading(false);
    }
  }

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
    <div className="fixed inset-0 z-50 flex flex-col bg-parchment">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-hairline bg-canvas/80 px-5 backdrop-blur-xl backdrop-saturate-150">
        <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">
          {item.title || item.file_name || "보기"}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-5">
          {item.storage_path && (
            <button
              onClick={() => void download()}
              disabled={downloading}
              className="text-[14px] text-action transition disabled:opacity-40"
            >
              {downloading ? "다운로드 중…" : "다운로드 ↓"}
            </button>
          )}
          <button onClick={close} className="text-[14px] text-action transition">
            닫기 (Esc)
          </button>
        </div>
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
    <div className="flex min-h-0 flex-1 items-center justify-center p-10">
      {error ? (
        <p className="text-[15px] text-ink-48">{error}</p>
      ) : url ? (
        // 표면 위에 놓인 실물 — 이 시스템의 유일한 그림자를 쓸 자리
        <img
          src={url}
          alt=""
          className="product-shadow max-h-full max-w-full rounded-apple-sm object-contain"
        />
      ) : (
        <p className="text-[15px] text-ink-48">불러오는 중…</p>
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
  // 항상 1쪽부터 열고, 읽던 기록이 있으면 이어 읽을지 물어본다.
  const resumePage = Math.max(1, item?.last_read_page ?? 1);
  const [page, setPage] = useState(1);
  const [askResume, setAskResume] = useState(resumePage > 1);
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
    // 확인창에 답하기 전에 1쪽으로 덮어써서 읽던 위치를 날리면 안 된다
    if (askResume) return;
    const timer = setTimeout(() => savePage(page), 800);
    return () => clearTimeout(timer);
  }, [page, savePage, askResume]);

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
        <p className="text-[15px] text-ink-48">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-auto p-10">
          <div className="mx-auto w-fit">
            {loading ? (
              <p className="py-24 text-center text-[15px] text-ink-48">
                PDF 여는 중…
              </p>
            ) : (
              // 지면은 "표면 위에 놓인 실물"이다 — 시스템의 유일한 그림자를 여기에 쓴다
              <canvas
                ref={canvasRef}
                className="product-shadow rounded-apple-sm bg-canvas"
              />
            )}
          </div>
        </div>

        {askResume && (
          <div className="absolute inset-x-0 top-6 z-10 flex justify-center px-4">
            <div className="glass-float flex flex-wrap items-center gap-3 rounded-apple-lg px-5 py-3">
              <span className="text-[14px] text-ink">
                지난번에 {resumePage}쪽까지 읽었습니다. 이어 읽을까요?
              </span>
              <button
                onClick={() => {
                  setPage(resumePage);
                  setAskResume(false);
                }}
                className="rounded-full bg-action px-3.5 py-1.5 text-[13px] text-white transition"
              >
                이어 읽기
              </button>
              <button
                onClick={() => setAskResume(false)}
                className="rounded-apple-md border border-divider bg-pearl px-3 py-1.5 text-[13px] text-ink-80 transition hover:bg-parchment"
              >
                처음부터
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 스크롤 중에도 떠 있는 프로스티드 바 */}
      <footer className="flex min-h-16 shrink-0 flex-wrap items-center justify-center gap-1.5 border-t border-hairline bg-canvas/80 px-3 py-2 backdrop-blur-xl backdrop-saturate-150 sm:gap-2 sm:px-8">
        <NavButton onClick={() => go(-1)} disabled={page <= 1}>
          ← 이전
        </NavButton>

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
          className="h-9 w-16 rounded-full border border-hairline bg-canvas text-center text-[14px] text-ink outline-none focus:border-action-focus"
        />
        <span className="text-[14px] text-ink-48">/ {numPages || "?"}</span>

        <NavButton onClick={() => go(1)} disabled={page >= numPages}>
          다음 →
        </NavButton>

        <span className="mx-3 h-5 w-px bg-divider" />

        <NavButton onClick={() => setWidth((w) => Math.max(400, w - 150))}>−</NavButton>
        <NavButton onClick={() => setWidth((w) => Math.min(2000, w + 150))}>+</NavButton>
      </footer>
    </>
  );
}

function NavButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-apple-md border border-divider bg-pearl px-3 py-1.5 text-[14px] text-ink-80 transition hover:bg-parchment disabled:opacity-30 disabled:hover:bg-pearl"
    >
      {children}
    </button>
  );
}
