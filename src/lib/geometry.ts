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

/** 점이 다각형 안에 있는지 (홀짝 규칙). 다각형은 자동으로 닫힌 것으로 본다
 *  — 마지막 점과 첫 점을 잇는 변까지 포함하므로 자유형 올가미가 안 닫혀도 폐합된다. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 카드 여러 장을 격자로 배치할 때 쓸 오프셋 */
export function gridOffset(index: number, columns = 4, gapX = 280, gapY = 230): Point {
  return {
    x: (index % columns) * gapX,
    y: Math.floor(index / columns) * gapY,
  };
}

/* ---------------------------------------------------------------------------
 * 그룹(프레임) 소속 변경 시 배치 정리
 * ------------------------------------------------------------------------- */

/** 프레임이 카드들을 감쌀 때 두는 여백 (GroupLasso·useBoardActions 와 공유) */
export const GROUP_PAD = 32;

/** 그룹 안 카드끼리 유지할 최소 간격 */
const OVERLAP_GAP = 12;
/** 겹치면 비켜나는 계단식 스텝 (복제 +24 관행과 동일) */
const NUDGE = 24;

type BoardDraft = {
  items: Record<string, ItemRow>;
  frames: Record<string, FrameRow>;
};

/** 방금 프레임에 들어온 카드가 형제 카드와 겹치면 계단식으로 비켜 놓는다. */
export function resolveOverlapInFrame(draft: BoardDraft, itemId: string): void {
  const item = draft.items[itemId];
  if (!item?.frame_id) return;

  const siblings = Object.values(draft.items).filter(
    (it) =>
      it.id !== itemId &&
      it.frame_id === item.frame_id &&
      it.status === "active",
  );
  if (siblings.length === 0) return;

  let { x, y } = item;
  for (let i = 0; i < 40; i++) {
    const hit = siblings.find(
      (s) =>
        x < s.x + s.w + OVERLAP_GAP &&
        x + item.w + OVERLAP_GAP > s.x &&
        y < s.y + s.h + OVERLAP_GAP &&
        y + item.h + OVERLAP_GAP > s.y,
    );
    if (!hit) break;
    x += NUDGE;
    y += NUDGE;
  }
  if (x !== item.x || y !== item.y) {
    draft.items[itemId] = { ...item, x, y };
  }
}

/** 프레임을 자식 전부 + 여백에 딱 맞게 키우거나 줄인다.
 *  카드가 들어오면 커지고 빠지면 작아져 "포함됐다/안 됐다"가 눈에 보인다.
 *  자식이 없으면 건드리지 않는다 (의도적으로 만든 빈 그룹 보호).
 *  최소 크기는 nodes/types 의 FRAME_MIN_W/H 와 같은 값. */
export function fitFrameToChildren(
  draft: BoardDraft,
  frameId: string,
  pad = GROUP_PAD,
  min = { w: 240, h: 180 },
): void {
  const frame = draft.frames[frameId];
  if (!frame) return;

  const kids = Object.values(draft.items).filter(
    (it) => it.frame_id === frameId && it.status === "active",
  );
  if (kids.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of kids) {
    minX = Math.min(minX, frame.x + c.x - pad);
    minY = Math.min(minY, frame.y + c.y - pad);
    maxX = Math.max(maxX, frame.x + c.x + c.w + pad);
    maxY = Math.max(maxY, frame.y + c.y + c.h + pad);
  }

  // 원점이 움직인 만큼 자식 상대좌표를 보정한다 (절대 위치는 그대로)
  const dx = frame.x - minX;
  const dy = frame.y - minY;
  if (dx !== 0 || dy !== 0) {
    for (const c of kids) {
      draft.items[c.id] = { ...draft.items[c.id], x: c.x + dx, y: c.y + dy };
    }
  }

  draft.frames[frameId] = {
    ...frame,
    x: minX,
    y: minY,
    w: Math.max(maxX - minX, min.w),
    h: Math.max(maxY - minY, min.h),
  };
}
