import { CanvasViewportView } from "../components/CanvasViewport.jsx";
import {
  captureCanvasDataUrl,
  imageDataToDataUrl,
} from "../infrastructure/captureAdapter.js";
import { createMeshWorkerClient } from "../infrastructure/meshWorkerClient.js";
import { createCanvasRenderer } from "../infrastructure/rendering/createCanvasRenderer.js";
import { createTextureImageCache } from "../infrastructure/textureImageCache.js";

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
