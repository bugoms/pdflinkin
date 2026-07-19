"use client";

import { useEffect } from "react";

import type { ItemRow, UnfurlResult } from "@/lib/types";
import { hostname } from "@/lib/url";
import { useBoard } from "@/store/board";

/**
 * 확장으로 담은 링크 카드에 OG 메타(제목·설명·미리보기 이미지·파비콘)를 채운다.
 *
 * 확장은 쿠키 세션이 없어 `/api/unfurl` 을 쓰지 못하므로 호스트명+파비콘만 담는다.
 * 웹에서 보드를 열면 로그인 세션이 있으니 여기서 나머지를 채운다
 * (usePdfBackfill 이 확장 업로드 PDF 의 썸네일을 채우는 것과 같은 방식).
 *
 * 반복 처리·언두 오염 방지: unfurl 결과가 카드와 "정말 달라졌을 때만" apply 한다.
 * 메타가 없는 사이트는 매번 같은(빈) 결과가 오므로 저장·언두를 만들지 않는다.
 * (/api/unfurl 은 성공/실패를 모두 link_meta_cache 에 캐시하므로 재호출도 가볍다.)
 */
export function useLinkBackfill() {
  const boardId = useBoard((s) => s.boardId);

  useEffect(() => {
    if (!boardId) return;
    let alive = true;

    void (async () => {
      // 설명·미리보기 이미지가 둘 다 없는 링크 = 아직 unfurl 안 된 카드(주로 확장분)
      const targets = Object.values(useBoard.getState().items).filter(
        (item) =>
          item.kind === "link" &&
          item.status === "active" &&
          item.url &&
          !item.description &&
          !item.og_image_url,
      );
      if (targets.length === 0) return;

      // 한꺼번에 몰아 치지 않도록 순차 처리
      for (const item of targets) {
        if (!alive) return;
        try {
          const res = await fetch(
            `/api/unfurl?url=${encodeURIComponent(item.url!)}`,
          );
          if (!res.ok) continue;
          const meta = (await res.json()) as UnfurlResult;
          if (!alive) return;

          const next: Partial<ItemRow> = {
            title: meta.title ?? item.title ?? hostname(item.url!),
            description: meta.description,
            favicon_url: meta.faviconUrl,
            og_image_url: meta.ogImageUrl,
            domain: meta.domain,
          };

          // 실제로 바뀐 게 없으면 저장·언두를 만들지 않는다.
          if (
            next.title === item.title &&
            next.description === item.description &&
            next.favicon_url === item.favicon_url &&
            next.og_image_url === item.og_image_url &&
            next.domain === item.domain
          ) {
            continue;
          }

          useBoard.getState().apply((d) => {
            const target = d.items[item.id];
            if (target) d.items[item.id] = { ...target, ...next };
          });
        } catch (err) {
          console.warn("[link-backfill] OG 메타 보정 실패", item.id, err);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [boardId]);
}
