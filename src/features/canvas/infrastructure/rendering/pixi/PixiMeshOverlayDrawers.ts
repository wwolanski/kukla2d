import type { CanvasOverlayFrame } from '@/features/canvas/domain/canvasOverlayFrame.js';
import {
  clampIkTargetRadius,
  IK_TARGET_DEFAULT_RADIUS,
} from '@/features/canvas/domain/ikOverlaySizing.js';
import type { WarpLatticeFrame } from '@/features/canvas/domain/warpLatticeFrame.js';
import { weightToColor } from '@/features/canvas/domain/weightColorRamp.js';

import type { Graphics } from 'pixi.js';

type MeshWireframe = CanvasOverlayFrame['meshWireframe'];
type IkOverlay = CanvasOverlayFrame['ikOverlay'];
type WeightPaintOverlay = CanvasOverlayFrame['weightPaintOverlay'];
type WeightPaintPoints = CanvasOverlayFrame['weightPaintPoints'];

export function drawWarpLattice(graphics: Graphics, frame: WarpLatticeFrame | null, zoom: number): void {
  graphics.clear();
  if (!frame?.visible) return;
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  const { gridPoints, col, row, stride } = frame;
  if (!gridPoints?.length) return;
  for (let rowIndex = 0; rowIndex <= row; rowIndex++) {
    for (let columnIndex = 0; columnIndex < col; columnIndex++) {
      const first = gridPoints[rowIndex * stride + columnIndex];
      const second = gridPoints[rowIndex * stride + columnIndex + 1];
      if (first && second) graphics.moveTo(first.x, first.y).lineTo(second.x, second.y);
    }
  }
  for (let columnIndex = 0; columnIndex <= col; columnIndex++) {
    for (let rowIndex = 0; rowIndex < row; rowIndex++) {
      const first = gridPoints[rowIndex * stride + columnIndex];
      const second = gridPoints[(rowIndex + 1) * stride + columnIndex];
      if (first && second) graphics.moveTo(first.x, first.y).lineTo(second.x, second.y);
    }
  }
  graphics.stroke({ width: invZoom, color: 0x64dcff, alpha: 0.65 });
  gridPoints.forEach((point, index) => {
    if (!point) return;
    const rowIndex = Math.floor(index / stride);
    const columnIndex = index % stride;
    const isCorner = (rowIndex === 0 || rowIndex === row) && (columnIndex === 0 || columnIndex === col);
    graphics.circle(point.x, point.y, (isCorner ? 6 : 4.5) * invZoom)
      .fill({ color: isCorner ? 0x50c8ff : 0x32aae6, alpha: isCorner ? 0.9 : 0.85 });
  });
}

export function drawMeshWireframe(graphics: Graphics, frame: MeshWireframe, zoom: number): void {
  graphics.clear();
  if (!frame?.vertices?.length || !frame.triangles?.length) return;
  for (const triangle of frame.triangles) {
    if (!Array.isArray(triangle) || triangle.length < 3) continue;
    const [firstIndex, secondIndex, thirdIndex] = triangle;
    if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) continue;
    const first = frame.vertices[firstIndex];
    const second = frame.vertices[secondIndex];
    const third = frame.vertices[thirdIndex];
    if (!first || !second || !third) continue;
    graphics.moveTo(first.x, first.y).lineTo(second.x, second.y).lineTo(third.x, third.y).closePath();
  }
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  graphics.stroke({ width: 1.25 * invZoom, color: 0x22d3ee, alpha: 0.9 });
  for (const vertex of frame.vertices) graphics.circle(vertex.x, vertex.y, 2.5 * invZoom).fill({ color: 0xffffff, alpha: 0.95 });
}

export function drawIkConstraints(graphics: Graphics, frame: IkOverlay | null, zoom: number): void {
  graphics.clear();
  if (!frame) return;
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  for (const target of frame.targets ?? []) {
    const baseRadius = clampIkTargetRadius(target.radius ?? IK_TARGET_DEFAULT_RADIUS);
    // IK graphics live inside the zoomed viewport, so keep their world size
    // unscaled here and let the viewport apply zoom naturally.
    const radius = clampIkTargetRadius(baseRadius + (target.selected ? 3 : target.hovered ? 1.5 : 0));
    const emphasisRadius = clampIkTargetRadius(radius + 4);
    const color = target.color ?? 0x22d3ee;
    if (target.selected || target.hovered) graphics.circle(target.x, target.y, emphasisRadius)
      .stroke({ width: 3 * invZoom, color: 0xffffff, alpha: target.selected ? 0.9 : 0.55 });
    graphics.circle(target.x, target.y, radius).stroke({ width: 1.75 * invZoom, color, alpha: target.assigned ? 0.95 : 0.65 });
    graphics.moveTo(target.x - radius * 1.5, target.y).lineTo(target.x + radius * 1.5, target.y);
    graphics.moveTo(target.x, target.y - radius * 1.5).lineTo(target.x, target.y + radius * 1.5);
    graphics.stroke({ width: 1.25 * invZoom, color, alpha: 0.9 });
  }
  if (!frame.preview) return;
  const { x1, y1, x2, y2, color, alpha = 0.9 } = frame.preview;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const unitX = length > 0 ? (x2 - x1) / length : 0;
  const unitY = length > 0 ? (y2 - y1) / length : 0;
  const dash = 7 * invZoom;
  const gap = 5 * invZoom;
  for (let distance = 0; distance < length; distance += dash + gap) {
    const end = Math.min(distance + dash, length);
    graphics.moveTo(x1 + unitX * distance, y1 + unitY * distance).lineTo(x1 + unitX * end, y1 + unitY * end);
  }
  graphics.stroke({ width: 1.5 * invZoom, color, alpha });
}

export function drawWeightPaint(graphics: Graphics, frame: WeightPaintOverlay | WeightPaintPoints, zoom: number): void {
  graphics.clear();
  if (!frame) return;
  const invZoom = zoom > 0 ? 1 / zoom : 1;
  if (Array.isArray(frame)) {
    for (const point of frame) {
      const color = (Math.round(255 * point.weight) << 16) | Math.round(255 * (1 - point.weight));
      graphics.circle(point.x, point.y, 3 * invZoom).fill({ color, alpha: 0.8 });
    }
    return;
  }
  if (!frame.visible || !frame.vertices?.length) return;
  const { vertices, triangles, weights } = frame;
  if (triangles?.length && triangles.length <= 2000) for (const triangle of triangles) {
    if (!Array.isArray(triangle) || triangle.length < 3) continue;
    const [firstIndex, secondIndex, thirdIndex] = triangle;
    if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) continue;
    const first = vertices[firstIndex], second = vertices[secondIndex], third = vertices[thirdIndex];
    if (!first || !second || !third) continue;
    const { color, alpha } = weightToColor(((weights[firstIndex] ?? 0) + (weights[secondIndex] ?? 0) + (weights[thirdIndex] ?? 0)) / 3);
    graphics.moveTo(first.x, first.y).lineTo(second.x, second.y).lineTo(third.x, third.y).closePath().fill({ color, alpha });
  }
  vertices.forEach((vertex, index) => {
    const { color, alpha } = weightToColor(weights[index] ?? 0);
    graphics.circle(vertex.x, vertex.y, 2 * invZoom).fill({ color, alpha });
  });
}
