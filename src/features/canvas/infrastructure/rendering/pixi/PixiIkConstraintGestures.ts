import type { Bone, Constraint, ConstraintId } from "@kukla2d/contracts";

import { computePoseOverrides } from "@/domain/animationEngine.js";
import { editorModePolicy, ACTION_IDS } from "@/domain/editorModePolicy";

import {
  assignConstraintToBone,
  createIkConstraint,
  findConstraintConflict,
  findNearestAvailableBoneTip,
} from "@/features/canvas/domain/ikConstraintCreation.js";
import {
  findBoneHit,
  findConstraintTargetHit,
} from "@/features/canvas/domain/picking.js";

import { getAdapterEffectiveRigState } from "./PixiInputState.js";
import { usesPoseDraft } from "./PixiPosePreview.js";

import type { PointerInput } from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

interface WorldPoint {
  x: number;
  y: number;
}

function getEffectiveBones(adapter: PixiInteractionSystem): Bone[] {
  return getAdapterEffectiveRigState(adapter).bones;
}

function getEffectiveConstraints(adapter: PixiInteractionSystem): Constraint[] {
  const project = adapter.projectRef.current;
  const editor = adapter.editorRef.current;
  const animation = adapter.animationRef.current;
  const activeAnimation =
    editor.editorMode === "animation"
      ? project.animations.find(
          (item) => item.id === animation?.activeAnimationId,
        )
      : null;
  const keyframes = activeAnimation
    ? computePoseOverrides(activeAnimation, animation?.currentTime ?? 0)
    : null;
  return (project.constraints ?? []).map((constraint) => ({
    ...constraint,
    ...(keyframes?.get(constraint.id) ?? {}),
    ...(animation?.draftPose?.get?.(constraint.id) ?? {}),
    ...(adapter.readFramePose?.()?.poseOverrides?.get?.(constraint.id) ?? {}),
  }));
}

export function handleIkPointerDown(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
): boolean {
  const editor = adapter.editorRef.current;
  const project = adapter.projectRef.current;
  if (editor.interaction?.kind === "pendingPickIKBone") {
    const interaction = editor.interaction;
    const effectiveBones = getEffectiveBones(adapter);
    const boneId = findBoneHit({
      bones: effectiveBones,
      worldX: world.x,
      worldY: world.y,
      zoom: editor.view.zoom,
    });
    if (!boneId) return true;
    const pendingConstraint = project.constraints.find(
      (item) => item.id === interaction.constraintId,
    );
    if (!pendingConstraint) return true;
    const conflict = findConstraintConflict(
      project.constraints ?? [],
      project.bones ?? [],
      boneId,
      pendingConstraint.id,
    );
    if (conflict) {
      adapter._executeCommand({
        type: "setInteraction",
        payload: {
          interaction: {
            ...interaction,
            error: `${conflict.name} already controls this bone chain`,
          },
        },
      });
      return true;
    }
    adapter._executeCommand({
      type: "updateProject",
      payload: {
        mutator: (project) => {
          const constraint = project.constraints?.find(
            (item) => item.id === pendingConstraint.id,
          );
          assignConstraintToBone(constraint, project.bones ?? [], boneId);
        },
      },
    });
    adapter._executeCommand({
      type: "setInteraction",
      payload: { interaction: { kind: "idle" } },
    });
    adapter._executeCommand({ type: "setHover", payload: { hit: null } });
    adapter.markDirty?.();
    return true;
  }
  if (editor.activeTool !== "drawIk") return false;

  const ikDecision = editorModePolicy({
    mode: editor.editorMode,
    actionId: ACTION_IDS.IK_CREATE,
    targetKind: "constraint",
  });
  if (!ikDecision.allowed) {
    adapter._executeCommand({
      type: "setInteraction",
      payload: {
        interaction: {
          kind: "canvasNotice",
          message:
            ikDecision.message ||
            "Structure changes are locked in Animation mode.",
        },
      },
    });
    adapter.markDirty?.();
    return true;
  }

  const nearest = findNearestAvailableBoneTip(
    getEffectiveBones(adapter),
    project.constraints ?? [],
    world.x,
    world.y,
  );
  if (!nearest) {
    adapter._executeCommand({
      type: "setInteraction",
      payload: {
        interaction: {
          kind: "ikNotice",
          message:
            (project.bones?.length ?? 0) === 0
              ? "Add a bone before creating an IK target"
              : "No available bone chain. Existing IK constraints already control every chain.",
        },
      },
    });
    return true;
  }

  const id = createConstraintId();
  const sequence =
    (project.constraints?.filter((item) => item.type === "ik").length ?? 0) + 1;
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        project.constraints ??= [];
        project.constraints.push(
          createIkConstraint({
            id,
            sequence,
            x: world.x,
            y: world.y,
            color: ikColor(sequence),
          }),
        );
      },
    },
  });
  adapter._executeCommand({
    type: "setInteraction",
    payload: {
      interaction: {
        kind: "pendingSuggestIKBone",
        constraintId: id,
        boneId: nearest.boneId,
      },
    },
  });
  adapter.markDirty?.();
  return true;
}

