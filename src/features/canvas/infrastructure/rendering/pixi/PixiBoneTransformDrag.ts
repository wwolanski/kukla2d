import type {
  Bone,
  BoneId,
  BoneSetup,
  ProjectDocument,
} from "@kukla2d/contracts";

import { editorModePolicy, ACTION_IDS } from "@/domain/editorModePolicy.js";

import {
  getEventClientPosition,
  getEventWorldPosition,
} from "./PixiInputDrag.js";
import { getAdapterEffectiveRigState } from "./PixiInputState.js";
import { canStartAnimationGesture, usesPoseDraft } from "./PixiPosePreview.js";

import type {
  EditorRuntimePort,
  PointerInput,
} from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

function selectedBoneIds(
  editor: EditorRuntimePort,
  project: ProjectDocument,
  activeBoneId: BoneId,
): BoneId[] {
  const selected = project.bones
    .filter((bone) => editor.selection.includes(bone.id))
    .map((bone) => bone.id);
  return selected.includes(activeBoneId) ? selected : [activeBoneId];
}

function snapshotBoneSet(
  effectiveBones: readonly Bone[],
  boneIds: readonly BoneId[],
): Record<string, Partial<BoneSetup>> {
  return Object.fromEntries(
    boneIds.map((id) => {
      const setup = effectiveBones.find((bone) => bone.id === id)?.setup ?? {};
      return [id, { ...setup }];
    }),
  );
}

function snapshotProjectBoneSet(
  project: ProjectDocument,
  boneIds: readonly BoneId[],
): Record<string, Partial<BoneSetup>> {
  return Object.fromEntries(
    boneIds.map((id) => {
      const setup = project.bones?.find((bone) => bone.id === id)?.setup ?? {};
      return [id, { ...setup }];
    }),
  );
}

export function startBoneDrag(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  boneId: BoneId,
): void {
  if (!boneId || !canStartAnimationGesture(adapter)) return;
  const editor = adapter.editorRef.current;
  if (editor.activeTool === "pose") return;
  const project = adapter.projectRef.current;
  if (!(project.bones ?? []).some((bone) => bone.id === boneId)) return;

  const boneIds = selectedBoneIds(editor, project, boneId);
  const start = getEventClientPosition(adapter, event);
  const startWorld = getEventWorldPosition(adapter, event);
  if (!startWorld) return;
  const startBones = snapshotBoneSet(
    getAdapterEffectiveRigState(adapter).bones,
    boneIds,
  );
  const useDraftPose = usesPoseDraft(editor);
  if (!useDraftPose)
    adapter._beginCommandBatch({ name: "Bone move", type: "bone" });
  const isAnimMode = editor.editorMode === "animation";
  const gestureId =
    isAnimMode && useDraftPose
      ? adapter.animationAuthoringAdapter?.beginGesture()
      : null;

  adapter._setDragState({
    type: "boneMove",
    boneId,
    boneIds,
    startBones,
    // clearSetupPoseTargets removes authored pose layers. It must restore raw
    // setup values, never constraint-resolved IK output (which would be solved
    // a second time and change the bind pose at every gesture).
    setupEffectiveValues: snapshotProjectBoneSet(project, boneIds),
    startClientX: start.x,
    startClientY: start.y,
    startWorldX: startWorld.x,
    startWorldY: startWorld.y,
    isAnimMode,
    useDraftPose,
    gestureId,
    lastDx: 0,
    lastDy: 0,
  });
  adapter._sendWorkflow({
    type: "START_TRANSFORM_DRAG",
    payload: { mode: "boneMove", boneId },
  });
}

