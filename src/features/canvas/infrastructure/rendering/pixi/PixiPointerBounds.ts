import type { PointerInput } from "./pixiInteractionContracts.types.js";

interface CanvasSize {
  width?: number;
  height?: number;
}

export function getPointerClientPosition(
  event: PointerInput,
  rect: DOMRect,
): { clientX: number; clientY: number } | null {
  if (!rect) return null;
  const direct =
    readClientCoordinates(event?.nativeEvent) ??
    readClientCoordinates(event?.originalEvent) ??
    readClientCoordinates(event);
  const global = event?.global;
  const clientX = direct
    ? direct.clientX
    : global
      ? rect.left + global.x
      : null;
  const clientY = direct ? direct.clientY : global ? rect.top + global.y : null;
  return typeof clientX === "number" &&
    Number.isFinite(clientX) &&
    typeof clientY === "number" &&
    Number.isFinite(clientY)
    ? { clientX, clientY }
    : null;
}

export function readClientCoordinates(
  value: unknown,
): { clientX: number; clientY: number } | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("clientX" in value) ||
    !("clientY" in value)
  )
    return null;
  const { clientX, clientY } = value;
  return typeof clientX === "number" &&
    Number.isFinite(clientX) &&
    typeof clientY === "number" &&
    Number.isFinite(clientY)
    ? { clientX, clientY }
    : null;
}

export function isPointerInsideCanvas(
  event: PointerInput,
  canvas: HTMLCanvasElement | null | undefined,
  fallbackSize: CanvasSize = {},
): boolean {
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const client = getPointerClientPosition(event, rect);
  if (!client) return false;
  const width = Number.isFinite(rect.width)
    ? rect.width
    : (canvas.clientWidth ?? fallbackSize.width ?? 0);
  const height = Number.isFinite(rect.height)
    ? rect.height
    : (canvas.clientHeight ?? fallbackSize.height ?? 0);
  const right = Number.isFinite(rect.right) ? rect.right : rect.left + width;
  const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + height;
  return (
    client.clientX >= rect.left &&
    client.clientX < right &&
    client.clientY >= rect.top &&
    client.clientY < bottom
  );
}
