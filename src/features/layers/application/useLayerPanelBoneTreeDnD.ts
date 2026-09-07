import { useCallback, useRef } from "react";

import type { EditorStore } from "@/store/editorStoreTypes.types.js";
import type { ProjectActions } from "@/store/project/projectStoreTypes.types.js";

import { trySetBoneParent } from "@/features/canvas";
import {
  assignProjectNodeToBone,
  clearProjectNodeBoneAssignment,
  setBoneLinkLocked,
} from "@/features/rigging";

import { useToast } from "@/components/ui/use-toast";

import { useDragSession } from "./useDragSession.js";
import { isBoneDescendant } from "../domain/buildBoneTreeRows.js";

import type {
  DragSession,
  DragSourceKind,
  DragTargetKind,
} from "../domain/dragSession.types.js";

type BoneTreeDragSource = {
  kind: Extract<DragSourceKind, "node" | "bone">;
  id: string;
};

interface LayerPanelBoneTreeDndOptions {
  updateProject: ProjectActions["updateProject"];
  toggleGroupExpand: (id: string) => void;
  expandGroup: (id: string) => void;
  handleBoneSelect: (boneId: string) => void;
  editorMode: EditorStore["editorMode"];
  getDragImage: (() => HTMLCanvasElement | null) | undefined;
}
interface LayerPanelBoneTreeDndController {
  session: DragSession | null;
  onDragOver: (targetKind: DragTargetKind, targetId: string) => void;
  toggleExpand: (id: string) => void;
  toggleNodeLink: (nodeId: string, locked: boolean) => void;
  unassignNode: (nodeId: string) => void;
  detachBone: (boneId: string) => void;
  onBoneGroupDragStart: (
    event: React.DragEvent,
    kind: BoneTreeDragSource["kind"],
    id: string,
  ) => void;
  onBoneGroupDragEnd: () => void;
  onBoneGroupDrop: (targetKind: DragTargetKind, targetId: string) => void;
}

function getParentFailure(
  result: Exclude<ReturnType<typeof trySetBoneParent>, { ok: true }>,
): string {
  if ("reason" in result) return result.reason;
  return `${result.conflict.first.name} and ${result.conflict.second.name} would control the same bone chain`;
}

export function useLayerPanelBoneTreeDnD({
  updateProject,
  toggleGroupExpand,
  expandGroup,
  handleBoneSelect,
  editorMode,
  getDragImage,
}: LayerPanelBoneTreeDndOptions): LayerPanelBoneTreeDndController {
  const { toast } = useToast();
  const dragBoneGroupItem = useRef<BoneTreeDragSource | null>(null);
  const {
    session,
    onDragStart: sharedDragStart,
    onDragOver: sharedDragOver,
    clearSession,
  } = useDragSession(getDragImage);

  const toggleExpand = useCallback(
    (id: string) => {
      toggleGroupExpand(id);
    },
    [toggleGroupExpand],
  );

  const toggleNodeLink = useCallback(
    (nodeId: string, locked: boolean) => {
      if (editorMode === "animation") return;
      updateProject((projectDraft) => {
        const node = projectDraft.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        setBoneLinkLocked(node, locked);
      });
    },
    [editorMode, updateProject],
  );

  const unassignNode = useCallback(
    (nodeId: string) => {
      if (editorMode === "animation") return;
      updateProject((projectDraft) => {
        const node = projectDraft.nodes.find(
          (candidate) => candidate.id === nodeId,
        );
        if (node) clearProjectNodeBoneAssignment(projectDraft, node.id);
      });
    },
    [editorMode, updateProject],
  );

  const detachBone = useCallback(
    (boneId: string) => {
      if (editorMode === "animation") return;
      let failure: string | null = null;
      updateProject((projectDraft) => {
        const bone = projectDraft.bones.find(
          (candidate) => candidate.id === boneId,
        );
        if (!bone) {
          failure = "Bone not found";
          return;
        }
        const result = trySetBoneParent(projectDraft, bone.id, null);
        if (!result.ok) failure = getParentFailure(result);
      });
      if (failure) {
        toast({
          title: "Cannot detach bone",
          description: failure,
          variant: "destructive",
        });
        return;
      }
      handleBoneSelect(boneId);
    },
    [editorMode, handleBoneSelect, toast, updateProject],
  );

  const onBoneGroupDragStart = useCallback(
    (e: React.DragEvent, kind: BoneTreeDragSource["kind"], id: string) => {
      dragBoneGroupItem.current = { kind, id };
      sharedDragStart(e, kind, id);
    },
    [sharedDragStart],
  );

  const onBoneGroupDragEnd = useCallback(() => {
    dragBoneGroupItem.current = null;
    clearSession();
  }, [clearSession]);

  const onBoneGroupDragOver = useCallback(
    (targetKind: DragTargetKind, targetId: string) => {
      sharedDragOver(targetKind, targetId, "inside");
    },
    [sharedDragOver],
  );

  const onBoneGroupDrop = useCallback(
    (targetKind: DragTargetKind, targetId: string) => {
      const source = dragBoneGroupItem.current;
      dragBoneGroupItem.current = null;
      clearSession();
      if (!source || source.id === targetId) return;
      if (editorMode === "animation") return;

      if (targetKind === "unassigned" && source.kind === "node") {
        unassignNode(source.id);
        return;
      }

      if (targetKind === "root" && source.kind === "bone") {
        detachBone(source.id);
        return;
      }

      if (targetKind === "bone" && source.kind === "node") {
        updateProject((projectDraft) => {
          const node = projectDraft.nodes.find((n) => n.id === source.id);
          const bone = projectDraft.bones.find(
            (candidate) => candidate.id === targetId,
          );
          if (node?.type === "part" && bone)
            assignProjectNodeToBone(projectDraft, node.id, bone.id);
        });
        expandGroup(`bone:${targetId}`);
        handleBoneSelect(targetId);
        return;
      }

      if (targetKind === "bone" && source.kind === "bone") {
        let failure: string | null = null;
        updateProject((projectDraft) => {
          const sourceBone = projectDraft.bones.find(
            (candidate) => candidate.id === source.id,
          );
          const targetBone = projectDraft.bones.find(
            (candidate) => candidate.id === targetId,
          );
          if (!sourceBone || !targetBone) {
            failure = "Bone not found";
            return;
          }
          if (
            isBoneDescendant(projectDraft.bones, sourceBone.id, targetBone.id)
          )
            return;
          const result = trySetBoneParent(
            projectDraft,
            sourceBone.id,
            targetBone.id,
          );
          if (!result.ok) failure = getParentFailure(result);
        });
        if (failure) {
          toast({
            title: "Cannot reparent bone",
            description: failure,
            variant: "destructive",
          });
          return;
        }
        expandGroup(`bone:${targetId}`);
        handleBoneSelect(source.id);
      }
    },
    [
      clearSession,
      detachBone,
      editorMode,
      expandGroup,
      handleBoneSelect,
      toast,
      unassignNode,
      updateProject,
    ],
  );

  return {
    session,
    onDragOver: onBoneGroupDragOver,
    toggleExpand,
    toggleNodeLink,
    unassignNode,
    detachBone,
    onBoneGroupDragStart,
    onBoneGroupDragEnd,
    onBoneGroupDrop,
  };
}
