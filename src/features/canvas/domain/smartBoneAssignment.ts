import type { Node, NodeId } from "@kukla2d/contracts";

import { computeWorldMatrices, mat3Inverse } from "@/domain/transforms.js";

import { worldToLocal } from "@/features/canvas/domain/coordinates.js";
import { sampleAlpha } from "@/features/canvas/domain/picking.js";

const ALPHA_THRESHOLD = 5;

interface SmartAssignmentResult {
  nodeId: NodeId | null;
  coverage: number;
}

interface SmartAssignmentInput {
  nodes: readonly Node[];
  imageDataByPartId: ReadonlyMap<string, ImageData>;
  startWorldX: number;
  startWorldY: number;
  endWorldX: number;
  endWorldY: number;
  samples?: number;
}

export function findSmartBoneAssignmentCandidate({
  nodes,
  imageDataByPartId,
  startWorldX,
  startWorldY,
  endWorldX,
  endWorldY,
  samples = 11,
}: SmartAssignmentInput): SmartAssignmentResult {
  samples = Math.max(5, Math.min(25, samples));

  const parts = nodes.filter((node) => node.type === "part");
  const worldMatrices = computeWorldMatrices(nodes);

  let bestNodeId: NodeId | null = null;
  let bestCoverage = 0;

  for (const part of parts) {
    const id = part.id;
    const imageData = imageDataByPartId.get(id);
    const wm = worldMatrices.get(id);
    if (!imageData || !wm || !imageData.data) continue;

    const inv = mat3Inverse(wm);
    let hits = 0;

    for (let i = 0; i < samples; i++) {
      const t = samples === 1 ? 0 : i / (samples - 1);
      const worldX = startWorldX + (endWorldX - startWorldX) * t;
      const worldY = startWorldY + (endWorldY - startWorldY) * t;

      const [lx, ly] = worldToLocal(worldX, worldY, inv);
      if (sampleAlpha(imageData, lx, ly) > ALPHA_THRESHOLD) {
        hits++;
      }
    }

    const coverage = hits / samples;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestNodeId = id;
    }
  }

  return { nodeId: bestNodeId, coverage: bestCoverage };
}
