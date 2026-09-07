import { useCallback, useRef } from "react";

import type { Node, PartNode } from "@kukla2d/contracts";

import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import { useDragSession } from "./useDragSession.js";

import type { DragSession, DropPosition } from "../domain/dragSession.types.js";

interface LayerPanelDepthDndOptions {
  nodes: readonly Node[];
  selection: readonly string[];
  updateProject: ProjectActions["updateProject"];
  deleteNode: ProjectActions["deleteNode"];
  setSelection: EditorStore["setSelection"];
  editorMode: EditorStore["editorMode"];
  getDragImage: (() => HTMLCanvasElement | null) | undefined;
}
interface LayerPanelDepthDndController {
  session: DragSession | null;
  onDragStart: (event: React.DragEvent, nodeId: string) => void;
  onDragOver: (nodeId: string, dropPosition: DropPosition) => void;
  onDrop: (targetId: string, dropPosition?: DropPosition) => void;
  toggleVisible: (id: string) => void;
  handleDeleteNode: (nodeId: string) => void;
}

export function useLayerPanelDepthDnD({
  nodes,
  selection,
  updateProject,
  deleteNode,
  setSelection,
  editorMode,
  getDragImage,
}: LayerPanelDepthDndOptions): LayerPanelDepthDndController {
  const dragSourceIdDepth = useRef<string | null>(null);
  const {
    session,
    onDragStart: sharedDragStart,
    onDragOver: sharedDragOver,
    clearSession,
  } = useDragSession(getDragImage);

  const toggleVisible = useCallback(
    (id: string) => {
      updateProject((projectDraft) => {
        const node = projectDraft.nodes.find((n) => n.id === id);
        if (node) node.visible = node.visible === false ? true : false;
      });
    },
    [updateProject],
  );

  const onDragStartDepth = useCallback(
    (e: React.DragEvent, nodeId: string) => {
      dragSourceIdDepth.current = nodeId;
      sharedDragStart(e, "node", nodeId);
    },
    [sharedDragStart],
  );

  const onDragOverDepth = useCallback(
    (nodeId: string, dropPosition: DropPosition) => {
      sharedDragOver("node", nodeId, dropPosition);
    },
    [sharedDragOver],
  );

  const onDropDepth = useCallback(
    (targetId: string, dropPosition: DropPosition = "before") => {
      if (editorMode === "animation") return;
      const sourceId = dragSourceIdDepth.current;
      dragSourceIdDepth.current = null;
      clearSession();
      if (!sourceId || sourceId === targetId) return;

      updateProject((projectDraft) => {
        const parts = projectDraft.nodes
          .filter((node): node is PartNode => node.type === "part")
          .sort((a, b) => b.draw_order - a.draw_order);
        const sourceIdx = parts.findIndex((n) => n.id === sourceId);
        const targetIdx = parts.findIndex((n) => n.id === targetId);
        if (sourceIdx === -1 || targetIdx === -1) return;
        const [source] = parts.splice(sourceIdx, 1);
        if (!source) return;
        const newTargetIdx = parts.findIndex((n) => n.id === targetId);
        const insertIdx =
          dropPosition === "before" ? newTargetIdx : newTargetIdx + 1;
        parts.splice(insertIdx, 0, source);
        parts.forEach((part, i) => {
          const node = projectDraft.nodes.find((n) => n.id === part.id);
          if (node?.type === "part") node.draw_order = parts.length - 1 - i;
        });
      });
    },
    [clearSession, editorMode, updateProject],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (editorMode === "animation") return;
      const idsToDelete = new Set<string>();
      const collectRecursive = (id: string): void => {
        idsToDelete.add(id);
        nodes
          .filter((n) => n.parent === id)
          .forEach((c) => collectRecursive(c.id));
      };
      collectRecursive(nodeId);

      if (selection.some((id) => idsToDelete.has(id))) {
        setSelection([]);
      }

      deleteNode(nodeId);
    },
    [deleteNode, editorMode, nodes, selection, setSelection],
  );

  return {
    session,
    onDragStart: onDragStartDepth,
    onDragOver: onDragOverDepth,
    onDrop: onDropDepth,
    toggleVisible,
    handleDeleteNode,
  };
}
