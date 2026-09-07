import type { Bone, BoneId, Node } from "@kukla2d/contracts";

import { editorModePolicy, ACTION_IDS } from "@/domain/editorModePolicy";
import { computeWorldMatrices } from "@/domain/transforms";

import { getNextBoneName } from "@/features/canvas/domain/boneNaming.js";
import { refreshIkTopology } from "@/features/canvas/domain/ikConstraintCreation.js";
import { findAlphaHit } from "@/features/canvas/domain/picking.js";
import { findSmartBoneAssignmentCandidate } from "@/features/canvas/domain/smartBoneAssignment.js";

import type { DragState } from "./pixiInteractionDragContracts.types.js";
import type { PixiInteractionSystem } from "./PixiInteractionSystem.js";

type DrawBoneDrag = Extract<DragState, { type: "drawBone" }>;

interface AssignmentCandidatesInput {
  nodes: readonly Node[];
  imageDataByPartId: ReadonlyMap<string, ImageData>;
  startWorldX: number;
  startWorldY: number;
  endWorldX: number;
  endWorldY: number;
  samples?: number;
}

export function findDrawnBoneAssignmentCandidates({
  nodes,
  imageDataByPartId,
  startWorldX,
  startWorldY,
  endWorldX,
  endWorldY,
  samples = 9,
}: AssignmentCandidatesInput): string[] {
  const parts = nodes.filter((node) => node.type === "part");
  const worldMatrices = computeWorldMatrices(nodes);
  const candidateIds = new Set<string>();
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const hit = findAlphaHit({
      parts,
      imageDataByPartId,
      worldMatrices,
      worldX: startWorldX + (endWorldX - startWorldX) * t,
      worldY: startWorldY + (endWorldY - startWorldY) * t,
    });
    if (hit) candidateIds.add(hit);
  }
  return [...candidateIds];
}

export function commitDrawnBone(
  adapter: PixiInteractionSystem,
  drag: DrawBoneDrag,
): void {
  const editor = adapter.editorRef.current;
  const decision = editorModePolicy({
    mode: editor.editorMode,
    actionId: ACTION_IDS.BONE_CREATE,
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
            "Structure changes are locked in Animation mode.",
        },
      },
    });
    adapter.markDirty?.();
    return;
  }
  if (
    Math.hypot(
      drag.endWorldX - drag.startWorldX,
      drag.endWorldY - drag.startWorldY,
    ) < 10
  )
    return;
  const id = createBoneId();
  adapter._executeCommand({
    type: "updateProject",
    payload: {
      mutator: (project) => {
        project.bones ??= [];
        project.bones.push(
          createBone(id, getNextBoneName(project.bones), drag),
        );
        refreshIkTopology(project);
      },
    },
  });
  adapter._executeCommand({
    type: "setRigSelection",
    payload: { boneIds: [id], activeBoneId: id, anchor: id },
  });
  if (!editor.drawBoneAutoAssign) return;
  const candidateNodeIds =
    editor.drawBoneAutoAssignMode === "smart"
      ? (() => {
          const result = findSmartBoneAssignmentCandidate({
            nodes: adapter.projectRef.current.nodes,
            imageDataByPartId: adapter.imageDataByPartId,
            ...drag,
          });
          return result.nodeId ? [result.nodeId] : [];
        })()
      : findDrawnBoneAssignmentCandidates({
          nodes: adapter.projectRef.current.nodes,
          imageDataByPartId: adapter.imageDataByPartId,
          ...drag,
        });
  if (candidateNodeIds.length > 0) {
    adapter._executeCommand({
      type: "setInteraction",
      payload: {
        interaction: {
          kind: "pendingAssignBone",
          boneId: id,
          candidateNodeIds,
        },
      },
    });
  }
}

function createBone(id: BoneId, name: string, drag: DrawBoneDrag): Bone {
  const dx = drag.endWorldX - drag.startWorldX;
  const dy = drag.endWorldY - drag.startWorldY;
  return {
    id,
    name,
    parentId: drag.parentId ?? null,
    nodeId: null,
    inherit: "normal",
    setup: {
      x: drag.startWorldX,
      y: drag.startWorldY,
      rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      length: Math.max(10, Math.hypot(dx, dy)),
    },
  };
}

/** Brand a freshly generated identifier at its creation boundary. */
function createBoneId(): BoneId {
  return Math.random().toString(36).slice(2, 9) as BoneId;
}
