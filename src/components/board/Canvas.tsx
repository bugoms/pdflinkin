"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { absolutePosition, frameAtPoint, toLocal, type Point } from "@/lib/geometry";
import type { EdgeRow } from "@/lib/types";
import { extractUrls } from "@/lib/url";
import { useBoard } from "@/store/board";
import { useSelection } from "@/store/selection";

import FrameNode from "./nodes/FrameNode";
import ImageNode from "./nodes/ImageNode";
import LinkNode from "./nodes/LinkNode";
import NoteNode from "./nodes/NoteNode";
import PdfNode from "./nodes/PdfNode";
import type { AppNode, FrameNodeType, ItemNodeType } from "./nodes/types";
import { useIngest } from "./useIngest";

const nodeTypes = {
  link: LinkNode,
  pdf: PdfNode,
  image: ImageNode,
  note: NoteNode,
  frame: FrameNode,
};

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

  const { addLinks, addFiles, addNote } = useIngest();

  const selectedNodeIds = useSelection((s) => s.nodeIds);
  const selectedEdgeIds = useSelection((s) => s.edgeIds);
  const setSelectedNodeIds = useSelection((s) => s.setNodeIds);
  const setSelectedEdgeIds = useSelection((s) => s.setEdgeIds);

  const [dragOver, setDragOver] = useState(false);

  const pointerRef = useRef<{ x: number; y: number } | null>(null);
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

  const deleteSelected = useCallback(() => {
    const nodeIds = [...selectedNodeIds];
    const edgeIds = [...selectedEdgeIds];
    if (nodeIds.length === 0 && edgeIds.length === 0) return;

    apply((d) => {
      for (const id of nodeIds) {
        const frame = d.frames[id];
        if (frame) {
          // 프레임만 지우고 안의 카드는 절대좌표로 남긴다 (같이 지우지 않는다)
          for (const item of Object.values(d.items)) {
            if (item.frame_id !== frame.id) continue;
            d.items[item.id] = {
              ...item,
              frame_id: null,
              x: frame.x + item.x,
              y: frame.y + item.y,
            };
          }
          delete d.frames[id];
          continue;
        }

        const item = d.items[id];
        if (item) d.items[id] = { ...item, status: "trashed" };
      }

      for (const id of edgeIds) delete d.edges[id];

      // 휴지통으로 간 카드에 붙어 있던 연결선 정리
      for (const edge of Object.values(d.edges)) {
        const source = d.items[edge.source_item_id];
        const target = d.items[edge.target_item_id];
        if (
          !source ||
          source.status !== "active" ||
          !target ||
          target.status !== "active"
        ) {
          delete d.edges[edge.id];
        }
      }
    });

    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
  }, [
    apply,
    selectedNodeIds,
    selectedEdgeIds,
    setSelectedNodeIds,
    setSelectedEdgeIds,
  ]);

  const duplicateSelected = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    const created: string[] = [];

    apply((d) => {
      for (const id of selectedNodeIds) {
        const item = d.items[id];
        if (!item || item.status !== "active") continue;
        const copy = {
          ...item,
          id: crypto.randomUUID(),
          x: item.x + 24,
          y: item.y + 24,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        d.items[copy.id] = copy;
        created.push(copy.id);
      }
    });

    if (created.length > 0) setSelectedNodeIds(new Set(created));
  }, [apply, selectedNodeIds, setSelectedNodeIds]);

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

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onMouseMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
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
        deleteKeyCode={null}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        selectionKeyCode={null}
        panOnDrag={[0, 1]}
        selectionOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="#27272a"
        />
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 overflow-hidden rounded-lg border border-neutral-800"
        />
        <MiniMap
          pannable
          zoomable
          className="!bottom-4 !right-4 rounded-lg border border-neutral-800"
          maskColor="rgba(10,10,10,0.75)"
          nodeColor={(node) => (node.type === "frame" ? "#1e293b" : "#3f3f46")}
        />
      </ReactFlow>

      {dragOver && (
        <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-sky-500/70 bg-sky-500/5">
          <span className="rounded-lg bg-neutral-900/90 px-4 py-2 text-sm text-sky-300">
            여기에 놓으면 카드가 됩니다 (PDF · 이미지)
          </span>
        </div>
      )}
    </div>
  );
}
