import { clearDefaultPoseTarget } from "@/features/canvas/domain/poseModel.js";

import type { EditorRuntimePort } from "./pixiInteractionContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";
import type { CanvasDraftPoseValue } from "../../../application/canvasRenderer.types.js";

export function usesPoseDraft(
  editor: Pick<EditorRuntimePort, "editorMode" | "activeTool">,
): boolean {
  return editor?.editorMode === "animation" || editor?.activeTool === "pose";
}

export function previewPosePartial(
  adapter: PixiInteractionSystem,
  targetId: string,
  partial: CanvasDraftPoseValue,
  meta?: Record<string, unknown>,
): unknown {
  const editor = adapter.editorRef.current;
  if (
    editor?.editorMode === "animation" &&
    adapter.animationAuthoringAdapter?.previewPartial
  ) {
    return adapter.animationAuthoringAdapter.previewPartial(
      targetId,
      partial,
      meta,
    );
  }
  adapter.animationRef.current?.setDraftPose?.(targetId, partial);
  return { valid: true };
}

export function canStartAnimationGesture(
  adapter: PixiInteractionSystem,
): boolean {
  const editor = adapter.editorRef.current;
  if (editor?.editorMode !== "animation") {
    const animation = adapter.animationRef.current;
    const hasPose =
      (animation?.draftPose?.size ?? 0) > 0 ||
      Object.keys(adapter.projectRef.current?.defaultPose ?? {}).length > 0;
    if (editor?.activeTool !== "pose" && hasPose) {
      adapter._executeCommand({
        type: "setInteraction",
        payload: {
          interaction: {
            kind: "canvasNotice",
            message: "Apply or reset the pose before editing setup.",
          },
        },
      });
      adapter.markDirty?.();
      return false;
    }
    return true;
  }

  const animationId = adapter.animationRef.current?.activeAnimationId;
  const hasActiveClip =
    !!animationId &&
    (adapter.projectRef.current?.animations ?? []).some(
      (animation) => animation.id === animationId,
    );
  if (hasActiveClip) return true;

  adapter._executeCommand({
    type: "setInteraction",
    payload: {
      interaction: {
        kind: "canvasNotice",
        message: "Select or create an animation clip before editing the pose.",
      },
    },
  });
  adapter.markDirty?.();
  return false;
}

/**
 * Transform mode edits setup/rest data. Before such an edit, bake from the
 * currently displayed value and remove pose layers that would mask the setup.
 */
export function clearSetupPoseTargets(
  adapter: PixiInteractionSystem,
  targetIds: readonly string[],
  effectiveValues: Record<string, object> = {},
): void {
  const editor = adapter.editorRef.current;
  if (editor?.editorMode === "animation" || editor?.activeTool === "pose")
    return;
  const ids = [...new Set((targetIds ?? []).filter(Boolean))];
  if (!ids.length) return;

  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        for (const id of ids) {
          const displayed = effectiveValues[id];
          const bone = project.bones?.find((candidate) => candidate.id === id);
          if (bone && displayed) {
            for (const key of [
              "x",
              "y",
              "rotation",
              "scaleX",
              "scaleY",
              "length",
            ] as const) {
              const value = readProperty(displayed, key);
              if (typeof value === "number") bone.setup[key] = value;
            }
          }
          const constraint = project.constraints?.find(
            (candidate) => candidate.id === id,
          );
          if (constraint && displayed) {
            const targetX = readProperty(displayed, "targetX");
            const targetY = readProperty(displayed, "targetY");
            const mix = readProperty(displayed, "mix");
            const fkIk = readProperty(displayed, "fkIk");
            const bendPositive = readProperty(displayed, "bendPositive");
            if (typeof targetX === "number") constraint.targetX = targetX;
            if (typeof targetY === "number") constraint.targetY = targetY;
            if (typeof mix === "number") constraint.mix = mix;
            if (typeof fkIk === "number") constraint.fkIk = fkIk;
            if (typeof bendPositive === "boolean")
              constraint.bendPositive = bendPositive;
          }
          clearDefaultPoseTarget(project, id);
        }
      },
    },
  });
  for (const id of ids) {
    adapter.animationRef.current?.clearDraftPoseForNode?.(id);
  }
}

function readProperty(value: object, property: string): unknown {
  return property in value ? value[property as keyof typeof value] : undefined;
}
