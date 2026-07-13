export type ItemKind = "link" | "pdf" | "image" | "note" | "file";

export type BoardRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type FrameRow = {
  id: string;
  board_id: string;
  user_id: string;
  title: string | null;
  color: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  created_at: string;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  board_id: string;
  user_id: string;
  frame_id: string | null;
  kind: ItemKind;

  x: number;
  y: number;
  w: number;
  h: number;
  z: number;

  status: "active" | "trashed";

  title: string | null;
  note: string | null;
  color: string | null;
  pinned: boolean;

  url: string | null;
  domain: string | null;
  description: string | null;
  favicon_url: string | null;
  og_image_url: string | null;

  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  page_count: number | null;
  thumb_path: string | null;

  extracted_text: string | null;

  last_read_page: number | null;
  read_at: string | null;

  created_at: string;
  updated_at: string;
};

export type TagRow = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type ItemTagRow = {
  item_id: string;
  tag_id: string;
  user_id: string;
};

export type EdgeRow = {
  id: string;
  board_id: string;
  user_id: string;
  source_item_id: string;
  target_item_id: string;
  label: string | null;
  created_at: string;
};

export type LinkMetaCacheRow = {
  url: string;
  title: string | null;
  description: string | null;
  favicon_url: string | null;
  og_image_url: string | null;
  fetched_at: string;
};

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      boards: Table<BoardRow, "user_id">;
      frames: Table<FrameRow, "board_id" | "user_id">;
      items: Table<ItemRow, "board_id" | "user_id" | "kind">;
      tags: Table<TagRow, "user_id" | "name">;
      item_tags: Table<ItemTagRow, "item_id" | "tag_id" | "user_id">;
      edges: Table<
        EdgeRow,
        "board_id" | "user_id" | "source_item_id" | "target_item_id"
      >;
      link_meta_cache: Table<LinkMetaCacheRow, "url">;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: { item_kind: ItemKind };
    CompositeTypes: Record<never, never>;
  };
};

/** 링크 미리보기 API(/api/unfurl)의 응답 */
export type UnfurlResult = {
  url: string;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  domain: string;
};
