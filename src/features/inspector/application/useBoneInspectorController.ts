import { useCallback, useMemo } from "react";

import type {
  AttachmentId,
  Bone,
  BoneId,
  BoneSetup,
  PartNode,
  SkinId,
  SlotId,
} from "@kukla2d/contracts";
import { toAnimationTargetId } from "@kukla2d/contracts";

import { useAnimationStore } from "@/store/animationStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

import { getFeedback } from "@/domain/editorModeFeedback";
import { REASON_CODES } from "@/domain/editorModePolicy";

import {
  inspectorClearPoseTarget,
  inspectorCommit,
  inspectorPosePreview,
  inspectorPreview,
} from "@/features/animation";
import {
  trySetBoneParent,
  useWorkflowActor,
  useWorkflowSelector,
} from "@/features/canvas";
import { assignProjectNodeToBone } from "@/features/rigging";

import { finiteNumberOrUndefined } from "@/lib/math";
import { uid } from "@/lib/uid.js";

import { useToast } from "@/components/ui/use-toast";

type EditableBoneSetupProperty =
  "x" | "y" | "rotation" | "scaleX" | "scaleY" | "length";

interface BoneInspectorController {
  activeBone: Bone | null;
  activeTool: string;
  riggingMode: string;
  editorMode: "staging" | "animation";
  editsPose: boolean;
  poseOverride: Record<string, unknown>;
  hasPoseOverride: boolean;
  referencePose: Partial<BoneSetup>;
  isStructureBlocked: boolean;
  structureFeedback: ReturnType<typeof getFeedback> | null;
  invalidParentIds: Set<string>;
  setRiggingMode: (mode: string) => void;
  renameBone: (id: string, name: string) => void;
  resetBonePose: (id: string) => void;
  updateBoneTransform: (
    property: EditableBoneSetupProperty,
    value: number,
  ) => void;
  changeBoneParent: (boneId: string, parentId: string | null) => void;
  deleteBone: (id: string) => void;
  attachSelectedPart: () => void;
  createSlotSkinAttachment: () => void;
}

interface BoneInspectorControllerOptions {
  bone: Bone | null;
  bones: readonly Bone[];
  selectedPart: PartNode | null;
  selectedLinkedBone: Bone | null;
}

function parentFailure(
  result: Exclude<ReturnType<typeof trySetBoneParent>, { ok: true }>,
): string {
  if ("reason" in result) return result.reason;
  return `${result.conflict.first.name} and ${result.conflict.second.name} would control the same bone chain`;
}

function collectDescendantBoneIds(
  bones: readonly Bone[],
  rootId: BoneId,
): Set<string> {
  const descendants = new Set<string>();
  const stack: BoneId[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    for (const bone of bones) {
      if (bone.parentId !== id || descendants.has(bone.id)) continue;
      descendants.add(bone.id);
      stack.push(bone.id);
    }
  }
  return descendants;
}

