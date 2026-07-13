"use client";

import { create } from "zustand";

type SelectionState = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  setNodeIds(next: Set<string>): void;
  setEdgeIds(next: Set<string>): void;
  selectOnly(id: string): void;
  clear(): void;
};

export const useSelection = create<SelectionState>((set) => ({
  nodeIds: new Set(),
  edgeIds: new Set(),
  setNodeIds: (nodeIds) => set({ nodeIds }),
  setEdgeIds: (edgeIds) => set({ edgeIds }),
  selectOnly: (id) => set({ nodeIds: new Set([id]), edgeIds: new Set() }),
  clear: () => set({ nodeIds: new Set(), edgeIds: new Set() }),
}));
