/**
 * Evaluated export bounds — 3B.
 *
 * Uses the same evaluator path as the frame renderer (buildFramePose) to
 * compute world-space union bounds of visible mesh vertices across all
 * requested frame specs. Used by the Export Area "Fit" command.
 *
 * Input: project, array of frame specs { animationId, timeMs }, optional padding
 * Output: { ok: true, area: { x, y, width, height } } | { ok: false, reason: string }
 *
 * No React, Zustand, DOM, Pixi, or Worker imports (C5).
 */

import type { ProjectDocument, Vertex } from "@kukla2d/contracts";

import { computeWorldMatrices } from "@/domain/transforms";
import type { Matrix3 } from "@/domain/transforms.types.js";

import { buildFramePose } from "@/features/canvas";

import type { ExportBoundsFrameSpec } from "./exportAreaFitFrameSpecs.types.js";

const DEFAULT_PADDING = 20;

interface ComputeEvaluatedExportBoundsOptions {
  project: ProjectDocument;
  frameSpecs: readonly ExportBoundsFrameSpec[];
  padding?: number;
}

type ExportBoundsResult =
  | { ok: true; area: { x: number; y: number; width: number; height: number } }
  | { ok: false; reason: "no-visible-content" };

function hasVertices(value: unknown): value is { vertices: Vertex[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { vertices?: unknown }).vertices)
  );
}

function transformPoint(matrix: Matrix3, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[3] * y + matrix[6],
    y: matrix[1] * x + matrix[4] * y + matrix[7],
  };
}

export function computeEvaluatedExportBounds({
  project,
  frameSpecs,
  padding = DEFAULT_PADDING,
}: ComputeEvaluatedExportBoundsOptions): ExportBoundsResult {
  if (!project?.nodes?.length) {
    return { ok: false, reason: "no-visible-content" };
  }

  if (!frameSpecs?.length) {
    return { ok: false, reason: "no-visible-content" };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let foundVisible = false;

  const editorState = { editorMode: "animation" };
  for (const spec of frameSpecs) {
    const animationState = {
      activeAnimationId: spec.animationId ?? null,
      currentTime: spec.timeMs ?? 0,
      fps:
        project.animations?.find((a) => a.id === spec.animationId)?.fps ?? 30,
      endFrame: 0,
      loopKeyframes: false,
      isPlaying: false,
      draftPose: new Map(),
    };

    const pose = buildFramePose({
      project,
      editorState,
      animationState,
    });

    const { effectiveNodes, effectiveMeshes } = pose;
    const worldMatrices = computeWorldMatrices(effectiveNodes);

    for (const node of effectiveNodes) {
      if (node.type !== "part") continue;
      if (node.visible === false) continue;

      const wm = worldMatrices.get(node.id);
      if (!wm) continue;

      const meshFrame = effectiveMeshes?.get(node.id);
      const vertices = hasVertices(meshFrame)
        ? meshFrame.vertices
        : node.mesh?.vertices;
      if (!vertices?.length) {
        const iw = node.imageWidth;
        const ih = node.imageHeight;
        if (!iw || !ih) continue;
        const corners = [
          [0, 0],
          [iw, 0],
          [iw, ih],
          [0, ih],
        ];
        for (const [vx, vy] of corners as Array<[number, number]>) {
          const p = transformPoint(wm, vx, vy);
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        foundVisible = true;
        continue;
      }

      for (const v of vertices) {
        const vx = v.x ?? v.restX ?? 0;
        const vy = v.y ?? v.restY ?? 0;
        const p = transformPoint(wm, vx, vy);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      foundVisible = true;
    }
  }

  if (!foundVisible || !isFinite(minX)) {
    return { ok: false, reason: "no-visible-content" };
  }

  return {
    ok: true,
    area: {
      x: Math.floor(minX - padding),
      y: Math.floor(minY - padding),
      width: Math.ceil(maxX - minX + padding * 2),
      height: Math.ceil(maxY - minY + padding * 2),
    },
  };
}
