"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect } from "react";

import { BUCKET, SIGNED_URL_TTL } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { hasPending, useBoard } from "@/store/board";

type Table = "items" | "frames" | "edges";
type Row = { id?: string; thumb_path?: string | null; [k: string]: unknown };

/**
 * 열려 있는 보드를 실시간으로 지켜본다 — 확장/다른 기기에서 담은 카드가
 * 새로고침 없이 나타난다.
 *
 * 핵심: 수신은 "저장"이 아니라 "표시 갱신"이다. `applyRemote` 로만 반영해
 * 저장 큐(enqueueDiff)·언두 스택을 절대 타지 않으므로 에코 루프가 없다.
 * - 내가 방금 쓴 것(큐 대기 중)은 `hasPending` 으로 무시
 * - 드래그/리사이즈 중(interaction)엔 원격으로 로컬 조작을 덮지 않음
 * - items 의 extracted_text 는 브라우저 상태에 담지 않는다(항상 null)
 *
 * 전제: `supabase/migrations/0002_realtime.sql` 로 publication 을 켜 둬야 한다.
 */
export function useRealtime(boardId: string) {
  useEffect(() => {
    if (!boardId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function signThumb(path: string) {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (data?.signedUrl) useBoard.getState().setSignedUrl(path, data.signedUrl);
    }

    function handle(table: Table, payload: RealtimePostgresChangesPayload<Row>) {
      const store = useBoard.getState();
      if (store.interaction) return; // 드래그/리사이즈 중엔 손대지 않음

      if (payload.eventType === "DELETE") {
        const id = (payload.old as Row)?.id;
        if (!id || hasPending(table, id)) return;
        store.applyRemote((d) => {
          delete (d[table] as Record<string, unknown>)[id];
        });
        return;
      }

      const row = { ...(payload.new as Row) };
      const id = row.id;
      if (!id || hasPending(table, id)) return; // 내가 방금 쓴 것/대기 중이면 무시(에코)
      if (table === "items") row.extracted_text = null; // 브라우저 상태 금지 규칙

      store.applyRemote((d) => {
        (d[table] as Record<string, unknown>)[id] = row;
      });

      if (table === "items" && row.thumb_path && !store.signedUrls[row.thumb_path]) {
        void signThumb(row.thumb_path);
      }
    }

    // ★ 반드시 구독 "전에" realtime 인증 토큰을 실어야 한다.
    // 인증 없이 subscribe 하면 채널이 anon 으로 맺어져 RLS 가 이벤트를 전부 막는다.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      const ch = supabase.channel(`board:${boardId}`);
      for (const table of ["items", "frames", "edges"] as Table[]) {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `board_id=eq.${boardId}` },
          (payload) => handle(table, payload as RealtimePostgresChangesPayload<Row>),
        );
      }
      ch.subscribe();
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [boardId]);
}
