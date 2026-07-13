"use client";

import { useEffect } from "react";

import { destroyPdf, extractText, loadPdfFromUrl, renderThumbnail } from "@/lib/pdf";
import { signPath, SIGNED_URL_TTL, uploadBlob } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { flush, useBoard } from "@/store/board";

/**
 * 썸네일이 없는 PDF 카드를 보드를 열 때 자동으로 보정한다.
 * (웨일 확장은 파일 업로드만 하고 썸네일·본문 추출은 여기서 채워진다 —
 *  PDF 처리는 전부 클라이언트에서 한다는 원칙 그대로.)
 */
export function usePdfBackfill() {
  const boardId = useBoard((s) => s.boardId);

  useEffect(() => {
    if (!boardId) return;
    let alive = true;

    void (async () => {
      const targets = Object.values(useBoard.getState().items).filter(
        (item) =>
          item.kind === "pdf" &&
          item.status === "active" &&
          item.storage_path &&
          !item.thumb_path,
      );
      if (targets.length === 0) return;

      const supabase = createClient();

      // 한 번에 몰아 받으면 무거우므로 순차 처리
      for (const item of targets) {
        if (!alive) return;
        try {
          const url = await signPath(supabase, item.storage_path!);
          if (!url) continue;

          const doc = await loadPdfFromUrl(url);
          const [thumb, text] = await Promise.all([
            renderThumbnail(doc),
            extractText(doc),
          ]);
          const pageCount = doc.numPages;
          destroyPdf(doc);

          const thumbPath = `${item.user_id}/${item.id}-thumb.jpg`;
          await uploadBlob(supabase, thumbPath, thumb, "image/jpeg");

          const { data } = await supabase.storage
            .from("files")
            .createSignedUrl(thumbPath, SIGNED_URL_TTL);
          if (!alive) return;
          if (data?.signedUrl) {
            useBoard.getState().setSignedUrl(thumbPath, data.signedUrl);
          }

          useBoard.getState().apply((d) => {
            const target = d.items[item.id];
            if (target) {
              d.items[item.id] = {
                ...target,
                thumb_path: thumbPath,
                page_count: pageCount,
              };
            }
          });

          if (text) {
            // 저장 큐가 이 아이템을 upsert 한 뒤에 본문을 따로 써야 덮어쓰이지 않는다.
            await flush();
            const { error } = await supabase
              .from("items")
              .update({ extracted_text: text })
              .eq("id", item.id);
            if (error) console.warn("[backfill] 본문 저장 실패", error);
          }
        } catch (err) {
          console.warn("[backfill] PDF 보정 실패", item.id, err);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [boardId]);
}
