"use client";

import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { absolutePosition, pointInPolygon, type Point } from "@/lib/geometry";
import { makeFrame, useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

/** 프레임이 감싼 카드들 바깥으로 두는 여백 */
const PAD = 32;
/** 이보다 작은 영역은 클릭으로 보고 취소 */
const MIN_AREA = 8;

export default function GroupLasso({
  mode,
  onDone,
}: {
  mode: "rect" | "free";
  onDone: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  // 화면(client) 좌표들 — 사각형은 [시작, 현재] 2개, 자유형은 궤적 전체
  const [points, setPoints] = useState<Point[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    drawing.current = true;
    overlayRef.current?.setPointerCapture(e.pointerId);
    setPoints([{ x: e.clientX, y: e.clientY }]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = { x: e.clientX, y: e.clientY };
    setPoints((prev) =>
      mode === "rect" ? [prev[0] ?? p, p] : [...prev, p],
    );
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    finalize(points);
  }

  function finalize(pts: Point[]) {
    if (pts.length < 2) {
      onDone();
      return;
    }

    const flow = pts.map((p) => screenToFlowPosition({ x: p.x, y: p.y }));
    const xs = flow.map((p) => p.x);
    const ys = flow.map((p) => p.y);
    const region = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    const areaW = region.maxX - region.minX;
    const areaH = region.maxY - region.minY;
    if (areaW < MIN_AREA && areaH < MIN_AREA) {
      onDone();
      return;
    }

    const { items, frames, boardId, userId } = useBoard.getState();
    const enclosed = Object.values(items)
      .filter((it) => it.status === "active")
      .filter((it) => {
        const abs = absolutePosition(it, frames);
        const c = { x: abs.x + it.w / 2, y: abs.y + it.h / 2 };
        if (mode === "rect") {
          return (
            c.x >= region.minX &&
            c.x <= region.maxX &&
            c.y >= region.minY &&
            c.y <= region.maxY
          );
        }
        return pointInPolygon(c, flow);
      });

    // 감싼 카드가 있으면 그 카드들에 여백을 둔 크기로, 없으면 그린 영역 그대로
    let fx: number;
    let fy: number;
    let fw: number;
    let fh: number;
    if (enclosed.length > 0) {
      const rects = enclosed.map((it) => {
        const abs = absolutePosition(it, frames);
        return { x: abs.x, y: abs.y, r: abs.x + it.w, b: abs.y + it.h };
      });
      const minX = Math.min(...rects.map((r) => r.x));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxX = Math.max(...rects.map((r) => r.r));
      const maxY = Math.max(...rects.map((r) => r.b));
      fx = minX - PAD;
      fy = minY - PAD;
      fw = maxX - minX + PAD * 2;
      fh = maxY - minY + PAD * 2;
    } else {
      fx = region.minX;
      fy = region.minY;
      fw = areaW;
      fh = areaH;
    }

    const frame = makeFrame({
      board_id: boardId,
      user_id: userId,
      x: fx,
      y: fy,
      w: Math.max(fw, 160),
      h: Math.max(fh, 120),
    });

    // 프레임 생성 + 감싼 카드 재소속을 한 번의 apply 로 (언두 1스텝)
    useBoard.getState().apply((d) => {
      d.frames[frame.id] = frame;
      for (const it of enclosed) {
        const cur = d.items[it.id];
        if (!cur) continue;
        // 현재(옛) 소속 기준 절대좌표 → 새 프레임 기준 상대좌표
        const abs = absolutePosition(cur, d.frames);
        d.items[it.id] = {
          ...cur,
          frame_id: frame.id,
          x: abs.x - frame.x,
          y: abs.y - frame.y,
        };
      }
    });

    useSelection.getState().setNodeIds(new Set([frame.id]));
    useSelection.getState().setEdgeIds(new Set());
    onDone();
  }

  // 화면 좌표로 사각형/다각형을 그린다 (fixed = client 좌표 그대로)
  const rectDraw =
    mode === "rect" && points.length >= 2
      ? {
          x: Math.min(points[0].x, points[1].x),
          y: Math.min(points[0].y, points[1].y),
          w: Math.abs(points[1].x - points[0].x),
          h: Math.abs(points[1].y - points[0].y),
        }
      : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg className="pointer-events-none fixed inset-0 h-screen w-screen">
        {rectDraw && (
          <rect
            x={rectDraw.x}
            y={rectDraw.y}
            width={rectDraw.w}
            height={rectDraw.h}
            fill="rgba(0,102,204,0.08)"
            stroke="#0066cc"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            rx={6}
          />
        )}
        {mode === "free" && points.length >= 2 && (
          <polygon
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(0,102,204,0.08)"
            stroke="#0066cc"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-[72px] flex justify-center">
        <span className="glass-float rounded-full px-4 py-2 text-[13px] text-ink">
          {mode === "rect" ? "사각형" : "자유형"} 영역을 드래그해 그룹으로 묶기 · Esc 취소
        </span>
      </div>
    </div>
  );
}
