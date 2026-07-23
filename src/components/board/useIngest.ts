"use client";

import { useCallback } from "react";

import { frameAtPoint, gridOffset, toLocal, type Point } from "@/lib/geometry";
import {
  destroyPdf,
  extractText,
  loadPdfFromData,
  makeImageThumbnail,
  renderThumbnail,
} from "@/lib/pdf";
import { uploadBlob } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { ItemKind, ItemRow, UnfurlResult } from "@/lib/types";
import { faviconFallback, hostname } from "@/lib/url";
import { flush, makeFrame, makeItem, useBoard } from "@/store/board";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 버킷 제한과 동일

export function useIngest() {
  const apply = useBoard((s) => s.apply);
  const setSignedUrl = useBoard((s) => s.setSignedUrl);

  /** 아이템 하나를 만들어 캔버스에 올린다. 프레임 안이면 상대 좌표로 변환. */
  const place = useCallback(
    (
      kind: ItemKind,
      at: Point,
      overrides: Partial<ItemRow> = {},
      size?: { w: number; h: number },
    ): ItemRow => {
      const { boardId, userId, frames } = useBoard.getState();
      const frame = frameAtPoint(Object.values(frames), at);
      const local = toLocal(at, frame);

      const item = makeItem({
        board_id: boardId,
        user_id: userId,
        kind,
        frame_id: frame?.id ?? null,
        x: local.x,
        y: local.y,
        ...(size ?? {}),
        ...overrides,
      });

      apply((d) => {
        d.items[item.id] = item;
      });
      return item;
    },
    [apply],
  );

  /** 아이템을 부분 수정한다 (업로드 완료, 메타 도착 등) */
  const patch = useCallback(
    (id: string, changes: Partial<ItemRow>) => {
      apply((d) => {
        const target = d.items[id];
        if (target) d.items[id] = { ...target, ...changes };
      });
    },
    [apply],
  );

  /* ----------------------------------------------------------------------- */

  const addLinks = useCallback(
    (urls: string[], at: Point) => {
      urls.forEach((url, index) => {
        const offset = gridOffset(index);
        const item = place(
          "link",
          { x: at.x + offset.x, y: at.y + offset.y },
          {
            url,
            domain: hostname(url),
            title: hostname(url),
            favicon_url: faviconFallback(url),
          },
          { w: 260, h: 220 },
        );

        // 메타데이터는 백그라운드로 채운다. 실패해도 카드는 이미 존재한다.
        void (async () => {
          try {
            const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
            if (!res.ok) return;
            const meta = (await res.json()) as UnfurlResult;
            patch(item.id, {
              title: meta.title ?? hostname(url),
              description: meta.description,
              favicon_url: meta.faviconUrl,
              og_image_url: meta.ogImageUrl,
              domain: meta.domain,
            });
          } catch (err) {
            console.warn("[unfurl] 실패", err);
          }
        })();
      });
    },
    [place, patch],
  );

  /* ----------------------------------------------------------------------- */

  const addFiles = useCallback(
    (files: File[], at: Point) => {
      const { userId } = useBoard.getState();
      const supabase = createClient();

      files.forEach((file, index) => {
        if (file.size > MAX_FILE_BYTES) {
          alert(`"${file.name}" 은 50MB를 넘어 업로드할 수 없습니다.`);
          return;
        }

        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        const isImage = file.type.startsWith("image/");
        // PDF·이미지는 썸네일/본문까지, 그 밖(워드·한글·압축 등)은 일반 파일 카드로.
        const kind: ItemKind = isPdf ? "pdf" : isImage ? "image" : "file";
        const size = isPdf
          ? { w: 240, h: 280 }
          : isImage
            ? { w: 260, h: 200 }
            : { w: 240, h: 200 };

        const offset = gridOffset(index);
        const item = place(
          kind,
          { x: at.x + offset.x, y: at.y + offset.y },
          {
            title: file.name.replace(/\.[^.]+$/, ""),
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || "application/octet-stream",
          },
          size,
        );

        void (async () => {
          let pendingText: string | null = null;
          try {
            const ext = isPdf ? "pdf" : (file.name.split(".").pop() ?? "bin");
            const filePath = `${userId}/${item.id}.${ext}`;
            const thumbPath = `${userId}/${item.id}-thumb.jpg`;

            await uploadBlob(
              supabase,
              filePath,
              file,
              file.type || "application/octet-stream",
            );

            const changes: Partial<ItemRow> = { storage_path: filePath };

            if (isPdf) {
              const buffer = await file.arrayBuffer();
              const doc = await loadPdfFromData(buffer);
              const [thumb, text] = await Promise.all([
                renderThumbnail(doc),
                extractText(doc),
              ]);
              await uploadBlob(supabase, thumbPath, thumb, "image/jpeg");
              changes.thumb_path = thumbPath;
              changes.page_count = doc.numPages;
              destroyPdf(doc);

              // 본문 텍스트는 검색 전용이라 클라이언트 상태에 담지 않고 DB에만 쓴다.
              pendingText = text;
            } else if (isImage) {
              const { blob } = await makeImageThumbnail(file);
              await uploadBlob(supabase, thumbPath, blob, "image/jpeg");
              changes.thumb_path = thumbPath;
            }

            // 방금 만든 썸네일을 바로 보여주기 위해 서명 URL 확보
            if (changes.thumb_path) {
              const { data } = await supabase.storage
                .from("files")
                .createSignedUrl(changes.thumb_path, 60 * 60 * 24 * 7);
              if (data?.signedUrl) setSignedUrl(changes.thumb_path, data.signedUrl);
            }

            patch(item.id, changes);

            if (pendingText) {
              // 저장 큐가 이 아이템을 upsert 한 뒤에 본문을 따로 써야 덮어쓰이지 않는다.
              await flush();
              const { error } = await supabase
                .from("items")
                .update({ extracted_text: pendingText })
                .eq("id", item.id);
              if (error) console.warn("[upload] 본문 저장 실패", error);
            }
          } catch (err) {
            console.error("[upload] 실패", err);
            alert(`"${file.name}" 업로드에 실패했습니다.`);
          }
        })();
      });
    },
    [place, patch, setSignedUrl],
  );

  /* ----------------------------------------------------------------------- */

  const addNote = useCallback(
    (at: Point) => place("note", at, { color: "amber", note: "" }, { w: 240, h: 180 }),
    [place],
  );

  /** 펜 드로잉을 SVG 원본 + JPEG 썸네일로 업로드해 이미지 카드로 만든다.
   *  DB 의 item_kind enum 을 안 바꾸기 위해 kind='image' 를 그대로 쓴다(스키마 변경 없음).
   *  rect 는 캔버스(flow) 좌표의 그림 영역 — 그린 자리에 그 크기 그대로 카드가 된다. */
  const addDrawing = useCallback(
    (
      svg: Blob,
      thumb: Blob,
      rect: { x: number; y: number; w: number; h: number },
    ) => {
      const { userId } = useBoard.getState();
      const supabase = createClient();

      const item = place(
        "image",
        { x: rect.x, y: rect.y },
        {
          title: "펜 메모",
          file_name: "펜 메모.svg",
          file_size: svg.size,
          mime_type: "image/svg+xml",
        },
        { w: rect.w, h: rect.h },
      );

      void (async () => {
        try {
          const filePath = `${userId}/${item.id}.svg`;
          const thumbPath = `${userId}/${item.id}-thumb.jpg`;

          await uploadBlob(supabase, filePath, svg, "image/svg+xml");
          await uploadBlob(supabase, thumbPath, thumb, "image/jpeg");

          const { data } = await supabase.storage
            .from("files")
            .createSignedUrl(thumbPath, 60 * 60 * 24 * 7);
          if (data?.signedUrl) setSignedUrl(thumbPath, data.signedUrl);

          patch(item.id, { storage_path: filePath, thumb_path: thumbPath });
        } catch (err) {
          console.error("[drawing] 저장 실패", err);
          alert("그림 저장에 실패했습니다.");
        }
      })();

      return item;
    },
    [place, patch, setSignedUrl],
  );

  const addFrame = useCallback(
    (at: Point) => {
      const { boardId, userId } = useBoard.getState();
      const frame = makeFrame({
        board_id: boardId,
        user_id: userId,
        x: at.x,
        y: at.y,
      });
      apply((d) => {
        d.frames[frame.id] = frame;
      });
      return frame;
    },
    [apply],
  );

  return { addLinks, addFiles, addNote, addDrawing, addFrame, patch };
}
