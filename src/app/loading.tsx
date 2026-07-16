/** 루트( / → /board 리다이렉트 등)에서도 흰 화면 대신 이걸 보여준다. */
export default function RootLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-parchment">
      <p className="animate-pulse text-[24px] font-semibold tracking-[-0.02em] text-ink">
        LinkScape
      </p>
    </div>
  );
}
