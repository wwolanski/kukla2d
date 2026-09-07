import type { Bone, ConstraintId, Node } from "@kukla2d/contracts";

import type { Matrix3 } from "@/domain/transforms.types.js";

import type { MeshWeightStats } from "./meshWeighting.types.js";
import type { ScreenRect } from "./workflowContracts.types.js";

interface CanvasOverlayFrameTarget {
  id: ConstraintId;
  name: string;
  x: number;
  y: number;
  color: number;
  assigned: boolean;
  radius: number;
  selected: boolean;
  hovered: boolean;
}

interface CanvasIkPreview {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  alpha: number;
}

export interface CanvasOverlayFrame {
  selectedNodeId: string | null;
  hoverHit: string | null;
  weightPaintPartId: string | null;
  weightPaintBoneId: string | null;
  drawBonePreview: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
  marqueeWorldBox: ScreenRect | null;
  weightPaintOverlay: {
    visible: boolean;
    vertices: Array<{ x: number; y: number }>;
    triangles: number[][];
    weights: number[];
    selectedBoneId: string;
    stats: MeshWeightStats;
  } | null;
  weightPaintPoints: Array<{ x: number; y: number; weight: number }> | null;
  meshWireframe: {
    vertices: Array<{ x: number; y: number }>;
    triangles: number[][];
  } | null;
  ikOverlay: {
    targets: CanvasOverlayFrameTarget[];
    preview: CanvasIkPreview | null;
  };
  exportAreaFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
    valid: boolean;
  };
  brushCursor: { brushSize: number } | null;
  effectiveNodes: Node[];
  effectiveBones: Bone[];
  worldMatrices: ReadonlyMap<string, Matrix3>;
}
