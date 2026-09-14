import type { ProjectDocument, Vertex } from "@kukla2d/contracts";

import { buildFramePose } from "@/features/canvas/domain/framePose.js";

type PoseValue = Record<string, unknown>;
type DraftPose = ReadonlyMap<string, Readonly<PoseValue>>;

/**
 * Make the staged rig pose the new setup/bind state.
 * Bone, linked-node and mesh data are baked together.
 *
 * Uses the same deformation pipeline as the renderer (buildFramePose/effectiveMeshes)
 * so baked mesh vertices match the displayed frame.
 */
export function bakeDefaultPoseIntoSetup(
  project: ProjectDocument,
  draftPose: DraftPose,
): boolean {
  const authored = new Map<string, PoseValue>();
  for (const [targetId, partial] of Object.entries(project.defaultPose ?? {})) {
    authored.set(targetId, { ...(partial ?? {}) });
  }
  for (const [targetId, partial] of draftPose ?? []) {
    const existing = authored.get(targetId) ?? {};
    authored.set(targetId, { ...existing, ...(partial ?? {}) });
  }
  if (!authored.size) return false;

  const frame = buildFramePose({
    project,
    editorState: { editorMode: "staging" },
    animationState: {
      activeAnimationId: null,
      currentTime: 0,
      endFrame: 0,
      fps: 30,
      loopKeyframes: false,
      draftPose: authored,
    },
  });

  for (const bone of project.bones ?? []) {
    const effective = frame.effectiveBones.find(
      (candidate) => candidate.id === bone.id,
    );
    if (effective)
      bone.setup = { ...(bone.setup ?? {}), ...(effective.setup ?? {}) };
  }

  for (const constraint of project.constraints ?? []) {
    const override = authored.get(constraint.id);
    if (typeof override?.targetX === "number")
      constraint.targetX = override.targetX;
    if (typeof override?.targetY === "number")
      constraint.targetY = override.targetY;
    if (typeof override?.mix === "number") constraint.mix = override.mix;
    if (typeof override?.fkIk === "number") constraint.fkIk = override.fkIk;
    if (typeof override?.bendPositive === "boolean")
      constraint.bendPositive = override.bendPositive;
  }

  for (const node of project.nodes ?? []) {
    const effective = frame.effectiveNodes.find(
      (candidate) => candidate.id === node.id,
    );
    if (effective) {
      node.transform = {
        ...(node.transform ?? {}),
        ...(effective.transform ?? {}),
      };
      node.opacity = effective.opacity;
      node.visible = effective.visible;
    }
    const meshFrame = frame.effectiveMeshes?.get(node.id);
    if (node.type === "part" && node.mesh && meshFrame?.vertices) {
      node.mesh.vertices = meshFrame.vertices.map((vertex: Vertex) => ({
        ...vertex,
      }));
    }
  }

  project.defaultPose = {};
  return true;
}
