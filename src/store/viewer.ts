"use client";

import { create } from "zustand";

type ViewerState = {
  itemId: string | null;
  open(itemId: string): void;
  close(): void;
};

export const useViewer = create<ViewerState>((set) => ({
  itemId: null,
  open: (itemId) => set({ itemId }),
  close: () => set({ itemId: null }),
}));
