"use client";

import { useCallback } from "react";

import {
  absolutePosition,
  fitFrameToChildren,
  GROUP_PAD,
} from "@/lib/geometry";
import type { FrameRow } from "@/lib/types";
import { makeFrame, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";
import { useViewer } from "@/store/viewer";

/** 선택 대상에 대한 공용 액션 — 툴바 버튼·키보드 단축키·우클릭 메뉴가 같이 쓴다. */
export function useBoardActions() {
  const deleteSelected = useCallback(() => {
    const { nodeIds, edgeIds, setNodeIds, setEdgeIds } = useSelection.getState();
    const targetNodeIds = [...nodeIds];
    const targetEdgeIds = [...edgeIds];
    if (targetNodeIds.length === 0 && targetEdgeIds.length === 0) return;

    useBoard.getState().apply((d) => {
      for (const id of targetNodeIds) {
        const frame = d.frames[id];
        if (frame) {
          // 프레임만 지우고 안의 카드는 절대좌표로 남긴다 (같이 지우지 않는다)
          for (const item of Object.values(d.items)) {
            if (item.frame_id !== frame.id) continue;
            d.items[item.id] = {
              ...item,
              frame_id: null,
              x: frame.x + item.x,
              y: frame.y + item.y,
            };
          }
          delete d.frames[id];
          continue;
        }

        const item = d.items[id];
        if (item) d.items[id] = { ...item, status: "trashed" };
      }

      for (const id of targetEdgeIds) delete d.edges[id];

      // 휴지통으로 간 카드에 붙어 있던 연결선 정리
      for (const edge of Object.values(d.edges)) {
        const source = d.items[edge.source_item_id];
        const target = d.items[edge.target_item_id];
        if (
          !source ||
          source.status !== "active" ||
          !target ||
          target.status !== "active"
        ) {
          delete d.edges[edge.id];
        }
      }
    });

    setNodeIds(new Set());
    setEdgeIds(new Set());
  }, []);

  const duplicateSelected = useCallback(() => {
    const { nodeIds, setNodeIds } = useSelection.getState();
    if (nodeIds.size === 0) return;
    const created: string[] = [];

    useBoard.getState().apply((d) => {
      for (const id of nodeIds) {
        const item = d.items[id];
        if (!item || item.status !== "active") continue;
        const copy = {
          ...item,
          id: crypto.randomUUID(),
          x: item.x + 24,
          y: item.y + 24,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        d.items[copy.id] = copy;
        created.push(copy.id);
      }
    });

    if (created.length > 0) setNodeIds(new Set(created));
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    useBoard.getState().apply((d) => {
      delete d.edges[edgeId];
    });
    const sel = useSelection.getState();
    if (sel.edgeIds.has(edgeId)) {
      const next = new Set(sel.edgeIds);
      next.delete(edgeId);
      sel.setEdgeIds(next);
    }
  }, []);

  /** 카드 종류에 맞는 "열기" — PDF/이미지/일반파일은 인앱 뷰어, 링크는 새 탭. */
  const openItem = useCallback((itemId: string) => {
    const item = useBoard.getState().items[itemId];
    if (!item) return;
    if (item.kind === "pdf" || item.kind === "image" || item.kind === "file") {
      useViewer.getState().open(itemId);
      return;
    }
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  }, []);

  /** 선택한 카드들을 그룹(프레임)으로 묶는다.
   *  - 선택에 **기존 프레임이 있으면** 그 프레임에 카드들을 추가한다(기존 그룹에 넣기).
   *  - 없으면 카드들을 감싸는 **새 프레임**을 만든다.
   *  프레임은 자식 전부 + 여백에 맞게 유동적으로 커지거나 작아진다.
   *  카드가 하나도 선택돼 있지 않으면 null 을 돌려준다(호출측이 폴백). */
  const groupSelected = useCallback((): string | null => {
    const ids = [...useSelection.getState().nodeIds];
    const state = useBoard.getState();
    const frameIds = ids.filter((id) => state.frames[id]);
    const itemIds = ids.filter(
      (id) => state.items[id] && state.items[id].status === "active",
    );
    if (itemIds.length === 0) return null;

    const targetFrameId = frameIds[0] ?? null;
    let resultFrameId = targetFrameId ?? "";

    useBoard.getState().apply((d) => {
      let frame: FrameRow;
      if (targetFrameId && d.frames[targetFrameId]) {
        frame = d.frames[targetFrameId];
      } else {
        const rects = itemIds.map((id) => {
          const it = d.items[id];
          const abs = absolutePosition(it, d.frames);
          return { x: abs.x, y: abs.y, r: abs.x + it.w, b: abs.y + it.h };
        });
        const minX = Math.min(...rects.map((r) => r.x)) - GROUP_PAD;
        const minY = Math.min(...rects.map((r) => r.y)) - GROUP_PAD;
        const maxX = Math.max(...rects.map((r) => r.r)) + GROUP_PAD;
        const maxY = Math.max(...rects.map((r) => r.b)) + GROUP_PAD;
        frame = makeFrame({
          board_id: state.boardId,
          user_id: state.userId,
          x: minX,
          y: minY,
          w: Math.max(maxX - minX, 160),
          h: Math.max(maxY - minY, 120),
        });
        d.frames[frame.id] = frame;
      }
      resultFrameId = frame.id;

      // 선택 카드들을 이 프레임 소속으로 (절대→프레임 상대 좌표)
      for (const id of itemIds) {
        const it = d.items[id];
        if (!it || it.frame_id === frame.id) continue;
        const abs = absolutePosition(it, d.frames);
        d.items[id] = { ...it, frame_id: frame.id, x: abs.x - frame.x, y: abs.y - frame.y };
      }

      // 프레임을 자식 전부 + 여백에 맞게 조정 (settleDrag 와 같은 규칙)
      fitFrameToChildren(d, frame.id);
    });

    const sel = useSelection.getState();
    sel.setNodeIds(new Set([resultFrameId]));
    sel.setEdgeIds(new Set());
    return resultFrameId;
  }, []);

  return { deleteSelected, duplicateSelected, deleteEdge, openItem, groupSelected };
}
