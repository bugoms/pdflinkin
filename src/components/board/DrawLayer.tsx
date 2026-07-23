"use client";

import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import type { Point } from "@/lib/geometry";

import { useIngest } from "./useIngest";

/** 펜 색 — 잉크 + 카드 분류색 5종 (lib/palette.ts 스와치와 동일한 hex) */
const PEN_COLORS = [
  "#1d1d1f",
  "#5aa9f5",
  "#4cae72",
  "#e5a83c",
  "#e0687a",
  "#8c6fe0",
];
/** 펜 굵기 — 캔버스(flow) 좌표 기준. 카드가 되면 그린 크기 그대로 담긴다 */
const PEN_W = 3;
/** 획 둘레 여백 (카드 가장자리에 딱 붙지 않게) */
const PAD = 12;

type Stroke = { color: string; points: Point[] }; // 화면(client) 좌표

/** 그리기 모드 오버레이 — 펜으로 긋고 "완료"하면 그린 자리에 이미지 카드가 된다.
 *  GroupLasso 처럼 화면 좌표로 받다가 완료 시점에 캔버스 좌표로 변환한다
 *  (오버레이가 포인터를 다 삼키므로 그리는 동안 팬/줌은 일어나지 않는다). */
export default function DrawLayer({ onDone }: { onDone: () => void }) {
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { addDrawing } = useIngest();

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  // 진입 시점 줌 고정 — 미리보기 획 굵기를 캔버스 굵기와 맞추는 용도
  const [zoom] = useState(() => getViewport().zoom);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activePointer.current !== null) return; // 두 번째 손가락은 무시
    activePointer.current = e.pointerId;
    overlayRef.current?.setPointerCapture(e.pointerId);
    setCurrent({ color, points: [{ x: e.clientX, y: e.clientY }] });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activePointer.current !== e.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    setCurrent((prev) =>
      prev ? { ...prev, points: [...prev.points, p] } : prev,
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    if (current && current.points.length >= 2) {
      setStrokes((s) => [...s, current]);
    }
    setCurrent(null);
  }

  /** 그린 획들을 SVG 원본 + JPEG 썸네일로 만들어 이미지 카드로 저장 */
  function commit() {
    if (strokes.length === 0) {
      onDone();
      return;
    }

    // 화면 좌표 → 캔버스(flow) 좌표
    const flowStrokes = strokes.map((s) => ({
      color: s.color,
      points: s.points.map((p) => screenToFlowPosition(p)),
    }));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of flowStrokes) {
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    const w = Math.max(maxX - minX + PAD * 2, 24);
    const h = Math.max(maxY - minY + PAD * 2, 24);
    const ox = minX - PAD;
    const oy = minY - PAD;

    const pathOf = (s: { points: Point[] }) =>
      s.points
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${(p.x - ox).toFixed(1)} ${(p.y - oy).toFixed(1)}`,
        )
        .join(" ");

    const svgSource =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}">` +
      flowStrokes
        .map(
          (s) =>
            `<path d="${pathOf(s)}" fill="none" stroke="${s.color}" stroke-width="${PEN_W}" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("") +
      `</svg>`;
    const svgBlob = new Blob([svgSource], { type: "image/svg+xml" });

    // 썸네일(JPEG, 흰 종이 배경) — 카드 표면에 보일 이미지. 긴 변 640px 기준(기존 이미지 규칙)
    const scale = Math.min(2, 640 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onDone();
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of flowStrokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = PEN_W * scale;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = (p.x - ox) * scale;
        const y = (p.y - oy) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    canvas.toBlob(
      (thumb) => {
        if (thumb) addDrawing(svgBlob, thumb, { x: ox, y: oy, w, h });
        onDone();
      },
      "image/jpeg",
      0.85,
    );
  }

  const visible = current ? [...strokes, current] : strokes;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg className="pointer-events-none fixed inset-0 h-screen w-screen">
        {visible.map((s, i) => (
          <polyline
            key={i}
            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={PEN_W * zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {/* 펜 도구 바 — 묶기 모드 바와 같은 자리. 바 위에서는 그리기가 시작되지 않는다 */}
      <div className="pick-bar pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4">
        <div
          className="glass-float pointer-events-auto flex items-center gap-2 rounded-full py-2 pl-3 pr-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              aria-label="펜 색"
              title="펜 색"
              onClick={() => setColor(c)}
              className={
                color === c
                  ? "h-6 w-6 shrink-0 rounded-full border border-black/10 ring-2 ring-action ring-offset-1"
                  : "h-6 w-6 shrink-0 rounded-full border border-black/10"
              }
              style={{ background: c }}
            />
          ))}

          <span className="mx-0.5 h-5 w-px shrink-0 bg-divider" />

          <button
            onClick={() => setStrokes((s) => s.slice(0, -1))}
            disabled={strokes.length === 0}
            title="마지막 획 지우기"
            className="rounded-apple-md border border-divider bg-pearl px-2.5 py-1.5 text-[13px] text-ink-80 transition hover:bg-parchment disabled:opacity-40"
          >
            ↶
          </button>
          <button
            onClick={onDone}
            className="rounded-apple-md border border-divider bg-pearl px-3 py-1.5 text-[13px] text-ink-80 transition hover:bg-parchment"
          >
            취소
          </button>
          <button
            onClick={commit}
            disabled={strokes.length === 0}
            className="rounded-full bg-action px-3.5 py-1.5 text-[13px] text-white transition disabled:opacity-40"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
