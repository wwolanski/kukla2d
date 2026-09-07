// Public domain constants load before CanvasViewport, which reads editorStore.
export { CANVAS_DEFAULTS } from "./domain/canvasDefaults.js";

// Canvas feature - WebGL viewport, gizmos, picking
export { CanvasViewport } from "./composition/CanvasViewport.jsx";
export { EditorWorkflowContext } from "./application/EditorWorkflowContext.js";
export {
  useWorkflowActor,
  useWorkflowSelector,
  useWorkflowSnapshot,
} from "./application/useWorkflowActor.js";
export type { WorkflowEvent } from "./domain/workflowContracts.types.js";
export {
  refreshIkTopology,
  trySetBoneParent,
} from "./domain/ikConstraintCreation.js";
export { WEIGHT_PAINT_MODES } from "./domain/meshWeighting.js";
export {
  applyAutoMeshWeights,
  bindUnweightedVerticesToBone,
  computeMeshWeightStats,
  unbindMeshFromBone,
} from "./domain/meshWeighting.js";
export { analyzeMeshTopologyImpact } from "./domain/meshTopologyCommands.js";
export { getBoneSegment } from "./domain/picking.js";
export { buildFramePose } from "./domain/framePose.js";
export { buildExportAreaOverlayFrame } from "./domain/canvasOverlayFrame.js";
export {
  createFrameCaptureRequest,
  createFrameCaptureSuccess,
  createFrameCaptureError,
  isFrameCaptureRequest,
  isFrameCaptureResult,
} from "./domain/frameCaptureContract.js";