export function useBoneInspectorController({
  bone,
  bones,
  selectedPart,
  selectedLinkedBone,
}: BoneInspectorControllerOptions): BoneInspectorController {
  const { toast } = useToast();
  const updateProject = useProjectStore((state) => state.updateProject);
  const deleteSelectedBones = useProjectStore(
    (state) => state.deleteSelectedBones,
  );
  const defaultPose = useProjectStore((state) => state.project.defaultPose);
  const activeBoneId = useEditorStore((state) => state.activeBoneId);
  const setActiveBoneId = useEditorStore((state) => state.setActiveBoneId);
  const editorMode = useEditorStore((state) => state.editorMode);
  const setShowSkeleton = useEditorStore((state) => state.setShowSkeleton);
  const draftPose = useAnimationStore((state) => state.draftPose);
  const { send } = useWorkflowActor();
  const activeToolValue: unknown = useWorkflowSelector(
    (state: { context: { activeTool: string } }) => state.context.activeTool,
  );
  const riggingModeValue: unknown = useWorkflowSelector(
    (state: { context: { riggingMode: string } }) => state.context.riggingMode,
  );
  const activeTool =
    typeof activeToolValue === "string" ? activeToolValue : "select";
  const riggingMode =
    typeof riggingModeValue === "string" ? riggingModeValue : "off";
  const activeBone = bone ?? selectedLinkedBone;
  const editsPose = editorMode === "animation" || activeTool === "pose";
  const poseOverride = useMemo<Record<string, unknown>>(
    () =>
      activeBone
        ? {
            ...(defaultPose[activeBone.id] ?? {}),
            ...(draftPose.get(activeBone.id) ?? {}),
          }
        : {},
    [activeBone, defaultPose, draftPose],
  );
  const hasPoseOverride = Object.keys(poseOverride).length > 0;
  const isStructureBlocked = editorMode === "animation";
  const structureFeedback = isStructureBlocked
    ? getFeedback(REASON_CODES.STAGING_ONLY_STRUCTURE)
    : null;

  const setRiggingMode = useCallback(
    (mode: string) => {
      send({ type: "SET_RIGGING_MODE", riggingMode: mode });
    },
    [send],
  );

  const renameBone = useCallback(
    (id: string, name: string) => {
      updateProject((project) => {
        const target = project.bones.find((candidate) => candidate.id === id);
        if (target) target.name = name;
      });
    },
    [updateProject],
  );

  const resetBonePose = useCallback(
    (id: string) => {
      updateProject((project) => {
        if (!project.defaultPose[id]) return;
        const next = { ...project.defaultPose };
        delete next[id];
        project.defaultPose = next;
      });
      inspectorClearPoseTarget(toAnimationTargetId(id));
    },
    [updateProject],
  );

  const updateBoneTransform = useCallback(
    (property: EditableBoneSetupProperty, value: number) => {
      if (!activeBone) return;
      if (editorMode === "animation") {
        inspectorPreview(activeBone.id, property, value);
        inspectorCommit("gesture");
        return;
      }
      if (activeTool === "pose") {
        inspectorPosePreview(activeBone.id, property, value);
        return;
      }
      if (hasPoseOverride) return;
      inspectorClearPoseTarget(activeBone.id);
      updateProject((project) => {
        const target = project.bones.find(
          (candidate) => candidate.id === activeBone.id,
        );
        if (!target) return;
        for (const key of [
          "x",
          "y",
          "rotation",
          "scaleX",
          "scaleY",
          "length",
        ] as const) {
          const poseValue = finiteNumberOrUndefined(poseOverride[key]);
          if (poseValue !== undefined) target.setup[key] = poseValue;
        }
        target.setup[property] = value;
        if (project.defaultPose[activeBone.id]) {
          const next = { ...project.defaultPose };
          delete next[activeBone.id];
          project.defaultPose = next;
        }
      });
    },
    [
      activeBone,
      activeTool,
      editorMode,
      hasPoseOverride,
      poseOverride,
      updateProject,
    ],
  );

  const changeBoneParent = useCallback(
    (boneId: string, parentId: string | null) => {
      if (editorMode === "animation") return;
      let failure: string | null = null;
      updateProject((project) => {
        const target = project.bones.find(
          (candidate) => candidate.id === boneId,
        );
        const parent = parentId
          ? (project.bones.find((candidate) => candidate.id === parentId) ??
            null)
          : null;
        if (!target || (parentId && !parent)) {
          failure = "Bone not found";
          return;
        }
        const result = trySetBoneParent(project, target.id, parent?.id ?? null);
        if (!result.ok) failure = parentFailure(result);
      });
      if (failure)
        toast({
          title: "Cannot change bone parent",
          description: failure,
          variant: "destructive",
        });
    },
    [editorMode, toast, updateProject],
  );

  const deleteBone = useCallback(
    (id: string) => {
      if (editorMode === "animation") return;
      deleteSelectedBones([id]);
      if (activeBoneId === id) setActiveBoneId(null);
    },
    [activeBoneId, deleteSelectedBones, editorMode, setActiveBoneId],
  );

  const attachSelectedPart = useCallback(() => {
    if (!activeBone || !selectedPart || editorMode === "animation") return;
    updateProject((project) => {
      const part = project.nodes.find(
        (candidate) => candidate.id === selectedPart.id,
      );
      const targetBone = project.bones.find(
        (candidate) => candidate.id === activeBone.id,
      );
      if (part?.type === "part" && targetBone) {
        assignProjectNodeToBone(project, part.id, targetBone.id);
      }
    });
    setActiveBoneId(activeBone.id);
    setRiggingMode("bind");
    setShowSkeleton(true);
  }, [
    activeBone,
    editorMode,
    selectedPart,
    setActiveBoneId,
    setRiggingMode,
    setShowSkeleton,
    updateProject,
  ]);

  const createSlotSkinAttachment = useCallback(() => {
    if (!selectedPart || !activeBone || editorMode === "animation") return;
    updateProject((project) => {
      const targetBone = project.bones.find(
        (candidate) => candidate.id === activeBone.id,
      );
      const part = project.nodes.find(
        (candidate) => candidate.id === selectedPart.id,
      );
      if (!targetBone || part?.type !== "part") return;
      const alreadySlotted = project.slots.some(
        (slot) =>
          slot.boneId === targetBone.id &&
          slot.setupAttachmentId !== undefined &&
          slot.setupAttachmentId !== null &&
          project.attachments.some(
            (attachment) =>
              attachment.id === slot.setupAttachmentId &&
              attachment.assetId === part.id,
          ),
      );
      if (alreadySlotted) return;
      const attachmentId = uid() as AttachmentId;
      const slotId = uid() as SlotId;
      project.attachments.push({
        id: attachmentId,
        type: part.mesh ? "mesh" : "region",
        assetId: part.id,
      });
      project.slots.push({
        id: slotId,
        name: `${part.name} Slot`,
        boneId: targetBone.id,
        setupAttachmentId: attachmentId,
        blendMode: "normal",
        drawOrder: project.slots.length,
      });
      let skin = project.skins.find(
        (candidate) => candidate.name === "Default",
      );
      if (!skin) {
        skin = { id: uid() as SkinId, name: "Default", entries: [] };
        project.skins.push(skin);
      }
      skin.entries.push({ slotId, attachmentId });
    });
  }, [activeBone, editorMode, selectedPart, updateProject]);

  const invalidParentIds = useMemo(
    () =>
      activeBone
        ? collectDescendantBoneIds(bones, activeBone.id)
        : new Set<string>(),
    [activeBone, bones],
  );

  const referencePose: Partial<BoneSetup> = editsPose
    ? (activeBone?.setup ?? {})
    : {
        ...(activeBone?.setup ?? {}),
        ...Object.fromEntries(
          Object.entries(poseOverride).filter(
            (entry): entry is [string, number] =>
              finiteNumberOrUndefined(entry[1]) !== undefined,
          ),
        ),
      };

  return {
    activeBone,
    activeTool,
    riggingMode,
    editorMode,
    editsPose,
    poseOverride,
    hasPoseOverride,
    referencePose,
    isStructureBlocked,
    structureFeedback,
    invalidParentIds,
    setRiggingMode,
    renameBone,
    resetBonePose,
    updateBoneTransform,
    changeBoneParent,
    deleteBone,
    attachSelectedPart,
    createSlotSkinAttachment,
  };
}
