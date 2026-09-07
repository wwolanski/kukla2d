import type {
  AnimationModifier,
  PartNode,
  ProjectDocument,
  Vertex,
} from "@kukla2d/contracts";

import type { AnimationState } from "@/store/animationStoreTypes.types.js";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

import { buildEffectiveNodes } from "@/features/canvas/domain/framePose.js";
import type { FramePose } from "@/features/canvas/domain/framePose.types.js";

import { evaluateEditorFramePose } from "./evaluateEditorFramePose.js";

import type { CanvasEditorSnapshot } from "./canvasApplication.types.js";
import type { PhysicsRuntime } from "./evaluateEditorFramePose.types.js";

function collectVisibleDescendantParts(
  project: ProjectDocument,
  parentId: string,
  result: PartNode[] = [],
): PartNode[] {
  for (const node of project.nodes ?? []) {
    if (node.parent !== parentId) continue;
    if (node.type === "part" && node.mesh) {
      result.push(node);
    } else if (
      (node.type === "group" || node.type === "warpDeformer") &&
      node.visible !== false
    ) {
      collectVisibleDescendantParts(project, node.id, result);
    }
  }
  return result;
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isVertexArray(value: unknown): value is Vertex[] {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        point !== null &&
        typeof point === "object" &&
        typeof (point as { x?: unknown }).x === "number" &&
        typeof (point as { y?: unknown }).y === "number",
    )
  );
}

export function applyWarpDeformerOverrides({
  project,
  poseOverrides,
}: {
  project: ProjectDocument;
  poseOverrides: PoseOverrides | null;
}): PoseOverrides | null {
  let finalOverrides: PoseOverrides | null = poseOverrides?.size
    ? new Map(poseOverrides)
    : null;

  for (const warpNode of project.nodes ?? []) {
    if (warpNode.type !== "warpDeformer") continue;
    const warpOverride = finalOverrides?.get(warpNode.id);
    const gridPoints = warpOverride?.mesh_verts;
    if (!isVertexArray(gridPoints) || gridPoints.length === 0) continue;

    const col = isPositiveFinite(warpNode.col) ? Math.floor(warpNode.col) : 2;
    const row = isPositiveFinite(warpNode.row) ? Math.floor(warpNode.row) : 2;
    const gridX =
      typeof warpNode.gridX === "number" && Number.isFinite(warpNode.gridX)
        ? warpNode.gridX
        : 0;
    const gridY =
      typeof warpNode.gridY === "number" && Number.isFinite(warpNode.gridY)
        ? warpNode.gridY
        : 0;
    const gridW = isPositiveFinite(warpNode.gridW) ? warpNode.gridW : 1;
    const gridH = isPositiveFinite(warpNode.gridH) ? warpNode.gridH : 1;
    const childParts = collectVisibleDescendantParts(project, warpNode.id);

    for (const child of childParts) {
      const restVerts = child.mesh?.vertices;
      if (!Array.isArray(restVerts) || restVerts.length === 0) continue;
      const currentOverride = finalOverrides?.get(child.id)?.mesh_verts;
      const currentVerts = isVertexArray(currentOverride)
        ? currentOverride
        : restVerts;
      const warped = restVerts.map((restVertex, vertexIndex) => {
        const px = restVertex.x ?? restVertex.restX;
        const py = restVertex.y ?? restVertex.restY;
        if (
          typeof px !== "number" ||
          !Number.isFinite(px) ||
          typeof py !== "number" ||
          !Number.isFinite(py)
        )
          return currentVerts[vertexIndex] ?? restVertex;
        const s = Math.max(0, Math.min(1, (px - gridX) / gridW));
        const t = Math.max(0, Math.min(1, (py - gridY) / gridH));
        const ci = Math.min(Math.floor(s * col), col - 1);
        const ri = Math.min(Math.floor(t * row), row - 1);
        const u = s * col - ci;
        const v = t * row - ri;
        const p00 = gridPoints[ri * (col + 1) + ci];
        const p10 = gridPoints[ri * (col + 1) + ci + 1];
        const p01 = gridPoints[(ri + 1) * (col + 1) + ci];
        const p11 = gridPoints[(ri + 1) * (col + 1) + ci + 1];
        const current = currentVerts[vertexIndex] ?? restVertex;
        if (!p00 || !p10 || !p01 || !p11) {
          return { x: current.x ?? px, y: current.y ?? py };
        }
        const tx =
          (1 - u) * (1 - v) * p00.x +
          u * (1 - v) * p10.x +
          (1 - u) * v * p01.x +
          u * v * p11.x;
        const ty =
          (1 - u) * (1 - v) * p00.y +
          u * (1 - v) * p10.y +
          (1 - u) * v * p01.y +
          u * v * p11.y;
        return {
          x: (current.x ?? px) + (tx - px),
          y: (current.y ?? py) + (ty - py),
        };
      });

      if (!finalOverrides) finalOverrides = new Map();
      const existing = finalOverrides.get(child.id) ?? {};
      finalOverrides.set(child.id, { ...existing, mesh_verts: warped });
    }
  }

  return finalOverrides;
}

export function composeCanvasFrameState({
  project,
  editorState,
  animationState,
  physicsRuntime,
  timestamp,
  previewModifierDraft,
}: {
  project: ProjectDocument;
  editorState: CanvasEditorSnapshot;
  animationState: AnimationState;
  physicsRuntime: PhysicsRuntime | null;
  timestamp: number;
  previewModifierDraft?: AnimationModifier | null;
}): FramePose {
  const framePose = evaluateEditorFramePose({
    project,
    editorState,
    animationState,
    physicsRuntime,
    timestamp,
    ...(previewModifierDraft === undefined ? {} : { previewModifierDraft }),
  });
  const poseOverrides = applyWarpDeformerOverrides({
    project,
    poseOverrides: framePose.poseOverrides,
  });
  return {
    ...framePose,
    poseOverrides,
    effectiveNodes: buildEffectiveNodes(project, poseOverrides),
  };
}
