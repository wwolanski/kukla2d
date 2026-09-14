import { bindPixiInteractionEvents } from "@/features/canvas/infrastructure/rendering/pixi/bindPixiInteractionEvents.js";
import {
  handleCanvasGestureCancel,
  handleCanvasPointerDown,
  handleCanvasPointerLeave,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
} from "@/features/canvas/infrastructure/rendering/pixi/PixiCanvasGestures.js";
import {
  queueDragMove,
  handleDragEnd,
} from "@/features/canvas/infrastructure/rendering/pixi/PixiInputDrag.js";
import type { PixiInteractionSystem } from "@/features/canvas/infrastructure/rendering/pixi/PixiInteractionSystem.js";
import { isPointerInsideCanvas } from "@/features/canvas/infrastructure/rendering/pixi/PixiPointerBounds.js";

import type { FederatedPointerEvent } from "pixi.js";

export function bindPixiInteractionRuntimeEvents(
  system: PixiInteractionSystem,
): () => void {
  const pointerMove = (event: FederatedPointerEvent): void => {
    const app = system.viewportBridge?.app;
    if (
      !system._dragState &&
      !isPointerInsideCanvas(event, app?.canvas, app?.screen)
    )
      return;
    if (system._metrics) {
      const metrics = system._metrics;
      metrics.pointerEventsHandled++;
      const start = performance.now();
      system._updateBrushWorldPos(event);
      handleCanvasPointerMove(system, event);
      queueDragMove(system, event);
      metrics.pointerHandlerTotalMs += performance.now() - start;
      return;
    }
    system._updateBrushWorldPos(event);
    handleCanvasPointerMove(system, event);
    queueDragMove(system, event);
  };
  const pointerDown = (event: FederatedPointerEvent): void =>
    handleCanvasPointerDown(system, event);
  const pointerUp = (event: FederatedPointerEvent): void => {
    if (!handleCanvasPointerUp(system, event)) handleDragEnd(system);
  };
  const pointerUpOutside = (event: FederatedPointerEvent): void => {
    if (system._dragState?.type === "drawBone") {
      handleCanvasGestureCancel(system);
      return;
    }
    if (!handleCanvasPointerUp(system, event)) handleDragEnd(system);
  };
  const pointerCancel = (): void => system._cancelGesture();
  const windowBlur = (): void => system._cancelGesture();
  const pointerLeave = (): void => handleCanvasPointerLeave(system);
  return bindPixiInteractionEvents(
    system.viewportBridge?.app?.stage,
    system.viewportBridge?.app?.screen,
    {
      pointerDown,
      pointerMove,
      pointerUp,
      pointerUpOutside,
      pointerCancel,
      pointerLeave,
      windowBlur,
    },
  );
}
