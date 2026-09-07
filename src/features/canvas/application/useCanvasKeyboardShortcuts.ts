import { useEffect } from "react";

import { toAnimationTargetId, type ProjectDocument } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import type { EditorActions } from "@/store/editorStoreTypes.types.js";

import { editorModePolicy, ACTION_IDS } from "@/domain/editorModePolicy";

import { createAnimationAuthoringApi } from "@/features/animation";

import { toast } from "@/components/ui/use-toast";

import type { CanvasEditorSnapshot } from "./canvasApplication.types.js";
import type { WorkflowEvent } from "../domain/workflowContracts.types.js";
import type { RefObject } from "react";

type ToolShortcutKey = "b" | "c" | "w";
type MeshTool =
  "meshDeform" | "meshAdjust" | "meshAddVertex" | "meshRemoveVertex";

const KEY_TOOL_MAP: Readonly<Record<ToolShortcutKey, string>> = {
  b: ACTION_IDS.BONE_CREATE,
  c: ACTION_IDS.IK_CREATE,
  w: ACTION_IDS.WEIGHTS_EDIT,
};

const MESH_TOOL_ACTION_MAP: Readonly<Record<MeshTool, string>> = {
  meshDeform: ACTION_IDS.NODE_MESH_DEFORM,
  meshAdjust: ACTION_IDS.REMESH,
  meshAddVertex: ACTION_IDS.REMESH,
  meshRemoveVertex: ACTION_IDS.REMESH,
};

interface CanvasKeyboardShortcutsOptions {
  editorRef: RefObject<CanvasEditorSnapshot>;
  projectRef: RefObject<ProjectDocument>;
  setBrush: EditorActions["setBrush"];
  sendWorkflowEvent: (event: WorkflowEvent) => void;
  onRequestDelete: () => void;
}

