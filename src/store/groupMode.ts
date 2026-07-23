"use client";

import { create } from "zustand";

/** 캔버스 오버레이 모드 (상호배제 — 하나만 켜진다).
 *  null = 꺼짐 / 'rect'·'free' = 그룹 올가미(데스크톱) /
 *  'pick' = 카드 탭해 고르기(모바일 묶기) / 'draw' = 그리기(펜 노트) */
export type GroupLassoMode = "rect" | "free" | "pick" | "draw" | null;

export const useGroupMode = create<{
  mode: GroupLassoMode;
  setMode: (mode: GroupLassoMode) => void;
}>((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
}));
