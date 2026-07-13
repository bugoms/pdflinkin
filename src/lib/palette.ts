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

/** Tailwind는 클래스명을 정적으로 스캔하므로 문자열을 조립하지 말고 다 적어둔다. */
export const CARD_COLORS: Record<ColorToken, { card: string; swatch: string }> = {
  neutral: { card: "border-neutral-800 bg-neutral-900", swatch: "bg-neutral-500" },
  sky: { card: "border-sky-900/70 bg-sky-950/40", swatch: "bg-sky-500" },
  emerald: {
    card: "border-emerald-900/70 bg-emerald-950/40",
    swatch: "bg-emerald-500",
  },
  amber: { card: "border-amber-900/70 bg-amber-950/40", swatch: "bg-amber-500" },
  rose: { card: "border-rose-900/70 bg-rose-950/40", swatch: "bg-rose-500" },
  violet: {
    card: "border-violet-900/70 bg-violet-950/40",
    swatch: "bg-violet-500",
  },
};

export const FRAME_COLORS: Record<ColorToken, { frame: string; title: string }> = {
  neutral: { frame: "border-neutral-700/70 bg-neutral-800/20", title: "text-neutral-400" },
  sky: { frame: "border-sky-800/70 bg-sky-900/15", title: "text-sky-400" },
  emerald: {
    frame: "border-emerald-800/70 bg-emerald-900/15",
    title: "text-emerald-400",
  },
  amber: { frame: "border-amber-800/70 bg-amber-900/15", title: "text-amber-400" },
  rose: { frame: "border-rose-800/70 bg-rose-900/15", title: "text-rose-400" },
  violet: {
    frame: "border-violet-800/70 bg-violet-900/15",
    title: "text-violet-400",
  },
};

export function cardColor(token: string | null | undefined) {
  return CARD_COLORS[(token as ColorToken) ?? "neutral"] ?? CARD_COLORS.neutral;
}

export function frameColor(token: string | null | undefined) {
  return FRAME_COLORS[(token as ColorToken) ?? "sky"] ?? FRAME_COLORS.sky;
}
