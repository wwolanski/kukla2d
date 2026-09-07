/**
 * CanvasFrame DTO — data frame for Pixi canvas rendering.
 *
 * Accepts plain data only: no DOM, no stores, no refs.
 */

/**
 * @param {object} params
 * @param {object} params.project - project store snapshot
 * @param {object} params.editor - editor store snapshot
 * @param {boolean} params.isDark
 * @param {Map|null} params.poseOverrides
 * @param {Array} [params.effectiveNodes]
 * @param {{ width: number, height: number }} params.canvasSize
 * @param {object} [params.options]
 * @returns {object} CanvasFrame
 */
import type { Node, ProjectDocument } from "@kukla2d/contracts";

import type { PoseOverrides } from "@/domain/animationEngine.types.js";

interface CanvasFrameEditor {
  view: { zoom: number; panX: number; panY: number };
}

interface CanvasFrameOptions {
  [key: string]: unknown;
}

interface CanvasFrame {
  project: ProjectDocument;
  editor: CanvasFrameEditor;
  isDark: boolean;
  poseOverrides: PoseOverrides | null;
  effectiveNodes: Node[];
  canvasSize: { width: number; height: number };
  options: CanvasFrameOptions | undefined;
  view: CanvasFrameEditor["view"];
  nodes: Node[];
}

export function buildCanvasFrame({
  project,
  editor,
  isDark,
  poseOverrides,
  effectiveNodes,
  canvasSize,
  options,
}: {
  project: ProjectDocument;
  editor: CanvasFrameEditor;
  isDark: boolean;
  poseOverrides: PoseOverrides | null;
  effectiveNodes?: Node[];
  canvasSize: { width: number; height: number };
  options?: CanvasFrameOptions;
}): CanvasFrame {
  return {
    project,
    editor,
    isDark,
    poseOverrides,
    effectiveNodes: effectiveNodes ?? project.nodes,
    canvasSize,
    options,
    view: editor.view,
    nodes: project.nodes,
  };
}
