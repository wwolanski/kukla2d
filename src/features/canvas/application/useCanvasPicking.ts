import { useCallback, useRef } from "react";

import type { Node, PartNode, ProjectDocument } from "@kukla2d/contracts";

import type { AnimationStore } from "@/store/animationStoreTypes.types.js";
import type { EditorStore } from "@/store/editorStoreTypes.types.js";

import { computePoseOverrides } from "@/domain/animationEngine";
import { computeWorldMatrices } from "@/domain/transforms";

import type { ViewTransform } from "@/features/canvas/domain/coordinates.types.js";
import { findAlphaHit } from "@/features/canvas/domain/picking.js";

import type {
  CanvasSceneGateway,
  CanvasTextureCache,
  MutableRef,
} from "./canvasApplication.types.js";

type WorldMatrices = ReturnType<typeof computeWorldMatrices>;

interface ViewportBridge {
  toWorld(
    screenX: number,
    screenY: number,
  ): { x: number; y: number; 0?: number; 1?: number };
}

/**
 * Pure picking function — computes world coordinates, effective nodes
 * (with animation overrides), world matrices and alpha hit testing.
 *
 * Exported separately so it can be unit-tested without React.
 */
export function pickPartAtClientPoint({
  clientX,
  clientY,
  canvas,
  view,
  effectiveNodes,
  worldMatrices,
  imageDataMap,
  viewportBridge,
}: {
  clientX: number;
  clientY: number;
  canvas: HTMLCanvasElement | null | undefined;
  view: ViewTransform;
  effectiveNodes: Node[];
  worldMatrices: WorldMatrices;
  imageDataMap: ReadonlyMap<string, ImageData>;
  viewportBridge?: ViewportBridge | null;
}): string | null {
  if (!canvas) return null;

  let worldX, worldY;

  if (viewportBridge) {
    const rect = canvas.getBoundingClientRect();
    const result = viewportBridge.toWorld(
      clientX - rect.left,
      clientY - rect.top,
    );
    worldX = result.x ?? result[0] ?? 0;
    worldY = result.y ?? result[1] ?? 0;
  } else {
    const rect = canvas.getBoundingClientRect();
    worldX = (clientX - rect.left - view.panX) / view.zoom;
    worldY = (clientY - rect.top - view.panY) / view.zoom;
  }

  return findAlphaHit({
    parts: effectiveNodes.filter(
      (node): node is PartNode => node.type === "part",
    ),
    imageDataByPartId: imageDataMap,
    worldMatrices,
    worldX,
    worldY,
  });
}

/**
 * Unified picking hook for both legacy and Pixi backends.
 *
 * Encapsulates effective node computation (with animation overrides),
 * world-matrix computation and delegates to the pure pickPartAtClientPoint.
 */
export function useCanvasPicking({
  sceneGatewayRef,
  textureCache,
  projectRef,
  editorRef,
  animationRef,
}: {
  sceneGatewayRef: MutableRef<CanvasSceneGateway | null>;
  textureCache: CanvasTextureCache;
  projectRef: MutableRef<ProjectDocument>;
  editorRef: MutableRef<EditorStore>;
  animationRef: MutableRef<AnimationStore>;
}): {
  pickPartAtClientPoint: (clientX: number, clientY: number) => string | null;
} {
  const imageDataMapRef = useRef<Map<string, ImageData> | null>(null);
  if (!imageDataMapRef.current) {
    imageDataMapRef.current =
      textureCache?.__internal?.imageDataByPartId ?? new Map();
  }

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const editorState = editorRef.current;
      const project = projectRef.current;
      const animNow = animationRef.current;
      if (!editorState || !project || !animNow) return null;

      const { view } = editorState;
      const canvas = sceneGatewayRef.current?.canvas;
      const bridge = sceneGatewayRef.current?.viewportBridge;
      const renderedPose =
        sceneGatewayRef.current?.interactionSystem?.readFramePose?.();

      const isAnimMode = editorState.editorMode === "animation";
      const activeAnim = isAnimMode
        ? (project.animations.find(
            (animation) => animation.id === animNow.activeAnimationId,
          ) ?? null)
        : null;
      const kfOverrides = isAnimMode
        ? computePoseOverrides(activeAnim, animNow.currentTime)
        : null;
      const ANIM_TRANSFORM_KEYS = [
        "x",
        "y",
        "rotation",
        "scaleX",
        "scaleY",
      ] as const;

      const effectiveNodes =
        renderedPose?.effectiveNodes ??
        (isAnimMode && (kfOverrides?.size || animNow.draftPose.size)
          ? project.nodes.map((node) => {
              const keyframeOverride = kfOverrides?.get(node.id);
              const draftOverride = animNow.draftPose.get(node.id);
              if (!keyframeOverride && !draftOverride) return node;
              const tr = { ...node.transform };
              if (keyframeOverride) {
                for (const key of ANIM_TRANSFORM_KEYS) {
                  const value = keyframeOverride[key];
                  if (typeof value === "number") tr[key] = value;
                }
              }
              if (draftOverride) {
                for (const key of ANIM_TRANSFORM_KEYS) {
                  const value = draftOverride[key];
                  if (typeof value === "number") tr[key] = value;
                }
              }
              return {
                ...node,
                transform: tr,
                opacity:
                  typeof draftOverride?.opacity === "number"
                    ? draftOverride.opacity
                    : typeof keyframeOverride?.opacity === "number"
                      ? keyframeOverride.opacity
                      : node.opacity,
                visible:
                  typeof draftOverride?.visible === "boolean"
                    ? draftOverride.visible
                    : typeof keyframeOverride?.visible === "boolean"
                      ? keyframeOverride.visible
                      : node.visible,
              };
            })
          : project.nodes);

      const worldMatrices = computeWorldMatrices(effectiveNodes);

      return pickPartAtClientPoint({
        clientX,
        clientY,
        canvas,
        view,
        effectiveNodes,
        worldMatrices,
        imageDataMap: imageDataMapRef.current ?? new Map<string, ImageData>(),
        ...(bridge === undefined ? {} : { viewportBridge: bridge }),
      });
    },
    [sceneGatewayRef, projectRef, editorRef, animationRef],
  );

  return { pickPartAtClientPoint: pick };
}
