/**
 * PDF 처리는 전부 브라우저에서 한다 (서버 연산 비용 0).
 * pdfjs 는 SSR 번들에 끌려오면 문제가 생기므로 항상 동적 import 한다.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function loadPdfFromData(
  data: ArrayBuffer,
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

export async function loadPdfFromUrl(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ url }).promise;
}

/** pdfjs v6 에서는 문서가 아니라 loadingTask 가 destroy 를 갖는다. */
export function destroyPdf(doc: PDFDocumentProxy | null | undefined) {
  if (!doc) return;
  void doc.loadingTask.destroy().catch(() => {});
}

/** 페이지를 캔버스에 그린다. 반환값은 실제 렌더된 크기. */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetWidth: number,
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });

  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d 컨텍스트를 얻지 못했습니다");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height };
}

/** 1페이지를 썸네일 JPEG 로 만든다. */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  maxWidth = 560,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderPageToCanvas(doc, 1, canvas, maxWidth);
  return await canvasToBlob(canvas, "image/jpeg", 0.82);
}

/** 검색용으로 앞쪽 페이지의 본문 텍스트를 뽑는다. */
export async function extractText(
  doc: PDFDocumentProxy,
  maxPages = 8,
  maxChars = 20_000,
): Promise<string> {
  const pages = Math.min(doc.numPages, maxPages);
  const chunks: string[] = [];
  let total = 0;

  for (let i = 1; i <= pages && total < maxChars; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        chunks.push(text);
        total += text.length;
      }
    } catch {
      // 한 페이지 실패는 무시하고 계속
    }
  }

  return chunks.join("\n").slice(0, maxChars);
}

/** 이미지 파일을 썸네일 JPEG 으로 줄인다. */
export async function makeImageThumbnail(
  file: File,
  maxWidth = 560,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d 컨텍스트를 얻지 못했습니다");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  return { blob, width: bitmap.width, height: bitmap.height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("캔버스를 이미지로 바꾸지 못했습니다")),
      type,
      quality,
    );
  });
}
