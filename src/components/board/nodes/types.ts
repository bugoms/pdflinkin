import type { Node } from "@xyflow/react";

import type { FrameRow, ItemRow } from "@/lib/types";

export type ItemNodeData = {
  item: ItemRow;
  thumbUrl: string | null;
  dimmed: boolean;
};

export type FrameNodeData = {
  frame: FrameRow;
};

export type ItemNodeType = Node<ItemNodeData, "link" | "pdf" | "image" | "note">;
export type FrameNodeType = Node<FrameNodeData, "frame">;
export type AppNode = ItemNodeType | FrameNodeType;

export const ITEM_MIN_W = 140;
export const ITEM_MIN_H = 90;
export const FRAME_MIN_W = 240;
export const FRAME_MIN_H = 180;
