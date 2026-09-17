import type { EditorView } from "@/features/canvas/application/canvasRenderer.types.js";
import { createPixiSceneGateway } from "@/features/canvas/infrastructure/rendering/pixi/createPixiSceneGateway.js";

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
