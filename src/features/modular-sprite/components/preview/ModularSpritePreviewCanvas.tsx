import { useEffect, useRef } from "react";

import type {
  ModularSpriteMaskStrokeKind,
  NormalizedPoint,
} from "@kukla2d/contracts";

import type { EditorTool } from "./ModularSpritePreviewCanvas.types.js";
import type {
  ProcessedModularSprite,
  RgbaImageData,
} from "../../domain/contracts.types.js";

type PreviewMode = "original" | "matte" | "result";

interface RegionAssignment {
  color: string;
  name: string;
}

interface ModularSpritePreviewCanvasProps {
  source: RgbaImageData;
  resultRef: React.RefObject<ProcessedModularSprite | null>;
  resultVersion: number;
  mode: PreviewMode;
  tool: EditorTool;
  selectedRegionIds: ReadonlySet<number>;
  assignments: ReadonlyMap<number, RegionAssignment>;
  showOverlays: boolean;
  showProtectedInteriors: boolean;
  onSelectRegion: (regionId: number, additive: boolean) => void;
  onStroke: (
    kind: ModularSpriteMaskStrokeKind,
    points: NormalizedPoint[],
  ) => void;
  onEnclosedChromaSeed?: (point: NormalizedPoint) => void;
  onPickColor?: (color: { r: number; g: number; b: number }) => void;
  zoom?: number;
}

const PROTECTED_INTERIOR_COLOR = [255, 0, 204] as const;
const PROTECTED_INTERIOR_OPACITY = 0.42;
const ENCLOSED_CHROMA_COLOR = [34, 211, 238] as const;
const ENCLOSED_CHROMA_OPACITY = 0.58;

function blendMask(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  color: readonly [number, number, number],
  opacity: number,
): Uint8ClampedArray {
  const blended = new Uint8ClampedArray(pixels);
  const pixelCount = Math.min(mask.length, Math.floor(blended.length / 4));
  const clampedOpacity = Math.min(1, Math.max(0, opacity));
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if ((mask[pixelIndex] ?? 0) === 0) continue;
    const offset = pixelIndex * 4;
    blended[offset] = Math.round(
      (blended[offset] ?? 0) * (1 - clampedOpacity) + color[0] * clampedOpacity,
    );
    blended[offset + 1] = Math.round(
      (blended[offset + 1] ?? 0) * (1 - clampedOpacity) +
        color[1] * clampedOpacity,
    );
    blended[offset + 2] = Math.round(
      (blended[offset + 2] ?? 0) * (1 - clampedOpacity) +
        color[2] * clampedOpacity,
    );
    // The recognized enclosed chroma is transparent in the result view. Make
    // diagnostic overlays opaque so cyan remains visible over those pixels.
    blended[offset + 3] = 255;
  }
  return blended;
}

export function blendProtectedInteriorMask(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  color: readonly [number, number, number] = PROTECTED_INTERIOR_COLOR,
  opacity = PROTECTED_INTERIOR_OPACITY,
): Uint8ClampedArray {
  return blendMask(pixels, mask, color, opacity);
}

export function blendEnclosedChromaMask(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  color: readonly [number, number, number] = ENCLOSED_CHROMA_COLOR,
  opacity = ENCLOSED_CHROMA_OPACITY,
): Uint8ClampedArray {
  return blendMask(pixels, mask, color, opacity);
}

function imageDataForMode(
  source: RgbaImageData,
  result: ProcessedModularSprite | null,
  mode: PreviewMode,
): ImageData {
  if (!result || mode === "original")
    return new ImageData(
      new Uint8ClampedArray(source.data),
      source.width,
      source.height,
    );
  if (mode === "result")
    return new ImageData(
      new Uint8ClampedArray(result.rgba),
      result.width,
      result.height,
    );
  const rgba = new Uint8ClampedArray(result.matte.length * 4);
  for (let index = 0; index < result.matte.length; index += 1) {
    const value = result.matte[index] ?? 0;
    rgba[index * 4] = value;
    rgba[index * 4 + 1] = value;
    rgba[index * 4 + 2] = value;
    rgba[index * 4 + 3] = 255;
  }
  return new ImageData(rgba, result.width, result.height);
}

