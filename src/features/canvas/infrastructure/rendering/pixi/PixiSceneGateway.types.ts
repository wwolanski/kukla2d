import type { EditorView } from "@/features/canvas/application/canvasRenderer.types.js";

export interface PixiSceneGatewayOptions {
  canvas: HTMLCanvasElement;
  onViewChange?: (view: EditorView) => void;
  initialView?: EditorView;
}