function hasSelectedMesh(
  editorState: CanvasEditorSnapshot,
  project: ProjectDocument,
): boolean {
  const selectedId = editorState.selection?.[0];
  return !!project.nodes?.find(
    (node) =>
      node.id === selectedId &&
      node.type === "part" &&
      node.mesh?.vertices?.length,
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function isDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

export function useCanvasKeyboardShortcuts({
  editorRef,
  projectRef,
  setBrush,
  sendWorkflowEvent,
  onRequestDelete,
}: CanvasKeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (isDialogOpen()) return;

      const interactionOwner = useEditorStore.getState().interactionOwner;
      if (interactionOwner !== "canvas") return;

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const editorState = editorRef.current;
        const project = projectRef.current;
        const selectionTarget = editorState.selectionTarget ?? "all";

        const nodeIds = (project.nodes ?? [])
          .filter((n) => n.visible !== false)
          .map((n) => n.id);
        const boneIds = (project.bones ?? []).map((b) => b.id);
        const constraintIds = (project.constraints ?? []).map((c) => c.id);

        if (selectionTarget === "element") {
          useEditorStore.getState().setElementSelection(nodeIds);
        } else if (selectionTarget === "rig") {
          useEditorStore.getState().setRigSelection({
            elementIds: [],
            boneIds,
            constraintIds,
            activeBoneId: boneIds.at(-1) ?? null,
            activeConstraintId: constraintIds.at(-1) ?? null,
          });
        } else {
          useEditorStore.getState().setRigSelection({
            elementIds: nodeIds,
            boneIds,
            constraintIds,
            activeBoneId: boneIds.at(-1) ?? null,
            activeConstraintId: constraintIds.at(-1) ?? null,
          });
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (typeof onRequestDelete === "function") onRequestDelete();
        return;
      }

      if (e.key === "Alt" && !e.repeat) {
        e.preventDefault();
        sendWorkflowEvent({ type: "CYCLE_SELECTION_TARGET" });
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        sendWorkflowEvent({ type: "SET_TOOL", tool: "select" });
      } else if (key === "v") {
        e.preventDefault();
        sendWorkflowEvent({ type: "SET_TOOL", tool: "transform" });
      } else if (key === "p") {
        e.preventDefault();
        sendWorkflowEvent({ type: "SET_TOOL", tool: "pose" });
      } else if (["m", "a", "+", "="].includes(key)) {
        if (!hasSelectedMesh(editorRef.current, projectRef.current)) return;
        const tool =
          key === "m"
            ? "meshDeform"
            : key === "a"
              ? "meshAdjust"
              : "meshAddVertex";
        const decision = editorModePolicy({
          mode: editorRef.current.editorMode,
          actionId: MESH_TOOL_ACTION_MAP[tool],
          targetKind: "tool",
        });
        if (!decision.allowed) return;
        e.preventDefault();
        sendWorkflowEvent({ type: "SET_TOOL", tool });
      } else if (key === "-") {
        if (!hasSelectedMesh(editorRef.current, projectRef.current)) return;
        const decision = editorModePolicy({
          mode: editorRef.current.editorMode,
          actionId: MESH_TOOL_ACTION_MAP.meshRemoveVertex,
          targetKind: "tool",
        });
        if (!decision.allowed) return;
        e.preventDefault();
        sendWorkflowEvent({ type: "SET_TOOL", tool: "meshRemoveVertex" });
      } else if (key === "b" || key === "c" || key === "w") {
        const actionId = KEY_TOOL_MAP[key];
        const editorMode = editorRef.current.editorMode;
        const decision = editorModePolicy({
          mode: editorMode,
          actionId,
          targetKind: "tool",
        });
        if (!decision.allowed) return;
        if (key === "w") {
          if (!hasSelectedMesh(editorRef.current, projectRef.current)) return;
          const firstBoneId = projectRef.current.bones?.[0]?.id ?? null;
          if (!firstBoneId) return;
          const editorStore = useEditorStore.getState();
          if (!editorStore.weightPaintBoneId)
            editorStore.setWeightPaintBoneId(firstBoneId);
        }
        e.preventDefault();
        const toolMap: Readonly<Record<ToolShortcutKey, string>> = {
          b: "drawBone",
          c: "drawIk",
          w: "weightPaint",
        };
        sendWorkflowEvent({ type: "SET_TOOL", tool: toolMap[key] });
      } else if (e.key === "Escape") {
        e.preventDefault();
        sendWorkflowEvent({ type: "CLEAR_SELECTION" });
        sendWorkflowEvent({ type: "SET_TOOL", tool: "select" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editorRef, onRequestDelete, projectRef, sendWorkflowEvent]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (isDialogOpen()) return;
      const interactionOwner = useEditorStore.getState().interactionOwner;
      if (interactionOwner !== "canvas") return;

      const { meshEditMode, meshSubMode, blendShapeEditMode, brushSize } =
        editorRef.current;
      if (e.key === "[" || e.key === "]") {
        if ((!meshEditMode || meshSubMode !== "deform") && !blendShapeEditMode)
          return;
        if (e.key === "[") setBrush({ brushSize: Math.max(5, brushSize - 5) });
        else setBrush({ brushSize: Math.min(300, brushSize + 5) });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorRef, setBrush]);

  useEffect(() => {
    const authoringApi = createAnimationAuthoringApi();

    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      const isFrameStep = e.code === "Comma" || e.code === "Period";
      if (
        key !== "k" &&
        key !== "K" &&
        key !== "i" &&
        key !== "I" &&
        !isFrameStep
      )
        return;
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      if (isDialogOpen()) return;
      const animationState = useAnimationStore.getState();

      const project = projectRef.current;
      if (project.animations.length === 0) return;

      const animId =
        animationState.activeAnimationId ?? project.animations[0]?.id;
      if (!animId) return;

      if (isFrameStep) {
        if (e.ctrlKey || e.metaKey) return;
        const nextFrame =
          e.code === "Comma"
            ? Math.max(
                animationState.startFrame,
                Math.round(
                  (animationState.currentTime / 1000) * animationState.fps,
                ) - 1,
              )
            : Math.min(
                animationState.endFrame,
                Math.round(
                  (animationState.currentTime / 1000) * animationState.fps,
                ) + 1,
              );
        e.preventDefault();
        useAnimationStore.getState().seekFrame(nextFrame);
        return;
      }

      const interactionOwner = useEditorStore.getState().interactionOwner;
      if (interactionOwner !== "canvas") return;
      const editorState = editorRef.current;
      if (editorState.editorMode !== "animation") return;

      if (key === "i" || key === "I") {
        if (
          !authoringApi.hasActiveGesture() ||
          !animationState.draftDirty ||
          animationState.draftPose.size === 0
        )
          return;
        e.preventDefault();
        authoringApi.commitAndContinueGesture({ source: "in-air-key" });
        return;
      }

      let selectedIds = editorState.selection;
      if (selectedIds.length === 0) return;

      if (editorState.activeConstraintId) {
        selectedIds = Array.from(
          new Set([...selectedIds, editorState.activeConstraintId]),
        );
      }

      const result = authoringApi.keySelected({
        targetIds: selectedIds.map(toAnimationTargetId),
        source: "manual-key",
      });
      if (result?.changed) {
        const frame = Math.round(
          (animationState.currentTime / 1000) * animationState.fps,
        );
        const channels = [
          ...new Set(
            (result.committedAddresses ?? [])
              .map((address) => address.split("::")[1]?.split("@")[0])
              .filter((channel): channel is string => Boolean(channel)),
          ),
        ];
        toast({
          title: `Key added at frame ${frame}`,
          description:
            channels.length > 0
              ? `Keyed: ${channels.join(", ")}`
              : "Selected animation channels keyed.",
        });
      } else if (result?.error) {
        toast({
          variant: "destructive",
          title: "Key not added",
          description: result.error,
        });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorRef, projectRef]);
}
