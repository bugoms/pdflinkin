/**
 * pdf.js 워커를 public/ 으로 복사한다.
 * 번들러 설정에 의존하지 않고 /pdf.worker.min.mjs 로 확실하게 서빙하기 위함.
 * postinstall 에서 자동 실행된다.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist 워커를 찾지 못했습니다:", src);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-pdf-worker] →", dest);
