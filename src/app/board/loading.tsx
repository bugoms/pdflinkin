/** 서버가 보드 데이터를 준비하는 동안 즉시 스트리밍되는 로딩 화면.
 * 이게 없으면 응답이 올 때까지 흰 화면만 보인다. */
export default function BoardLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-parchment">
      <div className="animate-pulse text-center">
        <p className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
          LinkScape
        </p>
        <p className="mt-1.5 text-[13px] text-ink-48">보드 여는 중…</p>
      </div>
    </div>
  );
}
