/**
 * Owns export-frame and staging-thumbnail capture callbacks.
 *
 * The scene hook owns temporary export rendering and viewport restoration.
 */
import { useCallback } from "react";

import { toAnimationId, type ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";

import {
  createFrameCaptureRequest,
  createFrameCaptureSuccess,
  createFrameCaptureError,
  isFrameCaptureRequest,
} from "@/features/canvas/domain/frameCaptureContract.js";
import type {
  FrameCaptureRequest,
  FrameCaptureResult,
} from "@/features/canvas/domain/frameCaptureContract.types.js";

import type {
  CanvasEditorSnapshot,
  CanvasSceneGateway,
  CanvasFrameRenderOptions,
  CanvasRuntimeDependencies,
} from "./canvasApplication.types.js";
import type { RefObject } from "react";

interface CanvasCaptureOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  projectRef: RefObject<ProjectDocument>;
  editorRef: RefObject<CanvasEditorSnapshot>;
  animationRef: RefObject<AnimationStore>;
  captureFrame: CaptureCanvasFrame;
  sceneGatewayRef: RefObject<CanvasSceneGateway | null>;
  captureCanvasDataUrl: CanvasRuntimeDependencies["captureCanvasDataUrl"];
  imageDataToDataUrl: CanvasRuntimeDependencies["imageDataToDataUrl"];
}

type CaptureCanvasFrame = (options?: CanvasFrameRenderOptions) => void;

interface CanvasCaptureController {
  captureStaging: () => string | null;
  captureExportFrame: (request: unknown) => FrameCaptureResult;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCanvasCapture({
  canvasRef,
  projectRef,
  editorRef,
  animationRef,
  captureFrame,
  sceneGatewayRef,
  captureCanvasDataUrl,
  imageDataToDataUrl,
}: CanvasCaptureOptions): CanvasCaptureController {
  const captureExportFrame = useCallback(
    (request: unknown): FrameCaptureResult => {
      const canvas = canvasRef.current;
      if (!canvas)
        return createFrameCaptureError(
          "NO_CANVAS",
          "Canvas element not available",
        );

      let req: FrameCaptureRequest;
      try {
        req = isFrameCaptureRequest(request)
          ? request
          : createFrameCaptureRequest(request);
      } catch (err) {
        return createFrameCaptureError(
          "INVALID_REQUEST",
          errorMessage(err, "Invalid frame capture request"),
        );
      }

      const animState = animationRef?.current;

      const isolatedAnimationState = buildIsolatedAnimationState({
        baseState: animState,
        animationId: req.animationId ? toAnimationId(req.animationId) : null,
        timeMs: req.timeMs,
      });

      const overlayLayer = sceneGatewayRef?.current?.overlayLayer ?? null;
      const prevOverlayVisible = overlayLayer ? overlayLayer.visible : true;
      if (overlayLayer) overlayLayer.visible = false;

      let result: FrameCaptureResult;
      try {
        const project = projectRef?.current;
        const cropWidth =
          req.crop?.width ?? project?.canvas?.width ?? req.width;
        const scale = cropWidth > 0 ? req.width / cropWidth : 1;
        const viewOverride = {
          zoom: scale,
          panX: -(req.crop?.x ?? 0) * scale,
          panY: -(req.crop?.y ?? 0) * scale,
        };
        captureFrame({
          exportMode: true,
          skipResize: true,
          animationStateOverride: isolatedAnimationState,
          editorStateOverride: {
            ...editorRef?.current,
            editorMode: "animation",
          },
          includeTransientPose: false,
          viewOverride,
        });
        if (sceneGatewayRef?.current?.capture) {
          const imageData = sceneGatewayRef.current.capture({
            width: req.width,
            height: req.height,
          });
          if (imageData) {
            const dataUrl = imageDataToDataUrl(imageData, {
              format: `image/${req.format}`,
              quality: req.quality,
              bgEnabled: req.background.enabled,
              bgColor: req.background.color,
            });
            if (!dataUrl) {
              result = createFrameCaptureError(
                "CAPTURE_FAILED",
                "imageDataToDataUrl returned empty",
              );
            } else {
              result = createFrameCaptureSuccess(
                dataUrl,
                req.width,
                req.height,
              );
            }
          } else {
            result = buildFallbackCapture(canvas, req, captureCanvasDataUrl);
          }
        } else {
          result = buildFallbackCapture(canvas, req, captureCanvasDataUrl);
        }
      } catch (err) {
        result = createFrameCaptureError(
          "CAPTURE_FAILED",
          errorMessage(err, "Frame capture failed"),
        );
      } finally {
        try {
          captureFrame({ skipResize: false });
        } catch {
          // Preserve the primary result; the normal render loop will retry.
        }
        if (overlayLayer) overlayLayer.visible = prevOverlayVisible;
      }

      return result;
    },
    [
      animationRef,
      canvasRef,
      captureCanvasDataUrl,
      captureFrame,
      editorRef,
      imageDataToDataUrl,
      projectRef,
      sceneGatewayRef,
    ],
  );

  const captureStaging = useCallback(() => {
    const project = projectRef.current;
    const area = project?.canvas;
    if (!area || area.width <= 0 || area.height <= 0) return null;

    const width = Math.min(400, area.width);
    const height = Math.max(1, Math.round(area.height * (width / area.width)));
    const result = captureExportFrame({
      animationId: animationRef.current?.activeAnimationId ?? null,
      timeMs: animationRef.current?.currentTime ?? 0,
      width,
      height,
      format: "webp",
      quality: 0.8,
      background: { enabled: false, color: "#ffffff" },
      crop: {
        x: area.x ?? 0,
        y: area.y ?? 0,
        width: area.width,
        height: area.height,
      },
    });

    return result.ok ? result.dataUrl : null;
  }, [projectRef, animationRef, captureExportFrame]);

  return { captureStaging, captureExportFrame };
}

function buildIsolatedAnimationState({
  baseState,
  animationId,
  timeMs,
}: {
  baseState: AnimationStore;
  animationId: AnimationStore["activeAnimationId"];
  timeMs: number;
}): AnimationStore {
  return {
    ...baseState,
    activeAnimationId: animationId ?? baseState.activeAnimationId,
    currentTime: timeMs,
    isPlaying: false,
    draftPose: new Map(),
  };
}

function buildFallbackCapture(
  canvas: HTMLCanvasElement,
  req: FrameCaptureRequest,
  captureCanvasDataUrl: CanvasRuntimeDependencies["captureCanvasDataUrl"],
): FrameCaptureResult {
  const dataUrl = captureCanvasDataUrl(canvas, {
    format: `image/${req.format}`,
    quality: req.quality,
    bgEnabled: req.background.enabled,
    bgColor: req.background.color,
    width: req.width,
    height: req.height,
  });
  if (!dataUrl) {
    return createFrameCaptureError(
      "CAPTURE_FAILED",
      "captureCanvasDataUrl returned empty",
    );
  }
  return createFrameCaptureSuccess(dataUrl, req.width, req.height);
}
