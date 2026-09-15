// Public domain constants load before CanvasViewport, which reads editorStore.
export { CANVAS_DEFAULTS } from "@/features/canvas/domain/canvasDefaults.js";

// Canvas feature - WebGL viewport, gizmos, picking
export { CanvasViewport } from "@/features/canvas/composition/CanvasViewport.jsx";
export { EditorWorkflowContext } from "@/features/canvas/application/EditorWorkflowContext.js";
export {
  useWorkflowActor,
  useWorkflowSelector,
} from "@/features/canvas/application/useWorkflowActor.js";
export type { WorkflowEvent } from "@/features/canvas/domain/workflowContracts.types.js";
export {
  trySetBoneParent,
} from "@/features/canvas/domain/ikConstraintCreation.js";
export { WEIGHT_PAINT_MODES } from "@/features/canvas/domain/meshWeighting.js";
export {
  applyAutoMeshWeights,
  bindUnweightedVerticesToBone,
  computeMeshWeightStats,
  applyWeightBrush,
  unbindMeshFromBone,
} from "@/features/canvas/domain/meshWeighting.js";
export { analyzeMeshTopologyImpact } from "@/features/canvas/domain/meshTopologyCommands.js";
export { getBoneSegment } from "@/features/canvas/domain/picking.js";
export { buildFramePose } from "@/features/canvas/domain/framePose.js";
export {
  createFrameCaptureRequest,
} from "@/features/canvas/domain/frameCaptureContract.js";