export function startBoneRotate(
  adapter: PixiInteractionSystem,
  event: PointerInput,
): void {
  if (!canStartAnimationGesture(adapter)) return;
  const editor = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  const bone = project.bones.find(
    (candidate) => candidate.id === editor.activeBoneId,
  );
  if (!bone) return;
  const boneId = bone.id;

  const effectiveBones = getAdapterEffectiveRigState(adapter).bones;
  if (!effectiveBones.some((bone) => bone.id === boneId)) return;
  const boneIds = selectedBoneIds(editor, project, boneId);
  const startBones = snapshotBoneSet(effectiveBones, boneIds);
  const selectedBones = boneIds.flatMap((id) => {
    const setup = startBones[id];
    return setup ? [setup] : [];
  });
  if (!selectedBones.length) return;
  const pivotX =
    selectedBones.reduce((sum, setup) => sum + (setup.x ?? 0), 0) /
    selectedBones.length;
  const pivotY =
    selectedBones.reduce((sum, setup) => sum + (setup.y ?? 0), 0) /
    selectedBones.length;
  const world = getEventWorldPosition(adapter, event);
  if (!world) return;
  const useDraftPose = usesPoseDraft(editor);
  if (!useDraftPose)
    adapter._beginCommandBatch({ name: "Bone rotate", type: "bone" });
  const isAnimMode = editor.editorMode === "animation";
  const gestureId =
    isAnimMode && useDraftPose
      ? adapter.animationAuthoringAdapter?.beginGesture()
      : null;

  adapter._setDragState({
    type: "boneRotate",
    boneId,
    boneIds,
    startBones,
    setupEffectiveValues: snapshotProjectBoneSet(project, boneIds),
    pivotX,
    pivotY,
    startAngle: Math.atan2(world.y - pivotY, world.x - pivotX),
    isAnimMode,
    useDraftPose,
    gestureId,
    lastDelta: 0,
  });
  adapter._sendWorkflow({
    type: "START_TRANSFORM_DRAG",
    payload: { mode: "boneRotate", boneId },
  });
}

export function startBoneLength(
  adapter: PixiInteractionSystem,
  event: PointerInput,
): void {
  if (!canStartAnimationGesture(adapter)) return;
  const editor = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  const projectBone = project.bones.find(
    (candidate) => candidate.id === editor.activeBoneId,
  );
  if (!projectBone) return;
  const boneId = projectBone.id;

  const decision = editorModePolicy({
    mode: editor.editorMode,
    actionId: ACTION_IDS.BONE_LENGTH,
    targetKind: "bone",
  });
  if (!decision.allowed) {
    adapter._executeCommand({
      type: "setInteraction",
      payload: {
        interaction: {
          kind: "canvasNotice",
          message:
            decision.message ||
            "Bone length defines the Staging rig. Use Scale X to animate stretch.",
        },
      },
    });
    adapter.markDirty?.();
    return;
  }

  const effectiveBones = getAdapterEffectiveRigState(adapter).bones;
  const bone = effectiveBones.find((candidate) => candidate.id === boneId);
  if (!bone) return;
  const boneIds = selectedBoneIds(editor, project, boneId);
  const startLengths = Object.fromEntries(
    boneIds.map((id) => [
      id,
      effectiveBones.find((candidate) => candidate.id === id)?.setup?.length ??
        80,
    ]),
  );
  const start = getEventClientPosition(adapter, event);
  const startWorld = getEventWorldPosition(adapter, event);
  if (!startWorld) return;
  const useDraftPose = usesPoseDraft(editor);
  if (!useDraftPose)
    adapter._beginCommandBatch({ name: "Bone length", type: "bone" });
  const isAnimMode = editor.editorMode === "animation";
  const gestureId =
    isAnimMode && useDraftPose
      ? adapter.animationAuthoringAdapter?.beginGesture()
      : null;
  const radians = ((bone.setup?.rotation ?? 0) * Math.PI) / 180;

  adapter._setDragState({
    type: "boneLength",
    boneId,
    boneIds,
    startLengths,
    setupEffectiveValues: snapshotProjectBoneSet(project, boneIds),
    pivotX: bone.setup?.x ?? 0,
    pivotY: bone.setup?.y ?? 0,
    startLength: bone.setup?.length ?? 80,
    axisX: Math.cos(radians),
    axisY: Math.sin(radians),
    startClientX: start.x,
    startClientY: start.y,
    startWorldX: startWorld.x,
    startWorldY: startWorld.y,
    isAnimMode,
    useDraftPose,
    gestureId,
  });
  adapter._sendWorkflow({
    type: "START_TRANSFORM_DRAG",
    payload: { mode: "boneLength", boneId },
  });
}
