import { redirect } from "next/navigation";

import BoardClient from "@/components/board/BoardClient";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/storage";
import type { EdgeRow, FrameRow, ItemRow, TagRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 사용자의 모든 보드 (전환 UI 용). 없으면 기본 보드를 하나 만든다.
  let { data: boards } = await supabase
    .from("boards")
    .select("id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!boards || boards.length === 0) {
    const { data: created, error } = await supabase
      .from("boards")
      .insert({ user_id: user.id, title: "내 보드" })
      .select("id, title, created_at")
      .single();
    if (error || !created) {
      throw new Error(`보드를 만들지 못했습니다: ${error?.message ?? "알 수 없는 오류"}`);
    }
    boards = [created];
  }

  // 쿼리의 board id 가 내 보드면 그걸, 아니면 가장 오래된 보드를 연다.
  const { board: boardParam } = await searchParams;
  const board =
    boards.find((b) => b.id === boardParam) ?? boards[0];

  const [framesRes, itemsRes, edgesRes, tagsRes, itemTagsRes] = await Promise.all([
    supabase.from("frames").select("*").eq("board_id", board.id),
    supabase
      .from("items")
      .select("*")
      .eq("board_id", board.id)
      .eq("status", "active"),
    supabase.from("edges").select("*").eq("board_id", board.id),
    supabase.from("tags").select("*").eq("user_id", user.id).order("name"),
    supabase.from("item_tags").select("item_id, tag_id").eq("user_id", user.id),
  ]);

  const frames = (framesRes.data ?? []) as FrameRow[];
  const edges = (edgesRes.data ?? []) as EdgeRow[];

  // PDF 본문(extracted_text)은 브라우저로 보내지 않는다. 검색은 DB에서 한다.
  const items = ((itemsRes.data ?? []) as ItemRow[]).map((item) => ({
    ...item,
    extracted_text: null,
  }));
  const tags = (tagsRes.data ?? []) as TagRow[];

  const itemTags: Record<string, string[]> = {};
  for (const row of itemTagsRes.data ?? []) {
    (itemTags[row.item_id] ??= []).push(row.tag_id);
  }

  // 캔버스에 그릴 썸네일들의 서명 URL을 한 번에 만든다.
  const thumbPaths = items
    .map((item) => item.thumb_path)
    .filter((path): path is string => Boolean(path));
  const signedUrls = await signPaths(supabase, thumbPaths);

  return (
    <BoardClient
      boardId={board.id}
      boardTitle={board.title}
      boards={boards.map((b) => ({ id: b.id, title: b.title }))}
      userId={user.id}
      userEmail={user.email ?? ""}
      items={items}
      frames={frames}
      edges={edges}
      tags={tags}
      itemTags={itemTags}
      signedUrls={signedUrls}
    />
  );
}
