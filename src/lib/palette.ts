export type ColorToken =
  | "neutral"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

export const COLOR_TOKENS: ColorToken[] = [
  "neutral",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
];

/** 색 선택 UI 에 노출하는 토큰 — 여섯 번째 자리는 커스텀 팔레트가 차지한다.
 *  violet 은 선택지에서 빠졌지만 기존 카드 렌더링을 위해 CARD_COLORS 에는 남긴다. */
export const PICKER_TOKENS: ColorToken[] = [
  "neutral",
  "sky",
  "emerald",
  "amber",
  "rose",
];

/** "#rrggbb" — 팔레트 토큰이 아니라 사용자가 컬러 피커로 직접 고른 색 */
export function isCustomColor(color: string | null | undefined): color is string {
  return typeof color === "string" && color.startsWith("#");
}

/**
 * 카드 색은 "분류"지 "액션"이 아니다.
 * 면은 항상 흰 종이(bg-canvas)로 두고, 색은 외곽선으로만 구분한다 — 칸을 칠하지 않는다.
 * 누를 수 있다는 신호(Action Blue)와 절대 헷갈리지 않게 한다.
 *
 * Tailwind 는 클래스명을 정적으로 스캔하므로 문자열을 조립하지 말고 다 적어둔다.
 */
export const CARD_COLORS: Record<ColorToken, { card: string; swatch: string }> = {
  neutral: {
    card: "border border-hairline bg-canvas",
    swatch: "bg-[#d2d2d7]",
  },
  sky: {
    card: "border-2 border-[#5aa9f5] bg-canvas",
    swatch: "bg-[#5aa9f5]",
  },
  emerald: {
    card: "border-2 border-[#4cae72] bg-canvas",
    swatch: "bg-[#4cae72]",
  },
  amber: {
    card: "border-2 border-[#e5a83c] bg-canvas",
    swatch: "bg-[#e5a83c]",
  },
  rose: {
    card: "border-2 border-[#e0687a] bg-canvas",
    swatch: "bg-[#e0687a]",
  },
  violet: {
    card: "border-2 border-[#8c6fe0] bg-canvas",
    swatch: "bg-[#8c6fe0]",
  },
};

export const FRAME_COLORS: Record<ColorToken, { frame: string; title: string }> = {
  neutral: { frame: "border-[#d2d2d7] bg-[#00000004]", title: "text-ink-48" },
  sky: { frame: "border-[#b9d5f2] bg-[#0066cc08]", title: "text-[#2b6cb0]" },
  emerald: { frame: "border-[#bcdcc7] bg-[#34a85308]", title: "text-[#2f7d54]" },
  amber: { frame: "border-[#e6d3a6] bg-[#e5a83c0a]", title: "text-[#9a6b1a]" },
  rose: { frame: "border-[#eec4c8] bg-[#e0687a0a]", title: "text-[#a54455]" },
  violet: { frame: "border-[#cfc0ec] bg-[#8c6fe00a]", title: "text-[#63499f]" },
};

export function cardColor(token: string | null | undefined) {
  return CARD_COLORS[(token as ColorToken) ?? "neutral"] ?? CARD_COLORS.neutral;
}

export function frameColor(token: string | null | undefined) {
  return FRAME_COLORS[(token as ColorToken) ?? "sky"] ?? FRAME_COLORS.sky;
}