export function startIkTargetDrag(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  constraintId: ConstraintId,
): void {
  const constraint = getEffectiveConstraints(adapter).find(
    (item) => item.id === constraintId,
  );
  if (!constraint) return;
  const start = adapter._eventWorldPosition(event);
  if (!start) return;
  const editor = adapter.editorRef.current;
  const useDraftPose = usesPoseDraft(editor);
  const isAnimMode = editor.editorMode === "animation";
  if (!useDraftPose)
    adapter._beginCommandBatch({ name: "Move IK target", type: "ik" });
  const gestureId =
    isAnimMode && useDraftPose
      ? adapter.animationAuthoringAdapter?.beginGesture()
      : null;
  adapter._setDragState({
    type: "ikMove",
    constraintId,
    startWorldX: start.x,
    startWorldY: start.y,
    startX: constraint.targetX ?? 0,
    startY: constraint.targetY ?? 0,
    isAnimMode,
    useDraftPose,
    gestureId,
    setupEffectiveValues: { [constraintId]: constraint },
  });
  adapter._sendWorkflow({
    type: "START_TRANSFORM_DRAG",
    payload: { mode: "ikMove", constraintId },
  });
}

export function handleIkTargetSelection(
  adapter: PixiInteractionSystem,
  event: PointerInput,
  world: WorldPoint,
): boolean {
  const editor = adapter.editorRef.current;
  if (
    !["select", "transform", "pose"].includes(editor.activeTool ?? "") ||
    !["all", "rig"].includes(editor.selectionTarget ?? "element")
  )
    return false;
  const constraintId = findConstraintTargetHit({
    constraints: getEffectiveConstraints(adapter),
    worldX: world.x,
    worldY: world.y,
    zoom: editor.view.zoom,
  });
  if (!constraintId) return false;
  adapter._sendWorkflow({
    type: "SELECT_RIG_HIT",
    elementIds: [],
    boneIds: [],
    constraintIds: [constraintId],
    activeBoneId: null,
    activeConstraintId: constraintId,
    anchor: constraintId,
  });
  if (editor.activeTool === "transform" || editor.activeTool === "pose") {
    startIkTargetDrag(adapter, event, constraintId);
  }
  adapter.markDirty?.();
  return true;
}

export function handleIkPointerMove(
  adapter: PixiInteractionSystem,
  world: WorldPoint,
): boolean {
  const editor = adapter.editorRef.current;
  if (editor.interaction?.kind !== "pendingPickIKBone") return false;
  const boneId = findBoneHit({
    bones: getEffectiveBones(adapter),
    worldX: world.x,
    worldY: world.y,
    zoom: editor.view.zoom,
  });
  const hit = boneId ? `bone:${boneId}` : null;
  if (hit !== editor.hoverHit) {
    adapter._executeCommand({ type: "setHover", payload: { hit } });
    adapter.markDirty?.();
  }
  return true;
}

function ikColor(sequence: number): number {
  const hue = ((sequence - 1) * 137.508 + Math.random() * 24) % 360;
  const chroma = 0.72;
  const lightness = 0.62;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return (
    (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255)
  );
}

/** Brand a freshly generated identifier at its creation boundary. */
function createConstraintId(): ConstraintId {
  return Math.random().toString(36).slice(2, 9) as ConstraintId;
}