export function ModularSpritePreviewCanvas({
  source,
  resultRef,
  resultVersion,
  mode,
  tool,
  selectedRegionIds,
  assignments,
  showOverlays,
  showProtectedInteriors,
  onSelectRegion,
  onStroke,
  onEnclosedChromaSeed,
  onPickColor,
  zoom = 1,
}: ModularSpritePreviewCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<NormalizedPoint[] | null>(null);

  useEffect(() => {
    const result = resultRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = imageDataForMode(source, result, mode);
    if (result && showProtectedInteriors) {
      // Protected magenta is the base layer; cyan then identifies the
      // recognized enclosed chroma subset without hiding protected-only areas.
      let blended = blendProtectedInteriorMask(
        imageData.data,
        result.protectedInteriorMask,
      );
      blended = blendEnclosedChromaMask(blended, result.enclosedChromaMask);
      imageData.data.set(blended);
    }
    context.putImageData(imageData, 0, 0);
    if (!result || mode === "matte" || !showOverlays) return;
    context.lineWidth = Math.max(
      1,
      Math.max(source.width, source.height) / 400,
    );
    context.font = `${Math.max(10, Math.max(source.width, source.height) / 70)}px sans-serif`;
    for (const region of result.regions) {
      const assignment = assignments.get(region.id);
      const isSelected = selectedRegionIds.has(region.id);
      const isExcluded = !assignment;
      context.strokeStyle = isSelected
        ? "#fbbf24"
        : (assignment?.color ?? "#64748b");
      context.fillStyle = isExcluded
        ? "rgba(71, 85, 105, 0.58)"
        : context.strokeStyle;
      context.setLineDash(isExcluded && !isSelected ? [6, 4] : []);
      if (isSelected)
        context.lineWidth = Math.max(
          2,
          Math.max(source.width, source.height) / 200,
        );
      if (region.contour.length > 1) {
        context.beginPath();
        context.moveTo(
          region.contour[0]!.x * source.width,
          region.contour[0]!.y * source.height,
        );
        for (const point of region.contour.slice(1))
          context.lineTo(point.x * source.width, point.y * source.height);
        context.closePath();
        if (isExcluded) context.fill();
        context.stroke();
      } else if (isExcluded)
        context.fillRect(
          region.bounds.x,
          region.bounds.y,
          region.bounds.width,
          region.bounds.height,
        );
      context.strokeRect(
        region.bounds.x,
        region.bounds.y,
        region.bounds.width,
        region.bounds.height,
      );
      if (isSelected)
        context.lineWidth = Math.max(
          1,
          Math.max(source.width, source.height) / 400,
        );
      context.setLineDash([]);
      context.fillStyle = isExcluded ? "#94a3b8" : context.strokeStyle;
      context.fillText(
        assignment
          ? `${region.id} · ${assignment.name}`
          : `${region.id} · Excluded`,
        region.bounds.x + 3,
        region.bounds.y + 14,
      );
    }
  }, [
    assignments,
    mode,
    resultRef,
    resultVersion,
    selectedRegionIds,
    showOverlays,
    showProtectedInteriors,
    source,
  ]);

  const normalizedPointer = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ): NormalizedPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0 touch-none bg-[linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] shadow-xl"
      style={{ width: source.width * zoom, height: source.height * zoom }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = normalizedPointer(event);
        if (tool === "eyedropper") {
          const x = Math.min(
            source.width - 1,
            Math.floor(point.x * source.width),
          );
          const y = Math.min(
            source.height - 1,
            Math.floor(point.y * source.height),
          );
          const offset = (y * source.width + x) * 4;
          onPickColor?.({
            r: source.data[offset] ?? 0,
            g: source.data[offset + 1] ?? 0,
            b: source.data[offset + 2] ?? 0,
          });
          return;
        }
        if (tool === "select") {
          const result = resultRef.current;
          if (!result) return;
          const x = Math.min(
            result.width - 1,
            Math.floor(point.x * result.width),
          );
          const y = Math.min(
            result.height - 1,
            Math.floor(point.y * result.height),
          );
          onSelectRegion(
            result.labels[y * result.width + x] ?? 0,
            event.shiftKey,
          );
          return;
        }
        if (tool === "enclosed-fill") {
          activeStroke.current = null;
          onEnclosedChromaSeed?.(point);
          return;
        }
        activeStroke.current = [point];
      }}
      onPointerMove={(event) => {
        if (
          !activeStroke.current ||
          tool === "select" ||
          tool === "eyedropper" ||
          tool === "enclosed-fill"
        )
          return;
        activeStroke.current.push(normalizedPointer(event));
      }}
      onPointerUp={(event) => {
        if (
          !activeStroke.current ||
          tool === "select" ||
          tool === "eyedropper" ||
          tool === "enclosed-fill"
        )
          return;
        activeStroke.current.push(normalizedPointer(event));
        onStroke(tool, activeStroke.current);
        activeStroke.current = null;
      }}
      aria-label="Modular sprite processing preview"
      title="Modular sprite processing preview"
    />
  );
}
