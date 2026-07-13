import type { FrameRow, ItemRow } from "@/lib/types";

export type Point = { x: number; y: number };

/** 점을 품고 있는 프레임 중 가장 작은 것 (겹쳐 있으면 안쪽 것을 고른다) */
export function frameAtPoint(frames: FrameRow[], p: Point): FrameRow | null {
  let best: FrameRow | null = null;
  for (const f of frames) {
    const inside =
      p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h;
    if (!inside) continue;
    if (!best || f.w * f.h < best.w * best.h) best = f;
  }
  return best;
}

/** 아이템의 절대 좌표 (프레임 안이면 프레임 원점을 더한다) */
export function absolutePosition(
  item: Pick<ItemRow, "x" | "y" | "frame_id">,
  frames: Record<string, FrameRow>,
): Point {
  const frame = item.frame_id ? frames[item.frame_id] : undefined;
  if (!frame) return { x: item.x, y: item.y };
  return { x: frame.x + item.x, y: frame.y + item.y };
}

/** 절대 좌표를 (프레임이 있으면) 상대 좌표로 바꾼다 */
export function toLocal(p: Point, frame: FrameRow | null): Point {
  if (!frame) return p;
  return { x: p.x - frame.x, y: p.y - frame.y };
}

/** 카드 여러 장을 격자로 배치할 때 쓸 오프셋 */
export function gridOffset(index: number, columns = 4, gapX = 280, gapY = 230): Point {
  return {
    x: (index % columns) * gapX,
    y: Math.floor(index / columns) * gapY,
  };
}
