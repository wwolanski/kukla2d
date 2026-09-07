/**
 * Pan, zoom, and center commands with local drag-session ownership.
 */
import { useCallback, useRef } from "react";

import type { ViewTransform } from "../domain/coordinates.types.js";
import type { RefObject } from "react";

interface ZoomAtPointInput {
  view: ViewTransform | null;
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top">;
  deltaY: number;
}

interface PanSession {
  mode: "pan";
  startX: number;
  startY: number;
  panX0: number;
  panY0: number;
}

interface ViewportCommandsOptions {
  setView: (view: Partial<ViewTransform>) => void;
  getView: () => ViewTransform;
}
interface ViewportCommands {
  centerView: (
    contentWidth: number,
    contentHeight: number,
    canvas: HTMLCanvasElement | null,
  ) => void;
  zoomAtPoint: (input: ZoomAtPointInput) => ViewTransform | null;
  startPan: (clientX: number, clientY: number, view: ViewTransform) => void;
  updatePan: (
    clientX: number,
    clientY: number,
  ) => Pick<ViewTransform, "panX" | "panY"> | null;
  dragRef: RefObject<PanSession | null>;
}

export const ZOOM_FACTOR = 1.1;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

/**
 * Pure: clamp zoom to [MIN_ZOOM, MAX_ZOOM].
 */
export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/**
 * Pure: compute new view after zoom-at-point.
 * `view` = { zoom, panX, panY }, `clientX/Y` = pointer, `rect` = canvas getBoundingClientRect,
 * `deltaY` = wheel deltaY (negative = zoom in).
 */
export function computeZoomAtPoint({
  view,
  clientX,
  clientY,
  rect,
  deltaY,
}: ZoomAtPointInput): ViewTransform | null {
  if (!view) return null;
  const factor = deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
  const newZoom = clampZoom(view.zoom * factor);
  // anchor under cursor: world = (client - rect - pan) / zoom → newPan = (client - rect) - world * newZoom
  const worldX = (clientX - rect.left - view.panX) / view.zoom;
  const worldY = (clientY - rect.top - view.panY) / view.zoom;
  const newPanX = clientX - rect.left - worldX * newZoom;
  const newPanY = clientY - rect.top - worldY * newZoom;
  return { zoom: newZoom, panX: newPanX, panY: newPanY };
}

export function useViewportCommands({
  setView,
  getView: _getView,
}: ViewportCommandsOptions): ViewportCommands {
  void _getView;
  const dragRef = useRef<PanSession | null>(null);

  const centerView = useCallback(
    (contentW: number, contentH: number, canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const zoom =
        Math.min(
          canvas.clientWidth / contentW,
          canvas.clientHeight / contentH,
        ) * 0.95;
      const panX = (canvas.clientWidth - contentW * zoom) / 2;
      const panY = (canvas.clientHeight - contentH * zoom) / 2;
      setView({ zoom, panX, panY });
    },
    [setView],
  );

  const zoomAtPoint = useCallback(
    ({ view, clientX, clientY, rect, deltaY }: ZoomAtPointInput) => {
      return computeZoomAtPoint({ view, clientX, clientY, rect, deltaY });
    },
    [],
  );

  const startPan = useCallback(
    (clientX: number, clientY: number, view: ViewTransform) => {
      dragRef.current = {
        mode: "pan",
        startX: clientX,
        startY: clientY,
        panX0: view.panX,
        panY0: view.panY,
      };
    },
    [],
  );

  const updatePan = useCallback(
    (
      clientX: number,
      clientY: number,
    ): Pick<ViewTransform, "panX" | "panY"> | null => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== "pan") return null;
      return {
        panX: drag.panX0 + (clientX - drag.startX),
        panY: drag.panY0 + (clientY - drag.startY),
      };
    },
    [],
  );

  return { centerView, zoomAtPoint, startPan, updatePan, dragRef };
}

export const VIEWPORT_LIMITS = { ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM };
