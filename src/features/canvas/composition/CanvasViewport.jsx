import { CanvasViewportView } from "@/features/canvas/components/CanvasViewport.jsx";
import {
  captureCanvasDataUrl,
  imageDataToDataUrl,
} from "@/features/canvas/infrastructure/captureAdapter.js";
import { createMeshWorkerClient } from "@/features/canvas/infrastructure/meshWorkerClient.js";
import { createCanvasRenderer } from "@/features/canvas/infrastructure/rendering/createCanvasRenderer.js";
import { createTextureImageCache } from "@/features/canvas/infrastructure/textureImageCache.js";

const runtime = {
  captureCanvasDataUrl,
  createMeshWorkerClient,
  createRenderer: (options) => createCanvasRenderer(options),
  createTextureImageCache,
  imageDataToDataUrl,
};

export function CanvasViewport(props) {
  return <CanvasViewportView {...props} runtime={runtime} />;
}
