import { useCallback, useRef } from "react";

import type { Bone, BoneId, Node } from "@kukla2d/contracts";

import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import type { WorkflowEvent } from "@/features/canvas";
import {
  assignNodeToBone,
  createBoneSetupFromNode,
  isNodeAssignedToBone,
} from "@/features/rigging";

import { uid } from "@/lib/uid";

import type { BoneTreeRow } from "../domain/buildBoneTreeRows.types.js";

interface SelectionModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface LayerPanelSelectionController {
  handleSelect: (id: string) => void;
  handleBoneSelect: (boneId: string, event?: SelectionModifiers) => void;
  handleConstraintSelect: (constraintId: string) => void;
  createBoneFromCurrentSelection: () => void;
}

interface LayerPanelSelectionOptions {
  bones: readonly Bone[];
  nodes: readonly Node[];
  boneTreeRows: readonly BoneTreeRow[];
  selection: readonly string[];
  updateProject: ProjectActions["updateProject"];
  setSelection: EditorStore["setSelection"];
  setActiveBoneId: EditorStore["setActiveBoneId"];
  setActiveConstraintId: EditorStore["setActiveConstraintId"];
  setRiggingMode: (mode: string) => void;
  setRiggingTool: (tool: string) => void;
  showSkeleton: boolean;
  setShowSkeleton: EditorStore["setShowSkeleton"];
  send: (event: WorkflowEvent) => void;
  expandGroup: (id: string) => void;
}

export function useLayerPanelSelection({
  bones,
  nodes,
  boneTreeRows,
  selection,
  updateProject,
  setSelection,
  setActiveBoneId,
  setActiveConstraintId,
  setRiggingMode,
  setRiggingTool,
  showSkeleton,
  setShowSkeleton,
  send,
  expandGroup,
}: LayerPanelSelectionOptions): LayerPanelSelectionController {
  const anchorBoneRef = useRef<string | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      setSelection([id]);
      send({ type: "SET_TOOL", tool: "transform" });
      const node = nodes.find((n) => n.id === id);
      if (node && node.type === "part" && showSkeleton) {
        setShowSkeleton(false);
      }
    },
    [nodes, send, setSelection, setShowSkeleton, showSkeleton],
  );

  const handleBoneSelect = useCallback(
    (boneId: string, ev?: SelectionModifiers) => {
      const visibleBoneIds = boneTreeRows
        .filter((r) => r.kind === "bone")
        .map((r) => String(r.bone.id));
      const enterBoneMode = () => {
        setRiggingMode("bones");
        setRiggingTool("select");
        setShowSkeleton(true);
      };

      if (ev?.shiftKey) {
        const anchor = anchorBoneRef.current;
        const aIdx = anchor ? visibleBoneIds.indexOf(anchor) : -1;
        const cIdx = visibleBoneIds.indexOf(boneId);
        if (aIdx < 0 || cIdx < 0) {
          setActiveBoneId(boneId);
          setSelection([boneId]);
          anchorBoneRef.current = boneId;
          enterBoneMode();
          send({ type: "SET_TOOL", tool: "transform" });
          return;
        }
        const [lo, hi] = aIdx <= cIdx ? [aIdx, cIdx] : [cIdx, aIdx];
        const range = visibleBoneIds.slice(lo, hi + 1);
        setActiveBoneId(boneId);
        setSelection(range);
        enterBoneMode();
        send({ type: "SET_TOOL", tool: "transform" });
        return;
      }

      if (ev?.ctrlKey || ev?.metaKey) {
        const cur = selection.filter((id) => visibleBoneIds.includes(id));
        let next: string[];
        if (cur.includes(boneId)) {
          next = cur.filter((id) => id !== boneId);
        } else {
          next = [...cur, boneId];
        }
        anchorBoneRef.current = boneId;
        if (next.length === 0) {
          setActiveBoneId(null);
          setSelection([]);
          return;
        }
        setActiveBoneId(boneId);
        setSelection(next);
        enterBoneMode();
        return;
      }

      setActiveBoneId(boneId);
      setSelection([boneId]);
      setRiggingMode("bones");
      setRiggingTool("select");
      setShowSkeleton(true);
      send({ type: "SET_TOOL", tool: "transform" });
      anchorBoneRef.current = boneId;
    },
    [
      boneTreeRows,
      selection,
      send,
      setActiveBoneId,
      setRiggingMode,
      setRiggingTool,
      setSelection,
      setShowSkeleton,
    ],
  );

  const handleConstraintSelect = useCallback(
    (constraintId: string) => {
      setActiveBoneId(null);
      setActiveConstraintId(constraintId);
      setSelection([constraintId]);
      send({ type: "SET_TOOL", tool: "transform" });
    },
    [send, setActiveBoneId, setActiveConstraintId, setSelection],
  );

  const createBoneFromCurrentSelection = useCallback(() => {
    const selectedNode = nodes.find((n) => n.id === selection[0]);
    if (!selectedNode) return;
    const existing = bones.find((b) => isNodeAssignedToBone(selectedNode, b));
    if (existing) {
      handleBoneSelect(existing.id);
      return;
    }
    const boneId = uid() as BoneId;
    updateProject((projectDraft) => {
      const source = projectDraft.nodes.find((n) => n.id === selectedNode.id);
      if (!source) return;
      const baseName = source.name || "Bone";
      projectDraft.bones.push({
        id: boneId,
        name: `${baseName} Bone`,
        parentId: null,
        nodeId: source.id,
        inherit: "normal",
        setup: createBoneSetupFromNode(source),
      });
      if (source.type === "part") assignNodeToBone(source, boneId);
    });
    expandGroup(`bone:${boneId}`);
    handleBoneSelect(boneId);
  }, [bones, expandGroup, handleBoneSelect, nodes, selection, updateProject]);

  return {
    handleSelect,
    handleBoneSelect,
    handleConstraintSelect,
    createBoneFromCurrentSelection,
  };
}
