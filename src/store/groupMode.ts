"use client";

import { create } from "zustand";

/** 올가미로 그룹 만들기 모드. null = 꺼짐, 'rect' = 사각형, 'free' = 자유형 */
export type GroupLassoMode = "rect" | "free" | null;

export const useGroupMode = create<{
  mode: GroupLassoMode;
  setMode: (mode: GroupLassoMode) => void;
}>((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
}));
