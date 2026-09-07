import { createPixiSceneGateway } from "./pixi/createPixiSceneGateway.js";

import type { EditorView } from "../../application/canvasRenderer.types.js";

interface CreateCanvasRendererOptions {
  canvas: HTMLCanvasElement;
  onViewChange?: (view: EditorView) => void;
  initialView?: EditorView;
}

/** Create canvas renderer. Pixi is the sole runtime backend. */
export function createCanvasRenderer(
  options: CreateCanvasRendererOptions,
): ReturnType<typeof createPixiSceneGateway> {
  return createPixiSceneGateway(options);
}
