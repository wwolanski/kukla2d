import type { EditorView } from "../../../application/canvasRenderer.types.js";

export interface PixiSceneGatewayOptions {
  canvas: HTMLCanvasElement;
  onViewChange?: (view: EditorView) => void;
  initialView?: EditorView;
}
