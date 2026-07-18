"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { absolutePosition, frameAtPoint, toLocal, type Point } from "@/lib/geometry";
import type { EdgeRow } from "@/lib/types";
import { extractUrls } from "@/lib/url";
import { useBoard } from "@/store/board";
import { useGroupMode } from "@/store/groupMode";
import { useSelection } from "@/store/selection";

import ContextMenu, { type MenuEntry } from "./ContextMenu";
import GroupLasso from "./GroupLasso";
import FrameNode from "./nodes/FrameNode";
import ImageNode from "./nodes/ImageNode";
import LinkNode from "./nodes/LinkNode";
import NoteNode from "./nodes/NoteNode";
import PdfNode from "./nodes/PdfNode";
import type { AppNode, FrameNodeType, ItemNodeType } from "./nodes/types";
import { useBoardActions } from "./useBoardActions";
import { useIngest } from "./useIngest";

const nodeTypes = {
  link: LinkNode,
  pdf: PdfNode,
  image: ImageNode,
  note: NoteNode,
  frame: FrameNode,
};

/** 터치 기기이거나 화면이 좁으면 "모바일" — 올가미를 끄고 드래그는 팬으로 쓴다 */
const MOBILE_MQ = "(pointer: coarse), (max-width: 639px)";

function subscribeMobile(callback: () => void) {
  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function isMobileSnapshot() {
  return window.matchMedia(MOBILE_MQ).matches;
}

type MenuState =
  | { kind: "node"; id: string; x: number; y: number }
  | { kind: "edge"; id: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number; flow: Point };

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export default function Canvas({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();

  const items = useBoard((s) => s.items);
  const frames = useBoard((s) => s.frames);
  const edgeRows = useBoard((s) => s.edges);
  const itemTags = useBoard((s) => s.itemTags);
  const activeTagIds = useBoard((s) => s.activeTagIds);
  const signedUrls = useBoard((s) => s.signedUrls);
  const apply = useBoard((s) => s.apply);
  const applyLive = useBoard((s) => s.applyLive);
  const beginInteraction = useBoard((s) => s.beginInteraction);
  const endInteraction = useBoard((s) => s.endInteraction);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);

  const { addLinks, addFiles, addNote, addFrame } = useIngest();
  const { deleteSelected, duplicateSelected, deleteEdge, openItem } =
    useBoardActions();

  const groupLassoMode = useGroupMode((s) => s.mode);
  const setGroupMode = useGroupMode((s) => s.setMode);

  const selectedNodeIds = useSelection((s) => s.nodeIds);
  const selectedEdgeIds = useSelection((s) => s.edgeIds);
  const setSelectedNodeIds = useSelection((s) => s.setNodeIds);
  const setSelectedEdgeIds = useSelection((s) => s.setEdgeIds);

  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  /** 모바일(터치·좁은 화면)에서는 올가미 없음 — 드래그 = 팬. 화면 크기 변화에도 즉시 반응 */
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    isMobileSnapshot,
    () => false,
  );

  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /** 우클릭이 제자리 클릭(메뉴)이었는지 판단하기 위한 눌린 위치 */
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* --------------------------------------------------------------------- */
  /* 노드 / 엣지 유도                                                        */
  /* --------------------------------------------------------------------- */

  const dimmedIds = useMemo(() => {
    if (activeTagIds.length === 0) return null;
    const dimmed = new Set<string>();
    for (const item of Object.values(items)) {
      const tags = itemTags[item.id] ?? [];
      const matches = activeTagIds.every((t) => tags.includes(t));
      if (!matches) dimmed.add(item.id);
    }
    return dimmed;
  }, [activeTagIds, items, itemTags]);

  const nodes = useMemo<AppNode[]>(() => {
    const frameNodes: FrameNodeType[] = Object.values(frames).map((frame) => ({
      id: frame.id,
      type: "frame",
      position: { x: frame.x, y: frame.y },
      width: frame.w,
      height: frame.h,
      // measured 가 없으면 RF 가 노드 배열이 바뀔 때마다 "미측정" 상태로 되돌리고,
      // 미측정 노드는 올가미 판정에서 무조건 선택돼 버린다 (전체 선택 버그).
      measured: { width: frame.w, height: frame.h },
      selected: selectedNodeIds.has(frame.id),
      zIndex: 0,
      data: { frame },
    }));

    const itemNodes: ItemNodeType[] = Object.values(items)
      .filter((item) => item.status === "active")
      .map((item) => ({
        id: item.id,
        type: item.kind === "file" ? "link" : item.kind,
        position: { x: item.x, y: item.y },
        width: item.w,
        height: item.h,
        measured: { width: item.w, height: item.h },
        selected: selectedNodeIds.has(item.id),
        parentId: item.frame_id && frames[item.frame_id] ? item.frame_id : undefined,
        extent: item.frame_id && frames[item.frame_id] ? ("parent" as const) : undefined,
        zIndex: 1,
        data: {
          item,
          thumbUrl: item.thumb_path ? (signedUrls[item.thumb_path] ?? null) : null,
          dimmed: dimmedIds?.has(item.id) ?? false,
        },
      }));

    // 부모(프레임)가 배열에서 자식보다 앞에 와야 한다.
    return [...frameNodes, ...itemNodes];
  }, [frames, items, selectedNodeIds, signedUrls, dimmedIds]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      Object.values(edgeRows).map((edge) => ({
        id: edge.id,
        source: edge.source_item_id,
        target: edge.target_item_id,
        label: edge.label ?? undefined,
        selected: selectedEdgeIds.has(edge.id),
        markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a" },
        style: { stroke: "#71717a", strokeWidth: 1.5 },
      })),
    [edgeRows, selectedEdgeIds],
  );

  /* --------------------------------------------------------------------- */
  /* 변경 핸들러                                                             */
  /* --------------------------------------------------------------------- */

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      const selects = changes.filter((c) => c.type === "select");
      if (selects.length > 0) {
        const next = new Set(useSelection.getState().nodeIds);
        for (const c of selects) {
          if (c.type !== "select") continue;
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
        setSelectedNodeIds(next);
      }

      const geometry = changes.filter(
        (c) => c.type === "position" || c.type === "dimensions",
      );
      if (geometry.length === 0) return;

      applyLive((d) => {
        for (const change of geometry) {
          if (change.type === "position" && change.position) {
            const { x, y } = change.position;
            const item = d.items[change.id];
            if (item) {
              d.items[change.id] = { ...item, x, y };
              continue;
            }
            const frame = d.frames[change.id];
            if (frame) d.frames[change.id] = { ...frame, x, y };
          } else if (
            change.type === "dimensions" &&
            change.dimensions &&
            change.setAttributes
          ) {
            const { width, height } = change.dimensions;
            const item = d.items[change.id];
            if (item) {
              d.items[change.id] = { ...item, w: width, h: height };
              continue;
            }
            const frame = d.frames[change.id];
            if (frame) d.frames[change.id] = { ...frame, w: width, h: height };
          }
        }
      });
    },
    [applyLive, setSelectedNodeIds],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      const selects = changes.filter((c) => c.type === "select");
      if (selects.length === 0) return;

      const next = new Set(useSelection.getState().edgeIds);
      for (const c of selects) {
        if (c.type !== "select") continue;
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      setSelectedEdgeIds(next);
    },
    [setSelectedEdgeIds],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;

      const { boardId, userId, edges } = useBoard.getState();
      const exists = Object.values(edges).some(
        (e) => e.source_item_id === source && e.target_item_id === target,
      );
      if (exists) return;

      const edge: EdgeRow = {
        id: crypto.randomUUID(),
        board_id: boardId,
        user_id: userId,
        source_item_id: source,
        target_item_id: target,
        label: null,
        created_at: new Date().toISOString(),
      };
      apply((d) => {
        d.edges[edge.id] = edge;
      });
    },
    [apply],
  );

  /** 드래그가 끝나면 어느 프레임 위에 놓였는지 판정해서 소속을 바꾼다. */
  const settleDrag = useCallback(
    (dragged: AppNode[]) => {
      applyLive((d) => {
        for (const node of dragged) {
          if (node.type === "frame") continue;
          const item = d.items[node.id];
          if (!item) continue;

          const abs = absolutePosition(item, d.frames);
          const center = { x: abs.x + item.w / 2, y: abs.y + item.h / 2 };
          const target = frameAtPoint(Object.values(d.frames), center);
          const targetId = target?.id ?? null;
          if (targetId === item.frame_id) continue;

          const local = toLocal(abs, target);
          d.items[item.id] = {
            ...item,
            frame_id: targetId,
            x: local.x,
            y: local.y,
          };
        }
      });
      endInteraction();
    },
    [applyLive, endInteraction],
  );

  /* --------------------------------------------------------------------- */
  /* 붙여넣기 / 드롭 / 단축키                                                */
  /* --------------------------------------------------------------------- */

  const pointerFlowPosition = useCallback((): Point => {
    if (pointerRef.current) return screenToFlowPosition(pointerRef.current);
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    const { x, y, zoom } = getViewport();
    return { x: -x / zoom, y: -y / zoom };
  }, [screenToFlowPosition, getViewport]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;

      const at = pointerFlowPosition();

      const files = Array.from(data.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        addFiles(files, at);
        return;
      }

      const text = data.getData("text/plain") ?? "";
      const urls = extractUrls(text);
      if (urls.length > 0) {
        event.preventDefault();
        addLinks(urls, at);
        return;
      }

      if (text.trim()) {
        event.preventDefault();
        const note = addNote(at);
        useBoard.getState().apply((d) => {
          const target = d.items[note.id];
          if (target) d.items[note.id] = { ...target, note: text.trim() };
        });
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, addLinks, addNote, pointerFlowPosition]);

  /** 우클릭 메뉴의 "붙여넣기" — 클립보드 텍스트를 읽어 링크/메모 카드로 만든다. */
  const pasteFromClipboard = useCallback(
    async (at: Point) => {
      try {
        const text = await navigator.clipboard.readText();
        const urls = extractUrls(text);
        if (urls.length > 0) {
          addLinks(urls, at);
          return;
        }
        if (text.trim()) {
          const note = addNote(at);
          useBoard.getState().apply((d) => {
            const target = d.items[note.id];
            if (target) d.items[note.id] = { ...target, note: text.trim() };
          });
        }
      } catch {
        // 클립보드 권한이 없으면 조용히 무시한다 (Ctrl+V 는 여전히 동작)
      }
    },
    [addLinks, addNote],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenSearch();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key.toLowerCase() === "f" && !mod) {
        event.preventDefault();
        void fitView({
          duration: 300,
          padding: 0.25,
          nodes:
            selectedNodeIds.size > 0
              ? [...selectedNodeIds].map((id) => ({ id }))
              : undefined,
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    undo,
    redo,
    onOpenSearch,
    duplicateSelected,
    deleteSelected,
    fitView,
    selectedNodeIds,
  ]);

  /* --------------------------------------------------------------------- */
  /* 우클릭 메뉴                                                             */
  /* --------------------------------------------------------------------- */

  /** 우클릭을 누른 뒤 움직였다면 올가미 드래그였으므로 메뉴를 띄우지 않는다 */
  function rightDragMoved(x: number, y: number): boolean {
    const start = rightDownRef.current;
    return !!start && Math.hypot(x - start.x, y - start.y) > 6;
  }

  function menuEntries(current: MenuState): MenuEntry[] {
    if (current.kind === "pane") {
      const at = current.flow;
      return [
        { label: "메모 추가", onClick: () => void addNote(at) },
        { label: "그룹 추가", onClick: () => void addFrame(at) },
        { label: "붙여넣기", onClick: () => void pasteFromClipboard(at) },
        "divider",
        {
          label: "화면 맞추기",
          onClick: () => void fitView({ duration: 300, padding: 0.25 }),
        },
      ];
    }

    if (current.kind === "edge") {
      return [
        {
          label: "연결선 삭제",
          danger: true,
          onClick: () => deleteEdge(current.id),
        },
      ];
    }

    const count = Math.max(selectedNodeIds.size, 1);
    const item = items[current.id];
    const frame = frames[current.id];
    const entries: MenuEntry[] = [];

    if (count === 1 && item) {
      if (item.kind === "pdf" || item.kind === "image") {
        entries.push({ label: "열기", onClick: () => openItem(current.id) });
      } else if (item.url) {
        entries.push({ label: "원본 열기 ↗", onClick: () => openItem(current.id) });
      }
    }

    if (item || count > 1) {
      entries.push({
        label: count > 1 ? `복제 (${count})` : "복제",
        onClick: duplicateSelected,
      });
    }

    if (entries.length > 0) entries.push("divider");
    entries.push({
      label: count > 1 ? `삭제 (${count})` : frame ? "그룹 삭제" : "삭제",
      danger: true,
      onClick: deleteSelected,
    });
    return entries;
  }

  /* --------------------------------------------------------------------- */

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onMouseMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerDownCapture={(e) => {
        if (e.button === 2) rightDownRef.current = { x: e.clientX, y: e.clientY };
      }}
      onContextMenu={(e) => {
        if (isTypingTarget(e.target)) return; // 입력 중에는 브라우저 기본 메뉴
        e.preventDefault();

        const target = e.target as HTMLElement;
        if (!target.classList.contains("react-flow__pane")) return; // 노드/엣지는 RF 콜백이 처리
        if (rightDragMoved(e.clientX, e.clientY)) return; // 올가미 드래그 직후

        setMenu({
          kind: "pane",
          x: e.clientX,
          y: e.clientY,
          flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        });
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });

        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) {
          addFiles(files, at);
          return;
        }
        const text =
          e.dataTransfer.getData("text/uri-list") ||
          e.dataTransfer.getData("text/plain");
        const urls = extractUrls(text);
        if (urls.length > 0) addLinks(urls, at);
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains("react-flow__pane")) return;
        addNote(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
    >
      <ReactFlow<AppNode>
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={beginInteraction}
        onNodeDragStop={(_, __, dragged) => settleDrag(dragged)}
        onSelectionDragStart={beginInteraction}
        onSelectionDragStop={(_, dragged) => settleDrag(dragged)}
        onNodeContextMenu={(event, node) => {
          if (isTypingTarget(event.target)) return;
          event.preventDefault();
          if (rightDragMoved(event.clientX, event.clientY)) return; // 올가미 드래그 직후
          if (!useSelection.getState().nodeIds.has(node.id)) {
            setSelectedNodeIds(new Set([node.id]));
            setSelectedEdgeIds(new Set());
          }
          setMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          if (rightDragMoved(event.clientX, event.clientY)) return;
          setMenu({ kind: "edge", id: edge.id, x: event.clientX, y: event.clientY });
        }}
        onSelectionContextMenu={(event, selectedNodes) => {
          event.preventDefault();
          if (rightDragMoved(event.clientX, event.clientY)) return;
          const first = selectedNodes[0];
          if (!first) return;
          setMenu({ kind: "node", id: first.id, x: event.clientX, y: event.clientY });
        }}
        deleteKeyCode={null}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionKeyCode={null}
        /* Partial: 올가미에 조금이라도 걸친 카드는 선택된다 */
        selectionMode={SelectionMode.Partial}
        panOnDrag={isMobile ? true : [1]}
        selectionOnDrag={!isMobile && !groupLassoMode}
        panOnScroll
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        zoomOnPinch
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-parchment"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="#d9d9de"
        />
        {/* 좁은 화면에선 하단 액션 바와 겹치므로 숨긴다 (핀치 줌으로 대체) */}
        <Controls
          showInteractive={false}
          className="!bottom-5 !left-5 !hidden overflow-hidden rounded-apple-md border border-hairline sm:!flex"
        />
        <MiniMap
          pannable
          zoomable
          className="!bottom-5 !right-5 !hidden overflow-hidden rounded-apple-md border border-hairline lg:!block"
          maskColor="rgba(245,245,247,0.7)"
          nodeColor={(node) => (node.type === "frame" ? "#d2d2d7" : "#b8b8bd")}
        />
      </ReactFlow>

      {groupLassoMode && (
        <GroupLasso mode={groupLassoMode} onDone={() => setGroupMode(null)} />
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-5 z-10 flex items-center justify-center rounded-apple-lg border-2 border-dashed border-action bg-action/5">
          <span className="rounded-full bg-action px-4 py-2 text-[14px] text-white">
            여기에 놓으면 카드가 됩니다 (PDF · 이미지)
          </span>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menuEntries(menu)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
